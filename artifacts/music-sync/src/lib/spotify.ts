const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string;

function getRedirectUri(): string {
  return window.location.origin + "/";
}

const SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
].join(" ");

// ─── PKCE helpers ─────────────────────────────────────────────────────────────

function generateVerifier(length = 128): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((x) => chars[x % chars.length])
    .join("");
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(plain));
}

function base64urlEncode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// ─── Auth flow ────────────────────────────────────────────────────────────────

export async function startLogin(pendingAction: "host" | "join", pendingCode?: string): Promise<void> {
  const verifier = generateVerifier();
  const challenge = base64urlEncode(await sha256(verifier));
  const state = base64urlEncode(crypto.getRandomValues(new Uint8Array(16)).buffer as ArrayBuffer);

  sessionStorage.setItem("sp_verifier", verifier);
  sessionStorage.setItem("sp_state", state);
  sessionStorage.setItem("sp_pending_action", pendingAction);
  if (pendingCode) sessionStorage.setItem("sp_pending_code", pendingCode);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: getRedirectUri(),
    state,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

export interface CallbackResult {
  token: string;
  pendingAction: "host" | "join" | null;
  pendingCode: string | null;
}

export async function handleCallback(): Promise<CallbackResult | null> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");

  if (error) {
    window.history.replaceState({}, "", window.location.pathname);
    return null;
  }
  if (!code || !state) return null;

  const savedState = sessionStorage.getItem("sp_state");
  const verifier = sessionStorage.getItem("sp_verifier");
  if (state !== savedState || !verifier) return null;

  window.history.replaceState({}, "", window.location.pathname);
  sessionStorage.removeItem("sp_state");
  sessionStorage.removeItem("sp_verifier");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: getRedirectUri(),
      client_id: CLIENT_ID,
      code_verifier: verifier,
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();

  sessionStorage.setItem("sp_token", data.access_token);
  if (data.refresh_token) sessionStorage.setItem("sp_refresh", data.refresh_token);
  sessionStorage.setItem("sp_expires_at", String(Date.now() + data.expires_in * 1000));

  const pendingAction = (sessionStorage.getItem("sp_pending_action") as "host" | "join" | null) ?? null;
  const pendingCode = sessionStorage.getItem("sp_pending_code") ?? null;
  sessionStorage.removeItem("sp_pending_action");
  sessionStorage.removeItem("sp_pending_code");

  return { token: data.access_token, pendingAction, pendingCode };
}

export function getStoredToken(): string | null {
  const token = sessionStorage.getItem("sp_token");
  const expiresAt = sessionStorage.getItem("sp_expires_at");
  if (!token || !expiresAt) return null;
  if (Date.now() > Number(expiresAt) - 60_000) return null;
  return token;
}

export async function refreshAccessToken(): Promise<string | null> {
  const refresh = sessionStorage.getItem("sp_refresh");
  if (!refresh) return null;
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refresh,
      client_id: CLIENT_ID,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  sessionStorage.setItem("sp_token", data.access_token);
  sessionStorage.setItem("sp_expires_at", String(Date.now() + data.expires_in * 1000));
  if (data.refresh_token) sessionStorage.setItem("sp_refresh", data.refresh_token);
  return data.access_token;
}

export async function getValidToken(): Promise<string | null> {
  return getStoredToken() ?? (await refreshAccessToken());
}

export function clearTokens(): void {
  sessionStorage.removeItem("sp_token");
  sessionStorage.removeItem("sp_refresh");
  sessionStorage.removeItem("sp_expires_at");
}

export function isLoggedIn(): boolean {
  return !!sessionStorage.getItem("sp_token");
}

// ─── Web Playback SDK ─────────────────────────────────────────────────────────

export interface SpotifyPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: string, cb: (data: unknown) => void): boolean;
  removeListener(event: string): boolean;
  getCurrentState(): Promise<SpotifyPlaybackState | null>;
  setVolume(vol: number): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  activateElement(): Promise<void>;
}

export interface SpotifyPlaybackState {
  paused: boolean;
  position: number;
  duration: number;
  track_window: {
    current_track: {
      id: string;
      uri: string;
      name: string;
      album: { name: string; images: { url: string }[] };
      artists: { name: string }[];
    };
  };
}

declare global {
  interface Window {
    Spotify: {
      Player: new (options: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume?: number;
      }) => SpotifyPlayer;
    };
    onSpotifyWebPlaybackSDKReady: () => void;
  }
}

export function loadSpotifySdk(): Promise<void> {
  return new Promise((resolve) => {
    if (window.Spotify) { resolve(); return; }
    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    document.head.appendChild(script);
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
  });
}

export function createSpotifyPlayer(getToken: () => Promise<string>): SpotifyPlayer {
  return new window.Spotify.Player({
    name: "SyncWave",
    getOAuthToken: (cb) => { getToken().then(cb); },
    volume: 0.8,
  });
}

// ─── API helpers ──────────────────────────────────────────────────────────────

export interface SpotifyTrack {
  id: string;
  uri: string;
  name: string;
  artists: { name: string }[];
  album: { name: string; images: { url: string }[] };
  duration_ms: number;
}

export async function searchTracks(token: string, query: string): Promise<SpotifyTrack[]> {
  const params = new URLSearchParams({ q: query, type: "track", limit: "8" });
  const res = await fetch(`https://api.spotify.com/v1/search?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.tracks?.items ?? []) as SpotifyTrack[];
}

export async function playTrack(
  token: string,
  deviceId: string,
  uri: string,
  positionMs = 0
): Promise<void> {
  const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ uris: [uri], position_ms: positionMs }),
  });
  if (!res.ok && res.status !== 204) {
    let detail = `HTTP ${res.status}`;
    try { const j = await res.json() as { error?: { message?: string } }; detail = j?.error?.message ?? detail; } catch { /* ignore */ }
    if (res.status === 403) throw new Error("Spotify Premium is required on this device to play audio.");
    if (res.status === 404) throw new Error("Spotify player not ready. Open the Spotify app then try again.");
    throw new Error(`Spotify play failed: ${detail}`);
  }
}

export async function pauseTrack(token: string, deviceId: string): Promise<void> {
  await fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${encodeURIComponent(deviceId)}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export interface SpotifyCurrentPlayback {
  is_playing: boolean;
  progress_ms: number;
  item: SpotifyTrack | null;
  device: { id: string; name: string; is_active: boolean } | null;
}

export async function getCurrentPlayback(token: string): Promise<SpotifyCurrentPlayback | null> {
  const res = await fetch("https://api.spotify.com/v1/me/player?additional_types=track", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 204) return null;
  if (!res.ok) return null;
  return res.json() as Promise<SpotifyCurrentPlayback>;
}

export async function seekTrack(token: string, deviceId: string, positionMs: number): Promise<void> {
  await fetch(
    `https://api.spotify.com/v1/me/player/seek?device_id=${encodeURIComponent(deviceId)}&position_ms=${positionMs}`,
    { method: "PUT", headers: { Authorization: `Bearer ${token}` } }
  );
}

export function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
