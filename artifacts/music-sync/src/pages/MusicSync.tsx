import { useEffect, useRef, useState, useCallback } from "react";
import {
  Music, Upload, Play, Pause, Wifi, WifiOff, Users, Radio,
  Copy, Check, Volume2, LogOut, X, RefreshCw, SkipBack, SkipForward,
} from "lucide-react";
import {
  startLogin, handleCallback, getStoredToken, getValidToken, clearTokens,
  loadSpotifySdk, createSpotifyPlayer, playTrack, pauseTrack, getCurrentPlayback,
  type SpotifyPlayer,
} from "../lib/spotify";

type Phase = "idle" | "creating" | "hosting" | "joining" | "joined";
type ConnectionStatus = "disconnected" | "connecting" | "connected";
type RoomMode = "mp3" | "spotify";

type WsEvent =
  | { type: "room-created"; code: string; mode: RoomMode }
  | { type: "joined-room"; code: string; mode: RoomMode; hasAudio: boolean; audioName: string | null }
  | { type: "client-joined" }
  | { type: "client-disconnected" }
  | { type: "host-disconnected" }
  | { type: "audio-ready"; audioName: string }
  | { type: "play"; startAt: number }
  | { type: "pause" }
  | { type: "seek"; position: number }
  | { type: "spotify-play"; trackUri: string; trackName: string; artistName: string; albumArt: string; positionMs: number; startAt: number }
  | { type: "spotify-pause" }
  | { type: "spotify-seek"; positionMs: number }
  | { type: "error"; message: string };

function getWsUrl() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

const POLL_INTERVAL_MS = 2500;
const RESYNC_INTERVAL_MS = 30_000;
const SYNC_LEAD_MS = 1500; // how far ahead to schedule playback

