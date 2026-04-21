export interface RadioStation {
  stationuuid: string;
  name: string;
  url_resolved: string;
  favicon: string;
  tags: string;
  countrycode: string;
  bitrate: number;
}

const BASE = "https://de1.api.radio-browser.info/json";

export async function searchStations(query: string): Promise<RadioStation[]> {
  try {
    const res = await fetch(
      `${BASE}/stations/search?name=${encodeURIComponent(query)}&limit=20&order=clickcount&reverse=true`,
      { headers: { "User-Agent": "SyncWave/1.0" } },
    );
    if (!res.ok) return [];
    return res.json() as Promise<RadioStation[]>;
  } catch {
    return [];
  }
}

export async function getTopUSStations(): Promise<RadioStation[]> {
  try {
    const res = await fetch(
      `${BASE}/stations/topclick?limit=20&countrycode=US`,
      { headers: { "User-Agent": "SyncWave/1.0" } },
    );
    if (!res.ok) return [];
    return res.json() as Promise<RadioStation[]>;
  } catch {
    return [];
  }
}

export const FEATURED_GENRES = [
  "pop", "rock", "hip hop", "country", "jazz", "classical", "edm", "r&b",
];
