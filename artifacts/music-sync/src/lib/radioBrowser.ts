// Radio Browser API — https://api.radio-browser.info/
// Using multiple mirrors for resilience
const MIRRORS = [
  "https://de1.api.radio-browser.info/json",
  "https://fr1.api.radio-browser.info/json",
  "https://nl1.api.radio-browser.info/json",
];

export interface RadioStation {
  stationuuid: string;
  name: string;
  url_resolved: string;
  favicon: string;
  tags: string;
  country: string;
  countrycode: string;
  state: string;
  votes: number;
  clickcount: number;
  bitrate: number;
}

export const FEATURED_GENRES: { label: string; tag: string; emoji: string }[] = [
  { label: "Pop",          tag: "pop",          emoji: "🎤" },
  { label: "Rock",         tag: "rock",         emoji: "🎸" },
  { label: "Classic Rock", tag: "classic rock", emoji: "🪨" },
  { label: "Hip-Hop",      tag: "hip-hop",      emoji: "🎧" },
  { label: "Country",      tag: "country",      emoji: "🤠" },
  { label: "Jazz",         tag: "jazz",         emoji: "🎷" },
  { label: "R&B",          tag: "rnb",          emoji: "🎵" },
  { label: "Blues",        tag: "blues",        emoji: "🎶" },
  { label: "Classical",    tag: "classical",    emoji: "🎻" },
  { label: "Electronic",   tag: "electronic",   emoji: "🎛️" },
  { label: "Christian",    tag: "christian",    emoji: "✝️" },
  { label: "News / Talk",  tag: "news",         emoji: "📻" },
  { label: "Sports",       tag: "sports",       emoji: "🏈" },
  { label: "Oldies",       tag: "oldies",       emoji: "📼" },
  { label: "Lofi",         tag: "lofi",         emoji: "☕" },
  { label: "Soul",         tag: "soul",         emoji: "✨" },
];

function isValid(s: RadioStation): boolean {
  return (
    !!s.url_resolved?.startsWith("https://") &&
    !!s.name?.trim() &&
    s.bitrate >= 96
  );
}

/** Remove near-duplicate stations by normalising the name (strip HD/2/3, trailing numbers, etc.) */
function deduplicate(stations: RadioStation[]): RadioStation[] {
  const seen = new Map<string, RadioStation>();
  for (const s of stations) {
    const key = s.name
      .toLowerCase()
      .replace(/\b(hd\d?|2|3|alt|plus)\b/g, "")
      .replace(/[^a-z0-9]/g, "")
      .trim();
    const existing = seen.get(key);
    if (!existing || s.votes > existing.votes) {
      seen.set(key, s);
    }
  }
  return Array.from(seen.values());
}

let _apiBase: string | null = null;

async function getApi(): Promise<string> {
  if (_apiBase) return _apiBase;
  for (const mirror of MIRRORS) {
    try {
      const res = await fetch(`${mirror}/stations/search?limit=1`, {
        headers: { "User-Agent": "SyncWave/1.0" },
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) { _apiBase = mirror; return mirror; }
    } catch { /* try next */ }
  }
  _apiBase = MIRRORS[0];
  return _apiBase;
}

async function queryTag(tag: string, limit = 60): Promise<RadioStation[]> {
  const api = await getApi();
  const params = new URLSearchParams({
    tag,
    countrycode: "US",
    order: "votes",
    reverse: "true",
    limit: String(limit),
    hidebroken: "true",
    bitrateMin: "96",
    is_https: "true",
  });
  const res = await fetch(`${api}/stations/bytag/${encodeURIComponent(tag)}?${params}`, {
    headers: { "User-Agent": "SyncWave/1.0" },
  });
  if (!res.ok) return [];
  return (await res.json()) as RadioStation[];
}

async function querySearch(params: Record<string, string>): Promise<RadioStation[]> {
  const api = await getApi();
  const p = new URLSearchParams({
    countrycode: "US",
    order: "votes",
    reverse: "true",
    limit: "60",
    hidebroken: "true",
    bitrateMin: "96",
    is_https: "true",
    ...params,
  });
  const res = await fetch(`${api}/stations/search?${p}`, {
    headers: { "User-Agent": "SyncWave/1.0" },
  });
  if (!res.ok) return [];
  return (await res.json()) as RadioStation[];
}

/** Fetch US stations by genre tag */
export async function fetchStationsByTag(tag: string): Promise<RadioStation[]> {
  try {
    const raw = await queryTag(tag, 80);
    const filtered = raw.filter(isValid);
    const deduped = deduplicate(filtered);
    // Sort by votes descending, return top 25
    return deduped
      .sort((a, b) => b.votes - a.votes)
      .slice(0, 25);
  } catch {
    return [];
  }
}

/** Fetch the top-voted US stations across all genres */
export async function fetchTopUSStations(): Promise<RadioStation[]> {
  try {
    const raw = await querySearch({ limit: "80" });
    const filtered = raw.filter(isValid);
    const deduped = deduplicate(filtered);
    return deduped
      .sort((a, b) => b.votes - a.votes)
      .slice(0, 25);
  } catch {
    return [];
  }
}

/** Search US stations by name */
export async function searchStationsByName(name: string): Promise<RadioStation[]> {
  if (!name.trim()) return [];
  try {
    const raw = await querySearch({ name: name.trim(), limit: "40" });
    const filtered = raw.filter(isValid);
    return deduplicate(filtered)
      .sort((a, b) => b.votes - a.votes)
      .slice(0, 20);
  } catch {
    return [];
  }
}
