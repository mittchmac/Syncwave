// Radio Browser API — https://api.radio-browser.info/
// No API key required. Using de1 mirror which is reliably online.
const API = "https://de1.api.radio-browser.info/json";

export interface RadioStation {
  stationuuid: string;
  name: string;
  url_resolved: string;
  favicon: string;
  tags: string;
  country: string;
  votes: number;
  bitrate: number;
}

export const FEATURED_GENRES: { label: string; tag: string; emoji: string }[] = [
  { label: "Pop", tag: "pop", emoji: "🎤" },
  { label: "Rock", tag: "rock", emoji: "🎸" },
  { label: "Electronic", tag: "electronic", emoji: "🎛️" },
  { label: "Hip-Hop", tag: "hip-hop", emoji: "🎧" },
  { label: "Jazz", tag: "jazz", emoji: "🎷" },
  { label: "Classical", tag: "classical", emoji: "🎻" },
  { label: "Country", tag: "country", emoji: "🤠" },
  { label: "R&B", tag: "rnb", emoji: "🎵" },
  { label: "Reggae", tag: "reggae", emoji: "🌴" },
  { label: "Ambient", tag: "ambient", emoji: "🌊" },
  { label: "Lofi", tag: "lofi", emoji: "☕" },
  { label: "Metal", tag: "metal", emoji: "🤘" },
  { label: "Soul", tag: "soul", emoji: "✨" },
  { label: "News", tag: "news", emoji: "📻" },
];

export async function fetchStationsByTag(tag: string): Promise<RadioStation[]> {
  try {
    const url =
      `${API}/stations/bytag/${encodeURIComponent(tag)}` +
      `?order=votes&reverse=true&limit=60&hidebroken=true`;
    const res = await fetch(url, {
      headers: { "User-Agent": "SyncWave/1.0" },
    });
    if (!res.ok) return [];
    const all = (await res.json()) as RadioStation[];
    return all
      .filter((s) => s.url_resolved?.startsWith("https://") && s.name?.trim())
      .slice(0, 25);
  } catch {
    return [];
  }
}
