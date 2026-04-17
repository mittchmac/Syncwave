/**
 * Apple MusicKit JS integration for SyncWave.
 *
 * MusicKit JS docs: https://developer.apple.com/documentation/musickitjs
 *
 * Flow:
 *  1. Server generates a developer JWT → GET /api/apple-music-token
 *  2. MusicKit.configure() with that token
 *  3. User logs in with Apple ID (music.authorize()) → userToken
 *  4. Host uses the MusicKit API to play/seek/poll
 *  5. Listener receives WS events and mirrors playback
 */

declare global {
  interface Window {
    MusicKit: MusicKitStatic;
    musicKitInstance?: MusicKitInstance;
  }
}

export interface MusicKitStatic {
  configure(config: {
    developerToken: string;
    app: { name: string; build: string };
  }): MusicKitInstance;
  getInstance(): MusicKitInstance;
}

export interface MusicKitInstance {
  authorize(): Promise<string>;
  unauthorize(): Promise<void>;
  readonly isAuthorized: boolean;
  readonly musicUserToken: string;
  readonly nowPlayingItem: AppleMusicItem | null;
  readonly playbackState: number;
  readonly currentPlaybackTime: number;
  readonly currentPlaybackDuration: number;
  play(): Promise<void>;
  pause(): Promise<void>;
  seekToTime(time: number): Promise<void>;
  setQueue(options: { song?: string; songs?: string[]; startPosition?: number }): Promise<void>;
  changeToMediaAtIndex(index: number): Promise<void>;
  addEventListener(event: string, handler: (e: unknown) => void): void;
  removeEventListener(event: string, handler: (e: unknown) => void): void;
  api: MusicKitAPI;
}

export interface MusicKitAPI {
  search(term: string, options?: { types?: string; limit?: number }): Promise<AppleSearchResult>;
  song(id: string): Promise<AppleMusicItem>;
}

export interface AppleMusicItem {
  id: string;
  attributes: {
    name: string;
    artistName: string;
    albumName: string;
    artwork: { url: string; width: number; height: number };
    durationInMillis: number;
  };
}

export interface AppleSearchResult {
  songs?: { data: AppleMusicItem[] };
}

let _devToken: string | null = null;
let _devTokenExpiry = 0;

export async function fetchDeveloperToken(): Promise<string | null> {
  if (_devToken && Date.now() < _devTokenExpiry) return _devToken;
  try {
    const res = await fetch("/api/apple-music-token");
    if (!res.ok) return null;
    const { token, expiresIn } = await res.json() as { token: string; expiresIn: number };
    _devToken = token;
    _devTokenExpiry = Date.now() + (expiresIn - 60) * 1000; // refresh 1 min before expiry
    return token;
  } catch {
    return null;
  }
}

/** Load MusicKit JS script and configure with developer token */
export async function loadMusicKit(): Promise<MusicKitInstance | null> {
  if (window.musicKitInstance) return window.musicKitInstance;

  const devToken = await fetchDeveloperToken();
  if (!devToken) return null;

  await new Promise<void>((resolve, reject) => {
    if ((window as Window).MusicKit) { resolve(); return; }
    const script = document.createElement("script");
    script.src = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load MusicKit JS"));
    document.head.appendChild(script);
  });

  const instance = window.MusicKit.configure({
    developerToken: devToken,
    app: { name: "SyncWave", build: "1.0" },
  });
  window.musicKitInstance = instance;
  return instance;
}

export function getArtworkUrl(item: AppleMusicItem, size = 300): string {
  return item.attributes.artwork.url
    .replace("{w}", String(size))
    .replace("{h}", String(size));
}

/** Apple Music playback state numbers */
export const PlaybackState = {
  none: 0,
  loading: 1,
  playing: 2,
  paused: 3,
  stopped: 4,
  ended: 5,
  seeking: 6,
  waiting: 8,
  stalled: 9,
  completed: 10,
} as const;
