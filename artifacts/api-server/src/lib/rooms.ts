import type { WebSocket } from "ws";

export type RoomMode = "spotify" | "radio";

export interface LastSpotifyPlay {
  trackUri: string;
  trackName: string;
  artistName: string;
  albumArt: string;
  positionMs: number;
  /** server wall-clock ms when the payload was originally sent */
  sentAt: number;
}

export interface Room {
  code: string;
  host: WebSocket | null;
  client: WebSocket | null;
  mode: RoomMode;
  hostConnected: boolean;
  deleteTimer: ReturnType<typeof setTimeout> | null;
  /** Most recent spotify-play snapshot, used to re-sync late-joining / backgrounded listeners */
  lastSpotifyPlay: LastSpotifyPlay | null;
  /** Current radio station — sent to listeners when they join mid-session */
  lastRadioPlay: { streamUrl: string; stationName: string; favicon: string } | null;
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
    hostConnected: true, deleteTimer: null, lastSpotifyPlay: null, lastRadioPlay: null,
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
