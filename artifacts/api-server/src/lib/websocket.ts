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

type WsMessage =
  | { type: "create-room" }
  | { type: "join-room"; code: string }
  | { type: "play"; startAt: number }
  | { type: "pause" }
  | { type: "seek"; position: number };

function send(ws: WebSocket, data: object) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    logger.info("WebSocket client connected");
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

      if (msg.type === "create-room") {
        const code = generateRoomCode();
        createRoom(code, ws);
        myRoomCode = code;
        myRole = "host";
        send(ws, { type: "room-created", code });
        logger.info({ code }, "Room created");
        return;
      }

      if (msg.type === "join-room") {
        const room = getRoom(msg.code);
        if (!room) {
          send(ws, { type: "error", message: "Room not found" });
          return;
        }
        if (room.client) {
          send(ws, { type: "error", message: "Room is full" });
          return;
        }
        room.client = ws;
        myRoomCode = msg.code;
        myRole = "client";

        send(ws, { type: "joined-room", code: msg.code, hasAudio: !!room.audioData, audioName: room.audioName });
        if (room.host) {
          send(room.host, { type: "client-joined" });
        }
        logger.info({ code: msg.code }, "Client joined room");
        return;
      }

      if (msg.type === "play") {
        if (!myRoomCode || myRole !== "host") {
          send(ws, { type: "error", message: "Only host can send play" });
          return;
        }
        const room = getRoom(myRoomCode);
        if (!room) return;
        const startAt = msg.startAt ?? Date.now() + 500;
        if (room.client) {
          send(room.client, { type: "play", startAt });
        }
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
        if (room.client) {
          send(room.client, { type: "pause" });
        }
        send(ws, { type: "pause" });
        return;
      }

      if (msg.type === "seek") {
        if (!myRoomCode || myRole !== "host") return;
        const room = getRoom(myRoomCode);
        if (!room) return;
        if (room.client) {
          send(room.client, { type: "seek", position: msg.position });
        }
        return;
      }
    });

    ws.on("close", () => {
      if (!myRoomCode) return;
      const room = getRoom(myRoomCode);
      if (!room) return;

      if (myRole === "host") {
        if (room.client) {
          send(room.client, { type: "host-disconnected" });
        }
        deleteRoom(myRoomCode);
        logger.info({ code: myRoomCode }, "Host disconnected, room deleted");
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
