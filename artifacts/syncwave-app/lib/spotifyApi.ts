const API = "https://api.spotify.com/v1";

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export interface SpotifyTrack {
  uri: string;
  name: string;
  artists: { name: string }[];
  album: { name: string; images: { url: string }[] };
  duration_ms: number;
}

export interface SpotifyPlayerState {
  is_playing: boolean;
  progress_ms: number;
  item: SpotifyTrack | null;
  device: { id: string; name: string; type: string } | null;
}

export async function getCurrentPlayback(token: string): Promise<SpotifyPlayerState | null> {
  try {
    const res = await fetch(`${API}/me/player`, { headers: authHeader(token) });
    if (res.status === 204) return null;
    if (!res.ok) return null;
    return res.json() as Promise<SpotifyPlayerState>;
  } catch {
    return null;
  }
}

export async function playTrack(token: string, uri: string, positionMs: number): Promise<boolean> {
  try {
    const res = await fetch(`${API}/me/player/play`, {
      method: "PUT",
      headers: { ...authHeader(token), "Content-Type": "application/json" },
      body: JSON.stringify({ uris: [uri], position_ms: Math.max(0, positionMs) }),
    });
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}

export async function seekTo(token: string, positionMs: number): Promise<void> {
  try {
    await fetch(`${API}/me/player/seek?position_ms=${Math.max(0, Math.floor(positionMs))}`, {
      method: "PUT",
      headers: authHeader(token),
    });
  } catch {}
}

export async function getAvailableDevices(token: string): Promise<{ id: string; name: string; is_active: boolean }[]> {
  try {
    const res = await fetch(`${API}/me/player/devices`, { headers: authHeader(token) });
    if (!res.ok) return [];
    const data = await res.json() as { devices: { id: string; name: string; is_active: boolean }[] };
    return data.devices ?? [];
  } catch {
    return [];
  }
}
