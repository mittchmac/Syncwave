import React, {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from "react";
import { AppState } from "react-native";

export type Phase = "idle" | "hosting" | "joining" | "joined";
export type ConnStatus = "disconnected" | "connecting" | "connected";
export type RoomMode = "spotify" | "radio";

export interface SpotifyPlayEvent {
  trackUri: string;
  trackName: string;
  artistName: string;
  albumArt: string;
  positionMs: number;
  startAt: number;
}

export interface RadioPlayEvent {
  streamUrl: string;
  stationName: string;
  favicon: string;
}

interface SyncContextValue {
  phase: Phase;
  connStatus: ConnStatus;
  roomCode: string | null;
  roomMode: RoomMode | null;
  listenerCount: number;
  hostDisconnected: boolean;
  lastSpotifyPlay: SpotifyPlayEvent | null;
  lastRadioPlay: RadioPlayEvent | null;
  lastMessage: Record<string, unknown> | null;
  createRoom: (mode: RoomMode) => void;
  joinRoom: (code: string) => void;
  leaveRoom: () => void;
  sendSpotifyPlay: (evt: SpotifyPlayEvent) => void;
  sendSpotifyPause: () => void;
  sendRadioPlay: (streamUrl: string, stationName: string, favicon: string) => void;
  sendRadioStop: () => void;
  requestSync: () => void;
  sendMessage: (data: object) => void;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [connStatus, setConnStatus] = useState<ConnStatus>("disconnected");
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [roomMode, setRoomMode] = useState<RoomMode | null>(null);
  const [listenerCount, setListenerCount] = useState(0);
  const [hostDisconnected, setHostDisconnected] = useState(false);
  const [lastSpotifyPlay, setLastSpotifyPlay] = useState<SpotifyPlayEvent | null>(null);
  const [lastRadioPlay, setLastRadioPlay] = useState<RadioPlayEvent | null>(null);
  const [lastMessage, setLastMessage] = useState<Record<string, unknown> | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const roomCodeRef = useRef<string | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isConnectingRef = useRef(false);

  const sendRef = useRef<(data: object) => void>(() => {});

  const send = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  sendRef.current = send;

  const handleMessageRef = useRef<(msg: Record<string, unknown>) => void>(() => {});
  handleMessageRef.current = (msg: Record<string, unknown>) => {
    setLastMessage(msg);
    switch (msg.type) {
      case "room-created":
        setRoomCode(msg.code as string);
        roomCodeRef.current = msg.code as string;
        setRoomMode(msg.mode as RoomMode);
        setPhase("hosting");
        phaseRef.current = "hosting";
        setListenerCount(0);
        break;
      case "joined-room":
        setRoomCode(msg.code as string);
        roomCodeRef.current = msg.code as string;
        setRoomMode(msg.mode as RoomMode);
        setPhase("joined");
        phaseRef.current = "joined";
        if (msg.lastSpotifyPlay) setLastSpotifyPlay(msg.lastSpotifyPlay as SpotifyPlayEvent);
        if (msg.lastRadioPlay) setLastRadioPlay(msg.lastRadioPlay as RadioPlayEvent);
        break;
      case "client-joined":
        setListenerCount((n) => n + 1);
        break;
      case "client-disconnected":
        setListenerCount((n) => Math.max(0, n - 1));
        break;
      case "host-disconnected":
        setHostDisconnected(true);
        break;
      case "host-reconnected":
        setHostDisconnected(false);
        break;
      case "spotify-play":
      case "sync-state":
        setHostDisconnected(false);
        setLastSpotifyPlay({
          trackUri: msg.trackUri as string,
          trackName: msg.trackName as string,
          artistName: msg.artistName as string,
          albumArt: msg.albumArt as string,
          positionMs: msg.positionMs as number,
          startAt: msg.startAt as number,
        });
        break;
      case "spotify-pause":
        break;
      case "radio-play":
        setHostDisconnected(false);
        setLastRadioPlay({
          streamUrl: msg.streamUrl as string,
          stationName: msg.stationName as string,
          favicon: msg.favicon as string,
        });
        break;
      case "radio-stop":
        setLastRadioPlay(null);
        break;
      default:
        break;
    }
  };

  const connectWs = useCallback(() => {
    if (isConnectingRef.current) return;
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    if (!domain) return;

    isConnectingRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    const ws = new WebSocket(`wss://${domain}/ws`);
    wsRef.current = ws;
    setConnStatus("connecting");

    ws.onopen = () => {
      isConnectingRef.current = false;
      setConnStatus("connected");
      const code = roomCodeRef.current;
      const p = phaseRef.current;
      if (code && (p === "hosting" || p === "joined")) {
        ws.send(JSON.stringify({ type: "rejoin-room", code }));
      }
    };

    ws.onmessage = (e: MessageEvent) => {
      try {
        handleMessageRef.current(JSON.parse(e.data as string));
      } catch {}
    };

    ws.onclose = () => {
      isConnectingRef.current = false;
      setConnStatus("disconnected");
      reconnectTimerRef.current = setTimeout(() => connectWs(), 2500);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connectWs();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connectWs]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") return;
      const ws = wsRef.current;
      const closed =
        !ws ||
        ws.readyState === WebSocket.CLOSED ||
        ws.readyState === WebSocket.CLOSING;
      if (closed) {
        connectWs();
      } else if (phaseRef.current === "joined") {
        sendRef.current({ type: "request-sync" });
      }
    });
    return () => sub.remove();
  }, [connectWs]);

  const createRoom = useCallback(
    (mode: RoomMode) => send({ type: "create-room", mode }),
    [send],
  );

  const joinRoom = useCallback(
    (code: string) => {
      setPhase("joining");
      phaseRef.current = "joining";
      roomCodeRef.current = code;
      send({ type: "join-room", code });
    },
    [send],
  );

  const leaveRoom = useCallback(() => {
    setPhase("idle");
    phaseRef.current = "idle";
    setRoomCode(null);
    roomCodeRef.current = null;
    setRoomMode(null);
    setListenerCount(0);
    setHostDisconnected(false);
    setLastSpotifyPlay(null);
    setLastRadioPlay(null);
    wsRef.current?.close();
  }, []);

  const sendSpotifyPlay = useCallback((evt: SpotifyPlayEvent) => send({ type: "spotify-play", ...evt }), [send]);
  const sendSpotifyPause = useCallback(() => send({ type: "spotify-pause" }), [send]);
  const sendRadioPlay = useCallback((streamUrl: string, stationName: string, favicon: string) =>
    send({ type: "radio-play", streamUrl, stationName, favicon }), [send]);
  const sendRadioStop = useCallback(() => send({ type: "radio-stop" }), [send]);
  const requestSync = useCallback(() => send({ type: "request-sync" }), [send]);
  const sendMessage = useCallback((data: object) => send(data), [send]);

  return (
    <SyncContext.Provider value={{
      phase, connStatus, roomCode, roomMode, listenerCount, hostDisconnected,
      lastSpotifyPlay, lastRadioPlay, lastMessage,
      createRoom, joinRoom, leaveRoom,
      sendSpotifyPlay, sendSpotifyPause,
      sendRadioPlay, sendRadioStop,
      requestSync, sendMessage,
    }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used within SyncProvider");
  return ctx;
}
