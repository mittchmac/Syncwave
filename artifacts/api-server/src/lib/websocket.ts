import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import { logger } from "./logger";
import {
  generateRoomCode,
  createRoom,
  getRoom,
  deleteRoom,
  getRooms,
} from "./rooms";

// Grace period before the room is actually deleted after the host drops.
// The host spends most of their time in the Spotify app, not in SyncWave.
// iOS / Android will freeze the browser tab aggressively — 10 minutes gives
// plenty of room to switch back, even after locking the phone for a song or two.
const HOST_GRACE_MS = 600_000; // 10 minutes

type WsMessage =
  | { type: "create-room"; mode?: "mp3" | "spotify" }
  | { type: "join-room"; code: string }
  | { type: "rejoin-room"; code: string }
  | { type: "ping" }
  | { type: "request-sync" }
  | { type: "play"; startAt: number }
  | { type: "pause" }
  | { type: "seek"; position: number }
  | {
      type: "spotify-play";
      trackUri: string;
      trackName: string;
      artistName: string;
      albumArt: string;
      positionMs: number;
      startAt: number;
    }
  | { type: "spotify-pause" }
  | { type: "spotify-seek"; positionMs: number }
  | { type: "radio-play"; streamUrl: string; stationName: string; favicon: string }
  | { type: "radio-stop" }
  | { type: "request-resync" };

