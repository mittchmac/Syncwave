import type { WebSocket } from "ws";

export type RoomMode = "spotify" | "radio" | "apple";

export interface LastSpotifyPlay {
  trackUri: string;
  trackName: string;
  artistName: string;
  albumArt: string;
  positionMs: number;
  /** server wall-clock ms when the payload was originally sent */
  sentAt: number;
}

export interface LastApplePlay {
  songId: string;
  songName: string;
  artistName: string;
  albumArt: string;
  positionMs: number;
  sentAt: number;
}

export interface Room {
  code: string;
  host: WebSocket | null;
  client: WebSocket | null;
  mode: RoomMode;
  hostConnected: boolean;
  deleteTimer: ReturnType<typeof setTimeout> | null;
  lastSpotifyPlay: LastSpotifyPlay | null;
  lastRadioPlay: { streamUrl: string; stationName: string; favicon: string } | null;
  lastApplePlay: LastApplePlay | null;
}

const rooms = new Map<string, Room>();

export function generateRoomCode(): string {
  let code: string;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (rooms.has(code));
  return code;
}

export function createRoom(code: string, host: WebSocket, mode: RoomMode = "spotify"): Room {
  const room: Room = {
    code, host, client: null, mode,
    hostConnected: true, deleteTimer: null,
    lastSpotifyPlay: null, lastRadioPlay: null, lastApplePlay: null,
  };
  rooms.set(code, room);
  return room;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code);
}

export function deleteRoom(code: string): void {
  const room = rooms.get(code);
  if (room?.deleteTimer) clearTimeout(room.deleteTimer);
  rooms.delete(code);
}

export function getRooms(): Map<string, Room> {
  return rooms;
}
