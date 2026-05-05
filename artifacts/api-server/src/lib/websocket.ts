import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import { logger } from "./logger";
import {
  generateRoomCode,
  createRoom,
  getRoom,
  deleteRoom,
} from "./rooms";

const HOST_GRACE_MS = 600_000; // 10 minutes

type WsMessage =
  | { type: "create-room"; mode?: "spotify" | "radio" | "apple" }
  | { type: "join-room"; code: string }
  | { type: "rejoin-room"; code: string }
  | { type: "ping" }
  | { type: "request-sync" }
  | { type: "gps-beacon"; lat: number; lng: number }
  | { type: "sync-ping"; sentAt: number; streamAgeMs: number }
  | {
      type: "spotify-play";
      trackUri: string; trackName: string; artistName: string;
      albumArt: string; positionMs: number; startAt: number;
    }
  | { type: "spotify-pause" }
  | { type: "spotify-seek"; positionMs: number }
  | { type: "radio-play"; streamUrl: string; stationName: string; favicon: string }
  | { type: "radio-stop" }
  | {
      type: "apple-play";
      songId: string; songName: string; artistName: string;
      albumArt: string; positionMs: number; startAt: number;
    }
  | { type: "apple-pause" }
  | { type: "apple-seek"; positionMs: number };

function send(ws: WebSocket, data: object) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

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

      if (msg.type === "ping") {
        liveWs.isAlive = true;
        send(ws, { type: "pong" });
        return;
      }

      if (msg.type === "create-room") {
        const code = generateRoomCode();
        const mode = msg.mode ?? "spotify";
        createRoom(code, ws, mode);
        myRoomCode = code;
        myRole = "host";
        send(ws, { type: "room-created", code, mode });
        logger.info({ code, mode }, "Room created");
        return;
      }

      if (msg.type === "rejoin-room") {
        const room = getRoom(msg.code);
        if (!room) { send(ws, { type: "error", message: "Room expired" }); return; }
        if (room.hostConnected) { send(ws, { type: "error", message: "Room already has a host" }); return; }
        if (room.deleteTimer) { clearTimeout(room.deleteTimer); room.deleteTimer = null; }
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
        if (!room) { send(ws, { type: "error", message: "Room not found" }); return; }
        const existingDead =
          room.client &&
          (room.client.readyState === WebSocket.CLOSED || room.client.readyState === WebSocket.CLOSING);
        if (room.client && !existingDead) { send(ws, { type: "error", message: "Room is full" }); return; }
        room.client = ws;
        myRoomCode = msg.code;
        myRole = "client";

        const joinedPayload: Record<string, unknown> = {
          type: "joined-room",
          code: msg.code,
          mode: room.mode,
          hostConnected: room.hostConnected,
        };
        if (room.lastSpotifyPlay) {
          joinedPayload.lastSpotifyPlay = {
            ...room.lastSpotifyPlay,
            positionMs: room.lastSpotifyPlay.positionMs + (Date.now() - room.lastSpotifyPlay.sentAt),
            sentAt: Date.now(),
          };
        }
        if (room.lastRadioPlay) joinedPayload.lastRadioPlay = room.lastRadioPlay;
        if (room.lastApplePlay) {
          joinedPayload.lastApplePlay = {
            ...room.lastApplePlay,
            positionMs: room.lastApplePlay.positionMs + (Date.now() - room.lastApplePlay.sentAt),
            sentAt: Date.now(),
          };
        }

        send(ws, joinedPayload);
        if (room.host) send(room.host, { type: "client-joined" });
        logger.info({ code: msg.code, mode: room.mode }, "Client joined room");
        return;
      }

      if (msg.type === "request-sync") {
        if (!myRoomCode || myRole !== "client") return;
        const room = getRoom(myRoomCode);
        if (!room) return;
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
        if (room.lastRadioPlay) send(ws, { type: "radio-play", ...room.lastRadioPlay });
        if (room.lastApplePlay) {
          const elapsed = Date.now() - room.lastApplePlay.sentAt;
          send(ws, {
            type: "apple-sync",
            songId: room.lastApplePlay.songId,
            songName: room.lastApplePlay.songName,
            artistName: room.lastApplePlay.artistName,
            albumArt: room.lastApplePlay.albumArt,
            positionMs: room.lastApplePlay.positionMs + elapsed,
            startAt: Date.now() + 500,
          });
        }
        return;
      }

      // ── GPS beacon — both roles can send; relay to the other side ──────────

      if (msg.type === "gps-beacon") {
        const room = myRoomCode ? getRoom(myRoomCode) : null;
        if (!room) return;
        if (myRole === "host" && room.client) {
          send(room.client, { type: "host-gps", lat: msg.lat, lng: msg.lng });
        } else if (myRole === "client" && room.host) {
          send(room.host, { type: "client-gps", lat: msg.lat, lng: msg.lng });
        }
        return;
      }

      // ── Sync ping — host only; relay to client ─────────────────────────────

      if (msg.type === "sync-ping") {
        if (!myRoomCode || myRole !== "host") return;
        const room = getRoom(myRoomCode);
        if (!room) return;
        if (room.client) {
          send(room.client, {
            type: "sync-ping",
            sentAt: msg.sentAt,
            streamAgeMs: msg.streamAgeMs,
            relayedAt: Date.now(),
          });
        }
        return;
      }

      // ── Spotify controls ───────────────────────────────────────────────────

      if (msg.type === "spotify-play") {
        if (!myRoomCode || myRole !== "host") { send(ws, { type: "error", message: "Only host can send spotify-play" }); return; }
        const room = getRoom(myRoomCode);
        if (!room) return;
        room.lastSpotifyPlay = { trackUri: msg.trackUri, trackName: msg.trackName, artistName: msg.artistName, albumArt: msg.albumArt, positionMs: msg.positionMs, sentAt: Date.now() };
        if (room.client) send(room.client, { type: "spotify-play", trackUri: msg.trackUri, trackName: msg.trackName, artistName: msg.artistName, albumArt: msg.albumArt, positionMs: msg.positionMs, startAt: msg.startAt });
        logger.info({ trackUri: msg.trackUri }, "Spotify play broadcast");
        return;
      }

      if (msg.type === "spotify-pause") {
        if (!myRoomCode || myRole !== "host") return;
        const room = getRoom(myRoomCode);
        if (!room) return;
        room.lastSpotifyPlay = null;
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

      // ── Radio controls ─────────────────────────────────────────────────────

      if (msg.type === "radio-play") {
        if (!myRoomCode || myRole !== "host") return;
        const room = getRoom(myRoomCode);
        if (!room) return;
        room.lastRadioPlay = { streamUrl: msg.streamUrl, stationName: msg.stationName, favicon: msg.favicon };
        if (room.client) send(room.client, { type: "radio-play", streamUrl: msg.streamUrl, stationName: msg.stationName, favicon: msg.favicon });
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

      // ── Apple Music controls ───────────────────────────────────────────────

      if (msg.type === "apple-play") {
        if (!myRoomCode || myRole !== "host") { send(ws, { type: "error", message: "Only host can send apple-play" }); return; }
        const room = getRoom(myRoomCode);
        if (!room) return;
        room.lastApplePlay = { songId: msg.songId, songName: msg.songName, artistName: msg.artistName, albumArt: msg.albumArt, positionMs: msg.positionMs, sentAt: Date.now() };
        if (room.client) send(room.client, { type: "apple-play", songId: msg.songId, songName: msg.songName, artistName: msg.artistName, albumArt: msg.albumArt, positionMs: msg.positionMs, startAt: msg.startAt });
        logger.info({ songId: msg.songId }, "Apple Music play broadcast");
        return;
      }

      if (msg.type === "apple-pause") {
        if (!myRoomCode || myRole !== "host") return;
        const room = getRoom(myRoomCode);
        if (!room) return;
        room.lastApplePlay = null;
        if (room.client) send(room.client, { type: "apple-pause" });
        return;
      }

      if (msg.type === "apple-seek") {
        if (!myRoomCode || myRole !== "host") return;
        const room = getRoom(myRoomCode);
        if (!room) return;
        if (room.client) send(room.client, { type: "apple-seek", positionMs: msg.positionMs });
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
        if (room.host) send(room.host, { type: "client-disconnected" });
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
