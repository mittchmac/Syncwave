# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **WebSocket**: ws library on the api-server

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Artifacts

### music-sync (React + Vite, preview at `/`)
Synchronized music playback app "SyncWave". Supports two modes:

**MP3 mode:** Host uploads an MP3, both devices play via Web Audio API (AudioBufferSourceNode).
- Uses timestamp-based scheduling for near-perfect sync (~0ms)
- Critical: Web Audio API only, NOT HTMLAudioElement (blocked by iOS Safari from WS callbacks)
- AudioContext must be unlocked via user gesture ("Tap to Enable Audio" screen)

**Radio mode:** Host picks a live US radio station from Radio Browser API (no login needed). Both host and listener play the same stream URL simultaneously.
- `artifacts/music-sync/src/lib/radioBrowser.ts` — `fetchStationsByTag()`, `fetchTopUSStations()`, `searchStationsByName()`, `FEATURED_GENRES` (16 US genres), HTTPS-only, deduplication
- US-only filtering enforced (no global/English fallbacks); automatic mirror failover
- Station picker has: search bar (debounced 500ms), ⭐ Top Stations category, 16 genre chips, 🇺🇸 US Only badge
- Station list shows state + bitrate; duplicates removed by name normalisation
- Host selects genre/searches → station list → picks station → sends `radio-play` WS message → listener auto-plays
- Server stores `lastRadioPlay` in room; sent in `joined-room` for mid-session joins
- HTMLAudioElement used (not Web Audio API — radio is live streaming, not file sync)

**Apple Music:** Coming Soon button in mode picker (requires Apple Developer account — MusicKit JS + developer JWT token)

**Spotify mode:** Both devices log into Spotify, host searches a track, both play via Spotify Web Playback SDK.
- PKCE OAuth flow (no client secret needed) — `artifacts/music-sync/src/lib/spotify.ts`
- `VITE_SPOTIFY_CLIENT_ID` secret required (from developer.spotify.com)
- Redirect URI: `https://6182fc2f-ced2-4b6f-afa7-25cce6e760d5-00-1qismab4ygrkc.spock.replit.dev/`
- After Spotify login redirect, `pendingAction` in sessionStorage auto-rejoins/recreates the room
- Spotify Web Playback SDK does NOT work on iOS Safari (no MSE support)
- Spotify Premium required for both devices

### api-server (Express 5, port 8080, preview at `/api`, WebSocket at `/ws`)
- WebSocket server: `artifacts/api-server/src/lib/websocket.ts`
- Room state: `artifacts/api-server/src/lib/rooms.ts` — includes `mode: "mp3" | "spotify" | "radio"`, `lastSpotifyPlay`, `lastRadioPlay` fields
- Audio upload/serve: `artifacts/api-server/src/routes/audio.ts` (multer, in-memory)
- WebSocket messages: `create-room` (with mode), `join-room`, `play`, `pause`, `seek`, `audio-ready`, `spotify-play`, `spotify-pause`, `spotify-seek`, `radio-play`, `radio-stop`

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
