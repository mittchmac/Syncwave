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

const r = () => Math.floor(Math.random() * 10);
const r1 = () => Math.floor(1 + Math.random() * 9);

const SPICY_CODES: (() => string)[] = [
  () => `69${r()}${r()}`,          // 69XX
  () => `${r1()}${r()}69`,         // XX69
  () => `${r1()}69${r()}`,         // X69X
  () => `6969`,
  () => `6900`,
  () => `6969`,
  () => `8008`,
  () => `8080`,
  () => `8008`,
  () => `${r1()}${r()}69`,         // extra weight on XX69
  () => `69${r()}${r()}`,          // extra weight on 69XX
];

export function generateRoomCode(): string {
  let code: string;
  do {
    const fn = SPICY_CODES[Math.floor(Math.random() * SPICY_CODES.length)];
    code = fn();
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