export default function MusicSync() {
  // ── Core state ─────────────────────────────────────────────────────────────
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [connStatus, setConnStatus] = useState<ConnectionStatus>("disconnected");
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [roomMode, setRoomMode] = useState<RoomMode>("mp3");
  const [choosingMode, setChoosingMode] = useState(false);
  const [clientConnected, setClientConnected] = useState(false);
  const [hostDisconnected, setHostDisconnected] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ── Auto-action after OAuth redirect ──────────────────────────────────────
  const [autoAction, setAutoAction] = useState<
    { type: "host"; mode: RoomMode } | { type: "join"; code: string } | null
  >(null);

  // ── MP3 state ──────────────────────────────────────────────────────────────
  const [audioName, setAudioName] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [audioTime, setAudioTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioLoading, setAudioLoading] = useState(false);

  // ── Spotify state ──────────────────────────────────────────────────────────
  const [spotifyToken, setSpotifyToken] = useState<string | null>(null);
  const [spotifyDeviceId, setSpotifyDeviceId] = useState<string | null>(null);
  const [spotifyReady, setSpotifyReady] = useState(false);
  const [spotifyError, setSpotifyError] = useState<string | null>(null);
  const [spotifyPlaying, setSpotifyPlaying] = useState(false);
  const [nowPlaying, setNowPlaying] = useState<{
    uri: string; name: string; artist: string; albumArt: string;
  } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [noActivePlayback, setNoActivePlayback] = useState(false);
  const [shouldInitSdk, setShouldInitSdk] = useState(false);
  const [spotifyActivated, setSpotifyActivated] = useState(false);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const wsRef = useRef<WebSocket | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const myRoomCodeRef = useRef<string>("");
  const myPhaseRef = useRef<Phase>("idle");
  const roomModeRef = useRef<RoomMode>("mp3");
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const playbackStartCtxTimeRef = useRef<number>(0);
  const playbackOffsetRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const isPlayingRef = useRef(false);
  const spotifyPlayerRef = useRef<SpotifyPlayer | null>(null);
  const spotifyDeviceIdRef = useRef<string | null>(null);
  const pendingSpotifyPlayRef = useRef<{ uri: string; positionMs: number; startAt: number } | null>(null);
  // Polling refs
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTrackUriRef = useRef<string | null>(null);
  const lastIsPlayingRef = useRef<boolean>(false);
  const lastResyncTimeRef = useRef<number>(0);
  const spotifyActivatedRef = useRef(false);
  const isSyncingRef = useRef(false);
  const lastSpotifyPlayRef = useRef<{ uri: string; positionMs: number; startAt: number } | null>(null);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const send = useCallback((data: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  }, []);

  const showError = useCallback((msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 4000);
  }, []);

  const fmt = (t: number) => {
    if (!isFinite(t)) return "0:00";
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // ── MP3 audio helpers ──────────────────────────────────────────────────────
  const stopTracking = () => cancelAnimationFrame(rafRef.current);

  const startTracking = (ctx: AudioContext, startCtxTime: number, offset: number, duration: number) => {
    stopTracking();
    const tick = () => {
      if (ctx.currentTime >= startCtxTime) {
        const pos = offset + (ctx.currentTime - startCtxTime);
        setAudioTime(Math.min(pos, duration));
        if (pos >= duration) {
          isPlayingRef.current = false;
          setIsPlaying(false);
          stopTracking();
          return;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const loadAudioFromUrl = useCallback(async (url: string) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    setAudioLoading(true);
    try {
      const res = await fetch(url);
      const arrayBuf = await res.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuf);
      audioBufferRef.current = decoded;
      setAudioDuration(decoded.duration);
      setAudioTime(0);
      playbackOffsetRef.current = 0;
    } catch (err) {
      console.error("Audio decode error", err);
    } finally {
      setAudioLoading(false);
    }
  }, []);

  const playNow = useCallback((startAtMs: number, offsetSeconds?: number) => {
    const ctx = audioCtxRef.current;
    const buffer = audioBufferRef.current;
    if (!ctx || !buffer) return;
    try { sourceNodeRef.current?.stop(); } catch { /* already stopped */ }
    const offset = offsetSeconds ?? playbackOffsetRef.current;
    playbackOffsetRef.current = offset;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const delaySeconds = (startAtMs - Date.now()) / 1000;
    const startCtxTime = ctx.currentTime + Math.max(delaySeconds, 0);
    source.start(startCtxTime, offset);
    sourceNodeRef.current = source;
    playbackStartCtxTimeRef.current = startCtxTime;
    isPlayingRef.current = true;
    setIsPlaying(true);
    source.onended = () => {
      if (isPlayingRef.current) { isPlayingRef.current = false; setIsPlaying(false); stopTracking(); }
    };
    startTracking(ctx, startCtxTime, offset, buffer.duration);
  }, []);

  const pauseNow = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || !sourceNodeRef.current) return;
    const pos = playbackOffsetRef.current + (ctx.currentTime - playbackStartCtxTimeRef.current);
    playbackOffsetRef.current = Math.max(0, pos);
    try { sourceNodeRef.current.stop(); } catch { /* already stopped */ }
    isPlayingRef.current = false;
    setIsPlaying(false);
    stopTracking();
  }, []);

  const seekTo = useCallback((pos: number) => {
    playbackOffsetRef.current = pos;
    setAudioTime(pos);
    if (isPlayingRef.current) playNow(Date.now(), pos);
  }, [playNow]);

  // ── Spotify play helpers (listener side) ───────────────────────────────────
  const execSpotifyPlay = useCallback(async (uri: string, positionMs: number, startAt: number) => {
    const delay = startAt - Date.now();
    const deviceId = spotifyDeviceIdRef.current;

    // Store as pending if device not ready OR audio not yet activated by user gesture
    if (!deviceId || !spotifyActivatedRef.current) {
      pendingSpotifyPlayRef.current = { uri, positionMs, startAt };
      return;
    }

    const doPlay = async (adjustedPositionMs: number) => {
      try {
        const token = await getValidToken();
        if (!token || !spotifyDeviceIdRef.current) return;
        await playTrack(token, spotifyDeviceIdRef.current, uri, adjustedPositionMs);
        setSpotifyPlaying(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Spotify playback failed.";
        setSpotifyError(msg);
        setSpotifyPlaying(false);
      }
    };

    if (delay > 150) {
      setTimeout(() => doPlay(positionMs), delay - 100);
    } else {
      const elapsed = Math.max(0, -delay);
      await doPlay(positionMs + elapsed);
    }
  }, []);

  const execSpotifyPause = useCallback(async () => {
    const token = await getValidToken();
    const deviceId = spotifyDeviceIdRef.current;
    if (!token || !deviceId) return;
    await pauseTrack(token, deviceId);
    setSpotifyPlaying(false);
  }, []);

  const execSpotifySeek = useCallback(async (positionMs: number) => {
    const player = spotifyPlayerRef.current;
    if (player) await player.seek(positionMs);
  }, []);

  // ── Spotify polling (host side) ────────────────────────────────────────────
  const pollAndSync = useCallback(async () => {
    const token = await getValidToken();
    if (!token) return;

    const state = await getCurrentPlayback(token);

    if (!state || !state.item) {
      setNoActivePlayback(true);
      return;
    }
    setNoActivePlayback(false);

    const { is_playing, progress_ms, item } = state;
    const trackUri = item.uri;
    const trackName = item.name;
    const artistName = item.artists[0]?.name ?? "";
    const albumArt = item.album.images[0]?.url ?? "";

    const trackChanged = trackUri !== lastTrackUriRef.current;
    const playStateChanged = is_playing !== lastIsPlayingRef.current;
    const timeForResync = is_playing && (Date.now() - lastResyncTimeRef.current > RESYNC_INTERVAL_MS);

    if (is_playing && (trackChanged || playStateChanged || timeForResync)) {
      const startAt = Date.now() + SYNC_LEAD_MS;
      const syncedPositionMs = progress_ms + SYNC_LEAD_MS;

      send({
        type: "spotify-play",
        trackUri,
        trackName,
        artistName,
        albumArt,
        positionMs: syncedPositionMs,
        startAt,
      });

      // Also start / re-sync the host's own SDK device on track change
      if (trackChanged && spotifyActivatedRef.current && spotifyDeviceIdRef.current) {
        execSpotifyPlay(trackUri, syncedPositionMs, startAt);
      }

      setNowPlaying({ uri: trackUri, name: trackName, artist: artistName, albumArt });
      setSpotifyPlaying(true);
      lastTrackUriRef.current = trackUri;
      lastResyncTimeRef.current = Date.now();

    } else if (!is_playing && playStateChanged) {
      send({ type: "spotify-pause" });
      setSpotifyPlaying(false);
    }

    lastIsPlayingRef.current = is_playing;

    if (trackChanged) {
      setNowPlaying({ uri: trackUri, name: trackName, artist: artistName, albumArt });
      lastTrackUriRef.current = trackUri;
    }
  }, [send, execSpotifyPlay]);

  const handleStartSync = useCallback(async () => {
    isSyncingRef.current = true;
    setIsSyncing(true);
    lastTrackUriRef.current = null;
    lastIsPlayingRef.current = false;
    lastResyncTimeRef.current = 0;
    await pollAndSync();
    syncIntervalRef.current = setInterval(pollAndSync, POLL_INTERVAL_MS);
  }, [pollAndSync]);

  const handleStopSync = useCallback(() => {
    isSyncingRef.current = false;
    setIsSyncing(false);
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }
    send({ type: "spotify-pause" });
    // Also pause host's SDK device
    if (spotifyDeviceIdRef.current) {
      getValidToken().then((token) => {
        if (token && spotifyDeviceIdRef.current) pauseTrack(token, spotifyDeviceIdRef.current).catch(() => {});
      });
    }
    setSpotifyPlaying(false);
  }, [send]);

  // ── WebSocket ──────────────────────────────────────────────────────────────
  const connectWs = useCallback(() => {
    setConnStatus("connecting");
    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;

    ws.onopen = () => setConnStatus("connected");

    ws.onmessage = (event) => {
      let msg: WsEvent;
      try { msg = JSON.parse(event.data as string) as WsEvent; }
      catch { return; }

      if (msg.type === "room-created") {
        setRoomCode(msg.code);
        myRoomCodeRef.current = msg.code;
        roomModeRef.current = msg.mode;
        setRoomMode(msg.mode);
        setChoosingMode(false);
        setPhase("hosting");
        myPhaseRef.current = "hosting";
        if (msg.mode === "spotify") setShouldInitSdk(true);

      } else if (msg.type === "joined-room") {
        setRoomCode(msg.code);
        myRoomCodeRef.current = msg.code;
        roomModeRef.current = msg.mode;
        setRoomMode(msg.mode);
        setPhase("joined");
        myPhaseRef.current = "joined";
        if (msg.mode === "spotify") setShouldInitSdk(true);
        if (msg.mode === "mp3" && msg.hasAudio && msg.audioName) {
          setAudioName(msg.audioName);
          loadAudioFromUrl(`/api/rooms/${msg.code}/audio`);
        }

      } else if (msg.type === "client-joined") {
        setClientConnected(true);
      } else if (msg.type === "client-disconnected") {
        setClientConnected(false);
      } else if (msg.type === "host-disconnected") {
        setHostDisconnected(true);
        if (roomModeRef.current === "mp3") pauseNow();
        else { setSpotifyPlaying(false); setNowPlaying(null); }

      } else if (msg.type === "audio-ready") {
        setAudioName(msg.audioName);
        loadAudioFromUrl(`/api/rooms/${myRoomCodeRef.current}/audio`);

      } else if (msg.type === "play") {
        playNow(msg.startAt);
      } else if (msg.type === "pause") {
        pauseNow();
      } else if (msg.type === "seek") {
        seekTo(msg.position);

      } else if (msg.type === "spotify-play") {
        setNowPlaying({ uri: msg.trackUri, name: msg.trackName, artist: msg.artistName, albumArt: msg.albumArt });
        setSpotifyPlaying(true);
        // Cache so we can re-sync when the tab comes back to the foreground
        lastSpotifyPlayRef.current = { uri: msg.trackUri, positionMs: msg.positionMs, startAt: msg.startAt };
        execSpotifyPlay(msg.trackUri, msg.positionMs, msg.startAt);

      } else if (msg.type === "spotify-pause") {
        execSpotifyPause();
      } else if (msg.type === "spotify-seek") {
        execSpotifySeek(msg.positionMs);

      } else if (msg.type === "error") {
        showError((msg as { type: "error"; message: string }).message);
      }
    };

    ws.onclose = () => setConnStatus("disconnected");
    ws.onerror = () => setConnStatus("disconnected");
  }, [loadAudioFromUrl, pauseNow, playNow, seekTo, execSpotifyPlay, execSpotifyPause, execSpotifySeek, showError]);

  // ── Mount: connect WS ──────────────────────────────────────────────────────
  useEffect(() => {
    connectWs();
    return () => {
      wsRef.current?.close();
      stopTracking();
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [connectWs]);

  // ── Mount: handle Spotify OAuth callback or stored token ───────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("code")) {
      handleCallback().then((result) => {
        if (!result) return;
        setSpotifyToken(result.token);
        if (result.pendingAction === "host") {
          setAutoAction({ type: "host", mode: "spotify" });
        } else if (result.pendingAction === "join" && result.pendingCode) {
          setJoinCode(result.pendingCode);
          setAutoAction({ type: "join", code: result.pendingCode });
          setPhase("joining");
        }
      });
    } else {
      const stored = getStoredToken();
      if (stored) setSpotifyToken(stored);
    }
  }, []);

  // ── Execute auto-action once WS is connected ───────────────────────────────
  useEffect(() => {
    if (connStatus !== "connected" || !autoAction) return;
    if (autoAction.type === "host") {
      send({ type: "create-room", mode: autoAction.mode });
    } else {
      send({ type: "join-room", code: autoAction.code });
    }
    setAutoAction(null);
  }, [connStatus, autoAction, send]);

  // ── Init Spotify SDK (listener only) ──────────────────────────────────────
  useEffect(() => {
    if (!spotifyToken || !audioEnabled || !shouldInitSdk) return;
    let mounted = true;

    const init = async () => {
      try {
        await loadSpotifySdk();
        if (!mounted) return;

        const player = createSpotifyPlayer(async () => {
          const t = await getValidToken();
          return t ?? "";
        });

        player.addListener("ready", (data: unknown) => {
          if (!mounted) return;
          const { device_id } = data as { device_id: string };
          spotifyDeviceIdRef.current = device_id;
          setSpotifyDeviceId(device_id);
          setSpotifyReady(true);
          spotifyPlayerRef.current = player;

          const pending = pendingSpotifyPlayRef.current;
          if (pending) {
            pendingSpotifyPlayRef.current = null;
            execSpotifyPlay(pending.uri, pending.positionMs, pending.startAt);
          }
        });

        player.addListener("not_ready", () => {
          if (!mounted) return;
          spotifyDeviceIdRef.current = null;
          setSpotifyDeviceId(null);
          setSpotifyReady(false);
        });

        player.addListener("initialization_error", (data: unknown) => {
          const { message } = data as { message: string };
          setSpotifyError(message.includes("premium")
            ? "Spotify Premium is required for playback."
            : `Player error: ${message}`);
        });

        player.addListener("authentication_error", () => {
          clearTokens();
          setSpotifyToken(null);
          setSpotifyError("Spotify session expired. Please log in again.");
        });

        player.addListener("account_error", () => {
          setSpotifyError("Spotify Premium is required for in-browser playback.");
        });

        player.addListener("player_state_changed", (state: unknown) => {
          if (!state) return;
          const s = state as { paused: boolean };
          setSpotifyPlaying(!s.paused);
        });

        await player.connect();
      } catch (err) {
        console.error("Spotify SDK init error:", err);
      }
    };

    init();
    return () => {
      mounted = false;
      spotifyPlayerRef.current?.disconnect();
      spotifyPlayerRef.current = null;
      spotifyDeviceIdRef.current = null;
      setSpotifyReady(false);
      setSpotifyDeviceId(null);
    };
  }, [spotifyToken, audioEnabled, shouldInitSdk, execSpotifyPlay]);

  // ── Stop polling when leaving hosting phase ────────────────────────────────
  useEffect(() => {
    if (phase !== "hosting" && syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [phase]);

  // ── Re-sync when phone is unlocked / tab becomes visible ──────────────────
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;

      if (isSyncingRef.current && myPhaseRef.current === "hosting") {
        // Host: re-poll Spotify to detect any track change made while locked
        pollAndSync();
      } else if (myPhaseRef.current === "joined") {
        // Listener: replay the last known track with the position compensated
        // for however long the app was in the background
        const last = lastSpotifyPlayRef.current;
        if (last) {
          const elapsed = Math.max(0, Date.now() - last.startAt);
          execSpotifyPlay(last.uri, last.positionMs + elapsed, Date.now() + 300);
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [pollAndSync, execSpotifyPlay]);

  // ── Skip track handlers (host) ─────────────────────────────────────────────
  const handleSkipNext = useCallback(async () => {
    const player = spotifyPlayerRef.current;
    if (!player) return;
    await player.nextTrack();
    // Give Spotify ~800 ms to register the change, then poll
    setTimeout(() => pollAndSync(), 800);
  }, [pollAndSync]);

  const handleSkipPrev = useCallback(async () => {
    const player = spotifyPlayerRef.current;
    if (!player) return;
    await player.previousTrack();
    setTimeout(() => pollAndSync(), 800);
  }, [pollAndSync]);

  // ── Handlers: room creation ────────────────────────────────────────────────
  const handleCreateMp3Room = () => {
    if (connStatus !== "connected") return;
    setChoosingMode(false);
    send({ type: "create-room", mode: "mp3" });
  };

  const handleCreateSpotifyRoom = () => {
    if (!spotifyToken) {
      startLogin("host");
      return;
    }
    if (connStatus !== "connected") return;
    setChoosingMode(false);
    send({ type: "create-room", mode: "spotify" });
  };

  const handleJoinRoom = () => {
    if (!joinCode || joinCode.length !== 4 || connStatus !== "connected") return;
    setPhase("joining");
    send({ type: "join-room", code: joinCode });
  };

  // ── Handlers: MP3 ─────────────────────────────────────────────────────────
  const handleFileUpload = async (file: File) => {
    if (!file || !myRoomCodeRef.current) return;
    setUploadProgress(0);
    const formData = new FormData();
    formData.append("audio", file);
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = async () => {
      setUploadProgress(null);
      if (xhr.status === 200) {
        const resp = JSON.parse(xhr.responseText) as { audioName: string };
        setAudioName(resp.audioName);
        await loadAudioFromUrl(`/api/rooms/${myRoomCodeRef.current}/audio`);
      }
    };
    xhr.onerror = () => { setUploadProgress(null); showError("Upload failed"); };
    xhr.open("POST", `/api/rooms/${myRoomCodeRef.current}/audio`);
    xhr.send(formData);
  };

  const handleMp3Play = () => {
    if (!audioBufferRef.current) return;
    const startAt = Date.now() + 300;
    send({ type: "play", startAt });
  };

  const handleMp3Pause = () => send({ type: "pause" });

  const handleSeek = (pos: number) => {
    seekTo(pos);
    send({ type: "seek", position: pos });
  };

  const handleLogout = () => {
    clearTokens();
    setSpotifyToken(null);
    setSpotifyReady(false);
    setNowPlaying(null);
    setIsSyncing(false);
    setSpotifyActivated(false);
    if (syncIntervalRef.current) { clearInterval(syncIntervalRef.current); syncIntervalRef.current = null; }
  };

  const handleActivateSpotify = async () => {
    const player = spotifyPlayerRef.current;
    if (!player) return;
    try {
      await player.activateElement();
    } catch { /* some browsers don't support it — fall through */ }

    spotifyActivatedRef.current = true;
    setSpotifyActivated(true);

    // Case 1: a spotify-play arrived before activation — execute it now
    const pending = pendingSpotifyPlayRef.current;
    if (pending) {
      pendingSpotifyPlayRef.current = null;
      const elapsed = Math.max(0, Date.now() - pending.startAt);
      execSpotifyPlay(pending.uri, pending.positionMs + elapsed, Date.now());
      return;
    }

    // Case 2: track already loaded but paused by autoplay restriction — resume
    try {
      const state = await player.getCurrentState();
      if (state && state.paused) await player.resume();
    } catch { /* ignore */ }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleEnableAudio = () => {
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
    ctx.resume().then(() => setAudioEnabled(true));
  };

  // ── "Tap to Enable Audio" gate ────────────────────────────────────────────
  if (!audioEnabled) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />
        </div>
        <div className="relative z-10 flex flex-col items-center gap-8 max-w-xs text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/20 border border-primary/30">
              <Radio className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">SyncWave</h1>
            <p className="text-muted-foreground text-sm">Synchronized music playback across devices</p>
          </div>
          <button
            onClick={handleEnableAudio}
            className="group flex flex-col items-center gap-4 w-56 py-8 px-6 rounded-2xl bg-primary/10 border-2 border-primary/40 hover:bg-primary/20 hover:border-primary/70 active:scale-95 transition-all"
          >
            <div className="w-16 h-16 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center group-hover:bg-primary/30 transition-colors">
              <Volume2 className="w-8 h-8 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-semibold text-foreground">Tap to Enable Audio</p>
              <p className="text-xs text-muted-foreground leading-snug">
                Required by your browser before<br />synchronized playback can work
              </p>
            </div>
          </button>
          <p className="text-xs text-muted-foreground/60">Tap once — no permissions needed</p>
        </div>
      </div>
    );
  }

  // ── Shared sub-components ──────────────────────────────────────────────────
  const RoomCodeCard = () => (
    <div className="bg-card border border-card-border rounded-2xl p-6 text-center space-y-3 shadow-lg">
      <div className="flex items-center justify-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-widest">
        {roomMode === "spotify"
          ? <span className="text-[#1DB954]">● Spotify</span>
          : <><Music className="w-3.5 h-3.5" /> MP3</>
        }
        <span>· Room Code</span>
      </div>
      <div className="flex items-center justify-center gap-3">
        <span className="text-5xl font-mono font-bold text-primary tracking-widest">{roomCode}</span>
        <button onClick={copyCode} className="p-2 rounded-lg bg-secondary hover:bg-accent transition-colors">
          {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
        </button>
      </div>
      <p className="text-muted-foreground text-xs">Share this code with the other phone</p>
      <div className={`flex items-center justify-center gap-2 text-xs font-medium ${clientConnected ? "text-green-400" : "text-muted-foreground"}`}>
        <Users className="w-3.5 h-3.5" />
        {clientConnected ? "Listener connected" : "Waiting for listener..."}
      </div>
    </div>
  );

  const NowPlayingCard = ({ track, playing }: { track: { name: string; artist: string; albumArt: string }; playing: boolean }) => (
    <div className="flex items-center gap-3 bg-[#1DB954]/10 border border-[#1DB954]/30 rounded-xl p-3">
      {track.albumArt
        ? <img src={track.albumArt} alt="album art" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
        : <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0"><Music className="w-5 h-5 text-muted-foreground" /></div>
      }
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate text-foreground">{track.name}</p>
        <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
      </div>
      {playing && (
        <div className="flex items-end gap-0.5 h-5 flex-shrink-0">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-1 bg-[#1DB954] rounded-full animate-pulse"
              style={{ height: `${60 + i * 20}%`, animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      )}
    </div>
  );

  const SpotifyLogo = ({ size = 6 }: { size?: number }) => (
    <svg className={`w-${size} h-${size}`} viewBox="0 0 24 24" fill="#1DB954">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
    </svg>
  );

  // ── Main app ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-1/4 left-1/3 w-64 h-64 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md space-y-5 z-10">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/20 border border-primary/30 mb-2">
            <Radio className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">SyncWave</h1>
          <p className="text-muted-foreground text-sm">Synchronized music playback across devices</p>
        </div>

        {/* Connection badge */}
        <div className={`flex items-center justify-center gap-2 text-xs font-medium ${
          connStatus === "connected" ? "text-green-400" :
          connStatus === "connecting" ? "text-yellow-400" : "text-red-400"
        }`}>
          {connStatus === "connected" ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          {connStatus === "connected" ? "Connected" : connStatus === "connecting" ? "Connecting..." : "Disconnected"}
        </div>

        {errorMsg && (
          <div className="bg-destructive/20 border border-destructive/40 rounded-xl px-4 py-3 text-destructive-foreground text-sm text-center">
            {errorMsg}
          </div>
        )}
        {spotifyError && (
          <div className="bg-orange-500/20 border border-orange-500/40 rounded-xl px-4 py-3 text-orange-200 text-sm flex items-start gap-2">
            <span className="flex-1">{spotifyError}</span>
            <button onClick={() => setSpotifyError(null)}><X className="w-4 h-4 mt-0.5" /></button>
          </div>
        )}
        {hostDisconnected && (
          <div className="bg-destructive/20 border border-destructive/40 rounded-xl px-4 py-3 text-destructive-foreground text-sm text-center">
            Host disconnected. Session ended.
          </div>
        )}

        {/* ── IDLE ── */}
        {phase === "idle" && !choosingMode && (
          <div className="bg-card border border-card-border rounded-2xl p-6 space-y-4 shadow-lg">
            <h2 className="text-lg font-semibold text-center">Get Started</h2>
            <div className="space-y-3">
              <button
                onClick={() => setChoosingMode(true)}
                disabled={connStatus !== "connected"}
                className="w-full py-3 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Create a Room (Host)
              </button>
              <div className="relative flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">or join</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="flex gap-2">
                <input
                  type="text" inputMode="numeric" maxLength={4} placeholder="4-digit code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  onKeyDown={(e) => e.key === "Enter" && handleJoinRoom()}
                  className="flex-1 bg-input border border-border rounded-xl px-4 py-3 text-center text-lg font-mono tracking-widest text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  onClick={handleJoinRoom}
                  disabled={joinCode.length !== 4 || connStatus !== "connected"}
                  className="px-4 py-3 rounded-xl bg-secondary text-secondary-foreground font-semibold text-sm hover:bg-accent active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Join
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── MODE SELECTION ── */}
        {phase === "idle" && choosingMode && (
          <div className="bg-card border border-card-border rounded-2xl p-6 space-y-4 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Choose Music Source</h2>
              <button onClick={() => setChoosingMode(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={handleCreateMp3Room}
              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-border hover:border-primary/50 hover:bg-accent/30 active:scale-[0.98] transition-all text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                <Upload className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">MP3 Upload</p>
                <p className="text-xs text-muted-foreground mt-0.5">Upload a file · perfect sync via Web Audio API</p>
              </div>
            </button>

            <button
              onClick={handleCreateSpotifyRoom}
              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-[#1DB954]/30 hover:border-[#1DB954]/70 hover:bg-[#1DB954]/5 active:scale-[0.98] transition-all text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-[#1DB954]/20 flex items-center justify-center flex-shrink-0">
                <SpotifyLogo size={6} />
              </div>
              <div>
                <p className="font-semibold text-sm">Spotify Auto-Sync</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {spotifyToken ? "Logged in · play anything in Spotify and it syncs automatically" : "Requires Premium · tap to log in"}
                </p>
              </div>
            </button>
          </div>
        )}

        {/* ── JOINING ── */}
        {phase === "joining" && (
          <div className="bg-card border border-card-border rounded-2xl p-6 text-center space-y-3">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-muted-foreground text-sm">
              {autoAction ? "Rejoining room after Spotify login…" : "Joining room..."}
            </p>
          </div>
        )}

        {/* ── HOSTING: MP3 ── */}
        {phase === "hosting" && roomMode === "mp3" && (
          <div className="space-y-4">
            <RoomCodeCard />

            <div className="bg-card border border-card-border rounded-2xl p-6 space-y-3 shadow-lg">
              <h3 className="text-sm font-semibold">Upload MP3</h3>
              {!audioName ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileUpload(f); }}
                  onDragOver={(e) => e.preventDefault()}
                  className="border-2 border-dashed border-border hover:border-primary/50 rounded-xl p-8 text-center cursor-pointer transition-colors group"
                >
                  <Upload className="w-8 h-8 text-muted-foreground group-hover:text-primary mx-auto mb-3 transition-colors" />
                  <p className="text-sm text-muted-foreground">Drop MP3 here or tap to browse</p>
                  <p className="text-xs text-muted-foreground mt-1">Max 50 MB</p>
                  <input ref={fileInputRef} type="file" accept="audio/*" className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])} />
                </div>
              ) : (
                <div className="flex items-center gap-3 bg-accent/30 rounded-xl p-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Music className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{audioName}</p>
                    <p className="text-xs text-muted-foreground">{fmt(audioDuration)}</p>
                  </div>
                  <button onClick={() => fileInputRef.current?.click()} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">Change</button>
                  <input ref={fileInputRef} type="file" accept="audio/*" className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])} />
                </div>
              )}

              {uploadProgress !== null && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Uploading...</span><span>{uploadProgress}%</span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}

              {audioLoading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="w-3.5 h-3.5 border border-primary border-t-transparent rounded-full animate-spin" />
                  Decoding audio...
                </div>
              )}
            </div>

            {audioName && !audioLoading && (
              <div className="bg-card border border-card-border rounded-2xl p-6 space-y-4 shadow-lg">
                <h3 className="text-sm font-semibold">Synchronized Playback</h3>
                {audioDuration > 0 && (
                  <div className="space-y-1">
                    <input type="range" min={0} max={audioDuration} step={0.5} value={audioTime}
                      onChange={(e) => handleSeek(Number(e.target.value))}
                      className="w-full accent-primary cursor-pointer" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{fmt(audioTime)}</span><span>{fmt(audioDuration)}</span>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-center">
                  {!isPlaying ? (
                    <button onClick={handleMp3Play}
                      className="flex items-center gap-2 px-8 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 active:scale-[0.97] transition-all shadow-lg">
                      <Play className="w-5 h-5 fill-current" /> Play on all devices
                    </button>
                  ) : (
                    <button onClick={handleMp3Pause}
                      className="flex items-center gap-2 px-8 py-3.5 rounded-xl bg-secondary text-secondary-foreground font-semibold hover:bg-accent active:scale-[0.97] transition-all">
                      <Pause className="w-5 h-5 fill-current" /> Pause
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── HOSTING: Spotify ── */}
        {phase === "hosting" && roomMode === "spotify" && (
          <div className="space-y-4">
            <RoomCodeCard />

            <div className="bg-card border border-card-border rounded-2xl p-6 space-y-4 shadow-lg">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Spotify Auto-Sync</h3>
                <button onClick={handleLogout} className="p-1.5 rounded-lg hover:bg-secondary transition-colors" title="Log out of Spotify">
                  <LogOut className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>

              {/* How it works */}
              {!isSyncing && !spotifyActivated && (
                <div className="bg-secondary/50 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-medium text-foreground">How it works</p>
                  <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Open Spotify and start playing any song</li>
                    <li>Tap <strong className="text-foreground">Activate Audio</strong>, then <strong className="text-foreground">Start Syncing</strong></li>
                    <li>Music plays here and on the other phone in sync</li>
                  </ol>
                </div>
              )}

              {/* Now playing */}
              {nowPlaying && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground font-medium">Now syncing</p>
                  <NowPlayingCard track={nowPlaying} playing={spotifyPlaying} />
                </div>
              )}

              {/* Skip controls (visible while syncing) */}
              {isSyncing && (
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={handleSkipPrev}
                    disabled={!spotifyReady}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-secondary text-secondary-foreground text-sm font-medium hover:bg-accent active:scale-[0.97] transition-all disabled:opacity-40"
                  >
                    <SkipBack className="w-4 h-4" /> Prev
                  </button>
                  <button
                    onClick={handleSkipNext}
                    disabled={!spotifyReady}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-secondary text-secondary-foreground text-sm font-medium hover:bg-accent active:scale-[0.97] transition-all disabled:opacity-40"
                  >
                    Next <SkipForward className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* No active playback warning */}
              {isSyncing && noActivePlayback && (
                <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-3 py-2.5">
                  <span className="text-yellow-400 text-xs">Open Spotify on your phone and play something</span>
                </div>
              )}

              {/* Sync status */}
              {isSyncing && !noActivePlayback && nowPlaying && (
                <div className="flex items-center gap-2 text-xs text-[#1DB954]">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Live · re-aligns every {RESYNC_INTERVAL_MS / 1000}s
                </div>
              )}

              {/* Activate audio button (host needs to unlock browser audio before syncing) */}
              {!isSyncing && spotifyReady && !spotifyActivated && (
                <button
                  onClick={handleActivateSpotify}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary/20 border-2 border-primary/50 text-primary font-semibold text-sm hover:bg-primary/30 hover:border-primary/80 active:scale-[0.97] transition-all"
                >
                  <Volume2 className="w-4 h-4" /> Activate Audio
                </button>
              )}

              {/* Main button */}
              {!isSyncing ? (
                <button
                  onClick={handleStartSync}
                  disabled={spotifyReady && !spotifyActivated}
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-[#1DB954] text-black font-bold text-base hover:opacity-90 active:scale-[0.97] transition-all shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <SpotifyLogo size={5} />
                  Start Syncing
                </button>
              ) : (
                <button
                  onClick={handleStopSync}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-secondary text-secondary-foreground font-semibold hover:bg-accent active:scale-[0.97] transition-all"
                >
                  <Pause className="w-4 h-4" /> Stop Syncing
                </button>
              )}

              <p className="text-xs text-muted-foreground text-center">
                Both phones need Spotify Premium · use Chrome on Android (not iOS Safari)
              </p>
            </div>
          </div>
        )}

        {/* ── JOINED (listener) ── */}
        {phase === "joined" && (
          <div className="space-y-4">
            <div className="bg-card border border-card-border rounded-2xl p-6 text-center space-y-3 shadow-lg">
              <div className="flex items-center justify-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-widest">
                {roomMode === "spotify" ? <span className="text-[#1DB954]">● Spotify Room</span> : <><Music className="w-3.5 h-3.5" /> MP3 Room</>}
              </div>
              <div className="text-4xl font-mono font-bold text-primary tracking-widest">{roomCode}</div>
              <div className="flex items-center justify-center gap-2 text-xs font-medium text-green-400">
                <Wifi className="w-3.5 h-3.5" /> Synced with host
              </div>
            </div>

            {/* MP3 listener */}
            {roomMode === "mp3" && (
              <div className="bg-card border border-card-border rounded-2xl p-6 space-y-3 shadow-lg">
                {audioLoading ? (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-muted-foreground">Loading audio...</p>
                  </div>
                ) : audioName ? (
                  <>
                    <div className="flex items-center gap-3 bg-accent/30 rounded-xl p-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                        <Music className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{audioName}</p>
                        <p className="text-xs text-muted-foreground">{fmt(audioDuration)}</p>
                      </div>
                    </div>
                    {audioDuration > 0 && (
                      <div className="space-y-1">
                        <div className="h-1 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(audioTime / audioDuration) * 100}%` }} />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{fmt(audioTime)}</span><span>{fmt(audioDuration)}</span>
                        </div>
                      </div>
                    )}
                    <div className={`text-center text-xs font-medium ${isPlaying ? "text-green-400" : "text-muted-foreground"}`}>
                      {isPlaying ? "▶ Playing in sync" : "Waiting for host to play..."}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-6">
                    <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center mx-auto mb-3">
                      <Music className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">Waiting for host to upload a track...</p>
                  </div>
                )}
              </div>
            )}

            {/* Spotify listener */}
            {roomMode === "spotify" && (
              <div className="bg-card border border-card-border rounded-2xl p-6 space-y-4 shadow-lg">
                {!spotifyToken ? (
                  <div className="flex flex-col items-center gap-4 py-4 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-[#1DB954]/20 flex items-center justify-center">
                      <SpotifyLogo size={8} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Log in to sync with host</p>
                      <p className="text-xs text-muted-foreground mt-1">This is a Spotify room · Spotify Premium required</p>
                    </div>
                    <button
                      onClick={() => startLogin("join", myRoomCodeRef.current || joinCode)}
                      className="px-6 py-3 rounded-xl bg-[#1DB954] text-black font-semibold text-sm hover:opacity-90 active:scale-[0.97] transition-all"
                    >
                      Log in with Spotify
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Spotify Sync</h3>
                      <div className="flex items-center gap-2">
                        <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg
                          ${spotifyReady ? "bg-[#1DB954]/20 text-[#1DB954]" : "bg-secondary text-muted-foreground"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${spotifyReady ? "bg-[#1DB954]" : "bg-muted-foreground"}`} />
                          {spotifyReady ? "Ready" : "Connecting…"}
                        </div>
                        <button onClick={handleLogout} className="p-1.5 rounded-lg hover:bg-secondary transition-colors" title="Log out">
                          <LogOut className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      </div>
                    </div>

                    {/* Must tap once to unlock SDK audio on mobile */}
                    {spotifyReady && !spotifyActivated && (
                      <button
                        onClick={handleActivateSpotify}
                        className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-[#1DB954] text-black font-bold text-base hover:opacity-90 active:scale-[0.97] transition-all shadow-lg"
                      >
                        <Volume2 className="w-5 h-5" />
                        Tap to Start Listening
                      </button>
                    )}

                    {spotifyActivated && nowPlaying && (
                      <NowPlayingCard track={nowPlaying} playing={spotifyPlaying} />
                    )}

                    {spotifyActivated && !nowPlaying && (
                      <div className="text-center py-6">
                        <div className="w-10 h-10 rounded-full bg-[#1DB954]/20 flex items-center justify-center mx-auto mb-3">
                          <SpotifyLogo size={5} />
                        </div>
                        <p className="text-sm text-muted-foreground">Waiting for host to start syncing…</p>
                      </div>
                    )}

                    {spotifyActivated && (
                      <div className={`text-center text-xs font-medium ${spotifyPlaying ? "text-[#1DB954]" : "text-muted-foreground"}`}>
                        {spotifyPlaying ? "▶ Playing in sync" : nowPlaying ? "Paused" : ""}
                      </div>
                    )}

                    {!spotifyReady && (
                      <div className="text-center py-4">
                        <div className="w-5 h-5 border-2 border-[#1DB954] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">Connecting Spotify player…</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
