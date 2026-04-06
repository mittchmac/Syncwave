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
Synchronized music playback app "SyncWave".
- Host creates a room and gets a 4-digit code
- Guest joins with the code
- Host uploads MP3 (stored in memory on the server)
- Host clicks Play — both devices play simultaneously via WebSocket sync
- Uses timestamp-based scheduling for tight synchronization

### api-server (Express 5, port 8080, preview at `/api`, WebSocket at `/ws`)
- WebSocket server: `artifacts/api-server/src/lib/websocket.ts`
- Room state: `artifacts/api-server/src/lib/rooms.ts`
- Audio upload/serve: `artifacts/api-server/src/routes/audio.ts` (multer, in-memory)
- WebSocket messages: `create-room`, `join-room`, `play`, `pause`, `seek`, `audio-ready`, etc.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
