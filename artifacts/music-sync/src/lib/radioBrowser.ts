// Radio Browser API — https://api.radio-browser.info/
// No API key required. Using multiple mirrors for resilience.
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
  { label: "Soul",         tag: "soul",         emoji: "✨" },
];

// ── Legitimacy filter & scoring ────────────────────────────────────────────

/** Hard baseline: HTTPS stream, non-empty name, ≥128 kbps */
function isValid(s: RadioStation): boolean {
  return (
    !!s.url_resolved?.startsWith("https://") &&
    !!s.name?.trim() &&
    s.bitrate >= 128
  );
}

/**
 * Reject stations whose names are dominated by non-ASCII characters.
 * This catches foreign-language stations that slip through countrycode=US.
 */
function isAsciiName(s: RadioStation): boolean {
  const name = s.name;
  const ascii = (name.match(/[\x20-\x7E]/g) || []).length;
  return ascii / name.length >= 0.85;
}

/**
 * Score how likely a station is to be a real over-the-air US broadcast.
 *
 * Real OTA signals:
 *  +5  FCC call letters  (K or W followed by 2-4 uppercase letters)  e.g. WABC, KROC
 *  +4  Frequency number  (FM: 87.5-107.9 | AM: 530-1700)            e.g. "101.5", "AM 1040"
 *  +2  Contains "FM" or "AM" as a word                               e.g. "Hank FM", "Talk AM"
 *  +2  votes ≥ 10   (real stations accumulate listeners over time)
 *  +2  votes ≥ 50
 *  +1  clickcount ≥ 100
 *  +1  has a favicon  (internet-only junk rarely bothers)
 */
function realnessScore(s: RadioStation): number {
  let score = 0;
  const name = s.name;

  // FCC call letters: word boundary + K or W + 2-4 capital letters
  if (/\b[KW][A-Z]{2,4}\b/.test(name)) score += 5;

  // FM frequency range 87.5–107.9 MHz
  if (/\b(8[7-9]|9\d|10[0-7])\.\d\b/.test(name)) score += 4;
  // AM frequency range 530–1700 kHz
  if (/\b(5[3-9]\d|[6-9]\d{2}|1[0-6]\d{2}|1700)\b/.test(name)) score += 4;

  // "FM" or "AM" as a standalone word
  if (/\bFM\b/.test(name)) score += 2;
  if (/\bAM\b/.test(name)) score += 2;

  if (s.votes >= 50)  score += 2;
  else if (s.votes >= 10) score += 2;

  if (s.clickcount >= 100) score += 1;
  if (s.favicon) score += 1;

  return score;
}

/** Remove near-duplicate stations (strip HD/2/3/Alt suffixes, keep highest-voted) */
function deduplicate(stations: RadioStation[]): RadioStation[] {
  const seen = new Map<string, RadioStation>();
  for (const s of stations) {
    const key = s.name
      .toLowerCase()
      .replace(/\b(hd\d?|hd2|hd3|alt|plus)\b/gi, "")
      .replace(/[^a-z0-9]/g, "")
      .trim();
    const existing = seen.get(key);
    if (!existing || s.votes > existing.votes) seen.set(key, s);
  }
  return Array.from(seen.values());
}

/** Sort: realness score DESC, then votes DESC as tiebreaker */
function rankStations(stations: RadioStation[]): RadioStation[] {
  return stations.sort((a, b) => {
    const scoreDiff = realnessScore(b) - realnessScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    return b.votes - a.votes;
  });
}

// ── API helpers ────────────────────────────────────────────────────────────

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
    } catch { /* try next mirror */ }
  }
  _apiBase = MIRRORS[0];
  return _apiBase;
}

const BASE_PARAMS: Record<string, string> = {
  countrycode: "US",
  order: "votes",
  reverse: "true",
  hidebroken: "true",
  bitrateMin: "128",
  is_https: "true",
};

async function queryTag(tag: string, limit = 150): Promise<RadioStation[]> {
  const api = await getApi();
  const params = new URLSearchParams({ ...BASE_PARAMS, tag, limit: String(limit) });
  const res = await fetch(`${api}/stations/bytag/${encodeURIComponent(tag)}?${params}`, {
    headers: { "User-Agent": "SyncWave/1.0" },
  });
  if (!res.ok) return [];
  return (await res.json()) as RadioStation[];
}

async function querySearch(extra: Record<string, string>, limit = 150): Promise<RadioStation[]> {
  const api = await getApi();
  const params = new URLSearchParams({ ...BASE_PARAMS, limit: String(limit), ...extra });
  const res = await fetch(`${api}/stations/search?${params}`, {
    headers: { "User-Agent": "SyncWave/1.0" },
  });
  if (!res.ok) return [];
  return (await res.json()) as RadioStation[];
}

function process(raw: RadioStation[], limit = 25): RadioStation[] {
  const filtered = raw.filter(s => isValid(s) && isAsciiName(s));
  const deduped = deduplicate(filtered);
  return rankStations(deduped).slice(0, limit);
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Fetch real US stations by genre tag, ranked by OTA legitimacy */
export async function fetchStationsByTag(tag: string): Promise<RadioStation[]> {
  try {
    return process(await queryTag(tag, 150));
  } catch {
    return [];
  }
}

/** Fetch the top real US stations across all genres */
export async function fetchTopUSStations(): Promise<RadioStation[]> {
  try {
    return process(await querySearch({}, 150));
  } catch {
    return [];
  }
}

/** Search US stations by name — ranked by OTA legitimacy */
export async function searchStationsByName(name: string): Promise<RadioStation[]> {
  if (!name.trim()) return [];
  try {
    return process(await querySearch({ name: name.trim() }, 60), 20);
  } catch {
    return [];
  }
}
