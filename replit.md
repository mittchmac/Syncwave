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
Synchronized music playback web app "SyncWave". Supports two active modes:

**Radio mode:** Host picks a live US radio station from Radio Browser API (no login needed). Both host and listener play the same stream URL simultaneously.
- `artifacts/music-sync/src/lib/radioBrowser.ts` — `fetchStationsByTag()`, `fetchTopUSStations()`, `searchStationsByName()`, `FEATURED_GENRES` (16 US genres), HTTPS-only, deduplication
- US-only filtering enforced; automatic mirror failover
- Station picker has: search bar (debounced 500ms), ⭐ Top Stations category, 16 genre chips, 🇺🇸 US Only badge
- Host selects genre/searches → station list → picks station → sends `radio-play` WS message → listener auto-plays
- Server stores `lastRadioPlay` in room; sent in `joined-room` for mid-session joins

**Apple Music:** Coming Soon (requires Apple Developer account — MusicKit JS + developer JWT token)

**Spotify mode:** Both devices log into Spotify, host searches a track, both play via Spotify Web Playback SDK.
- PKCE OAuth flow (no client secret needed) — `artifacts/music-sync/src/lib/spotify.ts`
- `VITE_SPOTIFY_CLIENT_ID` secret required (from developer.spotify.com)
- After Spotify login redirect, `pendingAction` in sessionStorage auto-rejoins/recreates the room
- Spotify Web Playback SDK does NOT work on iOS Safari (no MSE support)
- Spotify Premium required for both devices

### syncwave-app (Expo React Native, preview at `/syncwave-app/`)
Native mobile app for iOS background audio support.

**Purpose:** Solves iOS background WebSocket disconnection issues for the web app. Radio plays via expo-audio (stays active in background). Spotify is controlled via REST API polling.

**Key files:**
- `app/_layout.tsx` — wraps with SyncProvider, SpotifyProvider, AudioProvider
- `app/index.tsx` — home screen (Host / Join)
- `app/host.tsx` — mode picker (Radio / Spotify), station search, active room with QR code display
- `app/join.tsx` — code entry, QR scanner, joined listener view
- `context/SyncContext.tsx` — WebSocket to api-server, room state, reconnect on foreground
- `context/SpotifyContext.tsx` — PKCE OAuth with expo-auth-session + AsyncStorage
- `context/AudioContext.tsx` — expo-audio player with background audio
- `lib/radioBrowser.ts` — Radio Browser API helper
- `lib/spotifyApi.ts` — Spotify REST API calls (playback control)
- `constants/colors.ts` — dark-only theme (ocean/green, matches web)

**Spotify redirect URI:** `syncwave-app://spotify` — must be registered in Spotify Developer Dashboard
**Spotify client ID env:** `EXPO_PUBLIC_SPOTIFY_CLIENT_ID` (mapped from `VITE_SPOTIFY_CLIENT_ID` in dev script)
**Background audio:** `UIBackgroundModes: ["audio"]` in app.json, `shouldPlayInBackground: true` via expo-audio
**QR code:** encodes `https://{DOMAIN}/music-sync?room={CODE}` so non-app users can open web app directly

**Packages:** expo-audio, expo-camera, expo-auth-session, expo-clipboard, react-native-qrcode-svg, expo-haptics, expo-linear-gradient

### api-server (Express 5, port 8080, preview at `/api`, WebSocket at `/ws`)
- WebSocket server: `artifacts/api-server/src/lib/websocket.ts`
- Room state: `artifacts/api-server/src/lib/rooms.ts` — includes `mode`, `lastSpotifyPlay`, `lastRadioPlay`, `lastApplePlay` fields
- WebSocket messages: `create-room`, `join-room`, `rejoin-room`, `request-sync`, `spotify-play`, `spotify-pause`, `spotify-seek`, `radio-play`, `radio-stop`, `apple-play`, `apple-pause`, `apple-seek`
- Host grace period: 10 min before room deletion on disconnect

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
