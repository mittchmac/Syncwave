import type { WebSocket } from "ws";

export type RoomMode = "mp3" | "spotify";

export interface Room {
  code: string;
  host: WebSocket | null;
  client: WebSocket | null;
  audioData: Buffer | null;
  audioName: string | null;
  mode: RoomMode;
}

const rooms = new Map<string, Room>();

export function generateRoomCode(): string {
  let code: string;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (rooms.has(code));
  return code;
}

export function createRoom(code: string, host: WebSocket, mode: RoomMode = "mp3"): Room {
  const room: Room = { code, host, client: null, audioData: null, audioName: null, mode };
  rooms.set(code, room);
  return room;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code);
}

export function deleteRoom(code: string): void {
  rooms.delete(code);
}

export function getRooms(): Map<string, Room> {
  return rooms;
}
