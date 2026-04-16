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
  countrycode: string;
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

function baseParams(extra: string) {
  return `?order=votes&reverse=true&limit=80&hidebroken=true&bitrateMin=128&is_https=true${extra}`;
}

function isValid(s: RadioStation) {
  return s.url_resolved?.startsWith("https://") && s.name?.trim() && s.bitrate >= 96;
}

async function query(tag: string, extra: string): Promise<RadioStation[]> {
  const url = `${API}/stations/bytag/${encodeURIComponent(tag)}${baseParams(extra)}`;
  const res = await fetch(url, { headers: { "User-Agent": "SyncWave/1.0" } });
  if (!res.ok) return [];
  return (await res.json()) as RadioStation[];
}

export async function fetchStationsByTag(tag: string): Promise<RadioStation[]> {
  try {
    // First pass: US stations with ≥128 kbps — high quality, reputable
    const us = await query(tag, "&countrycode=US");
    const usFiltered = us.filter(isValid).slice(0, 20);

    if (usFiltered.length >= 6) return usFiltered;

    // Second pass: English-language stations globally (US, UK, CA, AU, NZ, etc.)
    const en = await query(tag, "&language=english");
    const enFiltered = en.filter(isValid).slice(0, 20);

    if (enFiltered.length >= 4) return enFiltered;

    // Final fallback: global high-bitrate stations (already filtered HTTPS + hidebroken)
    const global = await query(tag, "");
    return global.filter(isValid).slice(0, 20);
  } catch {
    return [];
  }
}