function send(ws: WebSocket, data: object) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  // Server-side heartbeat — pings every 20s to keep the connection alive
  // through Replit's proxy idle timeout
  const heartbeat = setInterval(() => {
    wss.clients.forEach((client) => {
      const c = client as WebSocket & { isAlive?: boolean };
      if (c.isAlive === false) { c.terminate(); return; }
      c.isAlive = false;
      c.ping();
    });
  }, 20_000);

  wss.on("close", () => clearInterval(heartbeat));

  wss.on("connection", (ws) => {
    logger.info("WebSocket client connected");
    const liveWs = ws as WebSocket & { isAlive?: boolean };
    liveWs.isAlive = true;
    liveWs.on("pong", () => { liveWs.isAlive = true; });

    let myRoomCode: string | null = null;
    let myRole: "host" | "client" | null = null;

    ws.on("message", (raw) => {
      let msg: WsMessage;
      try {
        msg = JSON.parse(raw.toString()) as WsMessage;
      } catch {
        send(ws, { type: "error", message: "Invalid JSON" });
        return;
      }

      // Client-side keepalive — just reset isAlive and respond
      if (msg.type === "ping") {
        liveWs.isAlive = true;
        send(ws, { type: "pong" });
        return;
      }

      if (msg.type === "create-room") {
        const code = generateRoomCode();
        const mode = msg.mode ?? "mp3";
        createRoom(code, ws, mode);
        myRoomCode = code;
        myRole = "host";
        send(ws, { type: "room-created", code, mode });
        logger.info({ code, mode }, "Room created");
        return;
      }

      // Host rejoins after a transient disconnect (within the grace window)
      if (msg.type === "rejoin-room") {
        const room = getRoom(msg.code);
        if (!room) {
          send(ws, { type: "error", message: "Room expired" });
          return;
        }
        if (room.hostConnected) {
          send(ws, { type: "error", message: "Room already has a host" });
          return;
        }
        // Cancel the deletion timer
        if (room.deleteTimer) {
          clearTimeout(room.deleteTimer);
          room.deleteTimer = null;
        }
        room.host = ws;
        room.hostConnected = true;
        myRoomCode = msg.code;
        myRole = "host";
        send(ws, { type: "room-created", code: msg.code, mode: room.mode });
        if (room.client) {
          send(room.client, { type: "host-reconnected" });
          send(ws, { type: "client-joined" });
        }
        logger.info({ code: msg.code }, "Host rejoined room");
        return;
      }

      if (msg.type === "join-room") {
        const room = getRoom(msg.code);
        if (!room) {
          send(ws, { type: "error", message: "Room not found" });
          return;
        }
        // Allow rejoin if the existing client socket is already dead (stale reference
        // from a previous connection that closed before the server processed the new one)
        const existingDead =
          room.client &&
          (room.client.readyState === WebSocket.CLOSED ||
            room.client.readyState === WebSocket.CLOSING);
        if (room.client && !existingDead) {
          send(ws, { type: "error", message: "Room is full" });
          return;
        }
        room.client = ws;
        myRoomCode = msg.code;
        myRole = "client";

        // If the host is already syncing, send the current track state so the
        // listener doesn't have to wait for the next poll to start playing
        const joinedPayload: Record<string, unknown> = {
          type: "joined-room",
          code: msg.code,
          mode: room.mode,
          hasAudio: !!room.audioData,
          audioName: room.audioName,
          hostConnected: room.hostConnected,
        };
        if (room.lastSpotifyPlay) {
          joinedPayload.lastSpotifyPlay = {
            ...room.lastSpotifyPlay,
            sentAt: Date.now(),
            positionMs: room.lastSpotifyPlay.positionMs +
              (Date.now() - room.lastSpotifyPlay.sentAt),
          };
        }
        if (room.lastRadioPlay) {
          joinedPayload.lastRadioPlay = room.lastRadioPlay;
        }
        send(ws, joinedPayload);
        if (room.host) {
          send(room.host, { type: "client-joined" });
        }
        logger.info({ code: msg.code, mode: room.mode }, "Client joined room");
        return;
      }

      // Listener requests the current track state (sent when tab regains focus)
      if (msg.type === "request-sync") {
        if (!myRoomCode || myRole !== "client") return;
        const room = getRoom(myRoomCode);
        if (!room) return;
        // Spotify: reply directly from cached state
        if (room.lastSpotifyPlay) {
          const elapsed = Date.now() - room.lastSpotifyPlay.sentAt;
          send(ws, {
            type: "sync-state",
            trackUri: room.lastSpotifyPlay.trackUri,
            trackName: room.lastSpotifyPlay.trackName,
            artistName: room.lastSpotifyPlay.artistName,
            albumArt: room.lastSpotifyPlay.albumArt,
            positionMs: room.lastSpotifyPlay.positionMs + elapsed,
            startAt: Date.now() + 500,
          });
        }
        // Radio: reply with last station
        if (room.lastRadioPlay) {
          send(ws, { type: "radio-play", ...room.lastRadioPlay });
        }
        return;
      }

      // Listener asks host to re-broadcast its current MP3 position (force-sync)
      if (msg.type === "request-resync") {
        if (!myRoomCode || myRole !== "client") return;
        const room = getRoom(myRoomCode);
        if (!room || !room.host) return;
        send(room.host, { type: "resync-requested" });
        return;
      }

      // ── MP3 playback controls ──────────────────────────────────────────────

      if (msg.type === "play") {
        if (!myRoomCode || myRole !== "host") {
          send(ws, { type: "error", message: "Only host can send play" });
          return;
        }
        const room = getRoom(myRoomCode);
        if (!room) return;
        const startAt = msg.startAt ?? Date.now() + 500;
        if (room.client) send(room.client, { type: "play", startAt });
        send(ws, { type: "play", startAt });
        return;
      }

      if (msg.type === "pause") {
        if (!myRoomCode || myRole !== "host") {
          send(ws, { type: "error", message: "Only host can send pause" });
          return;
        }
        const room = getRoom(myRoomCode);
        if (!room) return;
        if (room.client) send(room.client, { type: "pause" });
        send(ws, { type: "pause" });
        return;
      }

      if (msg.type === "seek") {
        if (!myRoomCode || myRole !== "host") return;
        const room = getRoom(myRoomCode);
        if (!room) return;
        if (room.client) send(room.client, { type: "seek", position: msg.position });
        return;
      }

      // ── Spotify controls ───────────────────────────────────────────────────

      if (msg.type === "spotify-play") {
        if (!myRoomCode || myRole !== "host") {
          send(ws, { type: "error", message: "Only host can send spotify-play" });
          return;
        }
        const room = getRoom(myRoomCode);
        if (!room) return;

        // Snapshot the state so late/backgrounded listeners can re-sync
        room.lastSpotifyPlay = {
          trackUri: msg.trackUri,
          trackName: msg.trackName,
          artistName: msg.artistName,
          albumArt: msg.albumArt,
          positionMs: msg.positionMs,
          sentAt: Date.now(),
        };

        const payload = {
          type: "spotify-play",
          trackUri: msg.trackUri,
          trackName: msg.trackName,
          artistName: msg.artistName,
          albumArt: msg.albumArt,
          positionMs: msg.positionMs,
          startAt: msg.startAt,
        };
        // Only forward to listener — host manages its own playback directly
        if (room.client) send(room.client, payload);
        logger.info({ trackUri: msg.trackUri }, "Spotify play broadcast");
        return;
      }

      if (msg.type === "spotify-pause") {
        if (!myRoomCode || myRole !== "host") return;
        const room = getRoom(myRoomCode);
        if (!room) return;
        room.lastSpotifyPlay = null; // clear — host has paused
        if (room.client) send(room.client, { type: "spotify-pause" });
        return;
      }

      if (msg.type === "spotify-seek") {
        if (!myRoomCode || myRole !== "host") return;
        const room = getRoom(myRoomCode);
        if (!room) return;
        if (room.client) send(room.client, { type: "spotify-seek", positionMs: msg.positionMs });
        return;
      }

      if (msg.type === "radio-play") {
        if (!myRoomCode || myRole !== "host") return;
        const room = getRoom(myRoomCode);
        if (!room) return;
        room.lastRadioPlay = { streamUrl: msg.streamUrl, stationName: msg.stationName, favicon: msg.favicon };
        const payload = { type: "radio-play", streamUrl: msg.streamUrl, stationName: msg.stationName, favicon: msg.favicon };
        if (room.client) send(room.client, payload);
        logger.info({ stationName: msg.stationName }, "Radio play broadcast");
        return;
      }

      if (msg.type === "radio-stop") {
        if (!myRoomCode || myRole !== "host") return;
        const room = getRoom(myRoomCode);
        if (!room) return;
        room.lastRadioPlay = null;
        if (room.client) send(room.client, { type: "radio-stop" });
        return;
      }
    });

    ws.on("close", () => {
      if (!myRoomCode) return;
      const room = getRoom(myRoomCode);
      if (!room) return;

      if (myRole === "host") {
        room.hostConnected = false;
        room.host = null;
        logger.info({ code: myRoomCode }, "Host disconnected — grace period started");

        // Give the host 45s to reconnect before notifying the listener and deleting the room
        const code = myRoomCode;
        room.deleteTimer = setTimeout(() => {
          const r = getRoom(code);
          if (r && !r.hostConnected) {
            if (r.client) send(r.client, { type: "host-disconnected" });
            deleteRoom(code);
            logger.info({ code }, "Host did not reconnect — room deleted");
          }
        }, HOST_GRACE_MS);

      } else if (myRole === "client") {
        room.client = null;
        if (room.host) {
          send(room.host, { type: "client-disconnected" });
        }
        logger.info({ code: myRoomCode }, "Client disconnected from room");
      }
    });

    ws.on("error", (err) => {
      logger.error({ err }, "WebSocket error");
    });
  });

  logger.info("WebSocket server ready at /ws");
  return wss;
}
