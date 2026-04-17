import { useEffect, useRef, useState, useCallback } from "react";
import {
  Music, Play, Pause, Wifi, Users, Radio,
  Copy, Check, Volume2, LogOut, X, RefreshCw, Search,
} from "lucide-react";
import {
  startLogin, handleCallback, getStoredToken, getValidToken, clearTokens,
  loadSpotifySdk, createSpotifyPlayer, playTrack, pauseTrack, getCurrentPlayback,
  searchTracks,
  type SpotifyPlayer,
} from "../lib/spotify";
import {
  loadMusicKit, getArtworkUrl, PlaybackState,
  type MusicKitInstance, type AppleMusicItem,
} from "../lib/appleMusic";
import { fetchStationsByTag, fetchTopUSStations, searchStationsByName, FEATURED_GENRES, type RadioStation } from "../lib/radioBrowser";

type Phase = "idle" | "creating" | "hosting" | "joining" | "joined";
type ConnectionStatus = "disconnected" | "connecting" | "connected";
type RoomMode = "spotify" | "radio" | "apple";
// Which service the LISTENER has chosen (may differ from host's room mode)
type ListenerService = "apple" | "spotify" | null;

interface TrackInfo {
  id: string; // song id or track uri
  name: string;
  artist: string;
  albumArt: string;
}

type WsEvent =
  | { type: "room-created"; code: string; mode: RoomMode }
  | { type: "joined-room"; code: string; mode: RoomMode; hostConnected?: boolean; lastSpotifyPlay?: unknown; lastRadioPlay?: { streamUrl: string; stationName: string; favicon: string }; lastApplePlay?: unknown }
  | { type: "client-joined" }
  | { type: "client-disconnected" }
  | { type: "host-disconnected" }
  | { type: "host-reconnected" }
  | { type: "pong" }
  | { type: "spotify-play"; trackUri: string; trackName: string; artistName: string; albumArt: string; positionMs: number; startAt: number }
  | { type: "sync-state"; trackUri: string; trackName: string; artistName: string; albumArt: string; positionMs: number; startAt: number }
  | { type: "spotify-pause" }
  | { type: "spotify-seek"; positionMs: number }
  | { type: "radio-play"; streamUrl: string; stationName: string; favicon: string }
  | { type: "radio-stop" }
  | { type: "apple-play"; songId: string; songName: string; artistName: string; albumArt: string; positionMs: number; startAt: number }
  | { type: "apple-sync"; songId: string; songName: string; artistName: string; albumArt: string; positionMs: number; startAt: number }
  | { type: "apple-pause" }
  | { type: "apple-seek"; positionMs: number }
  | { type: "error"; message: string };

function getWsUrl() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

const POLL_INTERVAL_MS = 2500;
const RESYNC_INTERVAL_MS = 15_000;
const SYNC_LEAD_MS = 1200;
const PAUSE_CONFIRM_POLLS = 2;

// ── Logos ──────────────────────────────────────────────────────────────────

function SpotifyLogo({ size = 5 }: { size?: number }) {
  const px = size * 4;
  return (
    <svg width={px} height={px} viewBox="0 0 24 24" fill="#1DB954">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}

function AppleLogo({ size = 5, className = "fill-current" }: { size?: number; className?: string }) {
  const px = size * 4;
  return (
    <svg width={px} height={px} viewBox="0 0 24 24" className={className}>
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701z" />
    </svg>
  );
}

// ── Shared card components ─────────────────────────────────────────────────

function NowPlayingCard({ track, playing, accentColor = "#1DB954" }: { track: TrackInfo; playing: boolean; accentColor?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl p-3 border" style={{ background: `${accentColor}18`, borderColor: `${accentColor}40` }}>
      {track.albumArt
        ? <img src={track.albumArt} alt="album art" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
        : <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0"><Music className="w-5 h-5 text-muted-foreground" /></div>}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate text-foreground">{track.name}</p>
        <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
      </div>
      <div className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse" style={{ background: playing ? accentColor : "transparent", border: playing ? "none" : `1px solid ${accentColor}60` }} />
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function MusicSync() {
  // Core
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [connStatus, setConnStatus] = useState<ConnectionStatus>("disconnected");
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [roomMode, setRoomMode] = useState<RoomMode>("spotify");
  const [choosingMode, setChoosingMode] = useState(false);
  const [clientConnected, setClientConnected] = useState(false);
  const [hostDisconnected, setHostDisconnected] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Radio
  const [radioStation, setRadioStation] = useState<{ streamUrl: string; stationName: string; favicon: string } | null>(null);
  const [radioPlaying, setRadioPlaying] = useState(false);
  const [radioStations, setRadioStations] = useState<RadioStation[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [radioLoading, setRadioLoading] = useState(false);
  const [radioError, setRadioError] = useState<string | null>(null);
  const [radioSearch, setRadioSearch] = useState("");
  const [radioSearchActive, setRadioSearchActive] = useState(false);

  // Auto-action after OAuth redirect
  const [autoAction, setAutoAction] = useState<
    { type: "host"; mode: RoomMode } | { type: "join"; code: string } | null
  >(null);

  // Spotify
  const [spotifyToken, setSpotifyToken] = useState<string | null>(null);
  const [spotifyDeviceId, setSpotifyDeviceId] = useState<string | null>(null);
  const [spotifyReady, setSpotifyReady] = useState(false);
  const [spotifyError, setSpotifyError] = useState<string | null>(null);
  const [spotifyPlaying, setSpotifyPlaying] = useState(false);
  const [nowPlaying, setNowPlaying] = useState<TrackInfo | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [noActivePlayback, setNoActivePlayback] = useState(false);
  const [shouldInitSdk, setShouldInitSdk] = useState(false);
  const [spotifyActivated, setSpotifyActivated] = useState(false);

  // Apple Music
  const [appleReady, setAppleReady] = useState(false);
  const [appleAuthorized, setAppleAuthorized] = useState(false);
  const [appleError, setAppleError] = useState<string | null>(null);
  const [applePlaying, setApplePlaying] = useState(false);
  const [appleNowPlaying, setAppleNowPlaying] = useState<TrackInfo | null>(null);
  const [appleIsSyncing, setAppleIsSyncing] = useState(false);
  const [appleNoPlayback, setAppleNoPlayback] = useState(false);
  // Apple host — song picker
  const [applePickerQuery, setApplePickerQuery] = useState("");
  const [applePickerResults, setApplePickerResults] = useState<AppleMusicItem[]>([]);
  const [applePickerLoading, setApplePickerLoading] = useState(false);
  const [applePickerOpen, setApplePickerOpen] = useState(false);

  // Listener service choice (independent of room mode)
  const [listenerService, setListenerService] = useState<ListenerService>(null);
  const [listenerActivated, setListenerActivated] = useState(false);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const radioAudioRef = useRef<HTMLAudioElement | null>(null);
  const myRoomCodeRef = useRef<string>("");
  const myPhaseRef = useRef<Phase>("idle");
  const roomModeRef = useRef<RoomMode>("spotify");
  const spotifyPlayerRef = useRef<SpotifyPlayer | null>(null);
  const spotifyDeviceIdRef = useRef<string | null>(null);
  const pendingSpotifyPlayRef = useRef<{ uri: string; positionMs: number; startAt: number } | null>(null);
  const listenerCurrentTrackRef = useRef<string | null>(null);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTrackUriRef = useRef<string | null>(null);
  const lastIsPlayingRef = useRef<boolean>(false);
  const lastResyncTimeRef = useRef<number>(0);
  const pauseCountRef = useRef<number>(0);
  const spotifyActivatedRef = useRef(false);
  const isSyncingRef = useRef(false);
  const wsHeartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const radioSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appleKitRef = useRef<MusicKitInstance | null>(null);
  const appleSyncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appleIsSyncingRef = useRef(false);
  const appleLastSongIdRef = useRef<string | null>(null);
  const appleLastIsPlayingRef = useRef<boolean>(false);
  const appleLastResyncRef = useRef<number>(0);
  const applePauseCntRef = useRef<number>(0);
  const pendingApplePlayRef = useRef<{ songId: string; positionMs: number; startAt: number } | null>(null);
  const applePickerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listenerServiceRef = useRef<ListenerService>(null);

  // ── Helpers ──────────────────────────────────────────────────────────────

  const send = useCallback((data: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  }, []);

  const showError = useCallback((msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 5000);
  }, []);

  // ── Spotify exec helpers ──────────────────────────────────────────────────

  const execSpotifyPlay = useCallback(async (uri: string, positionMs: number, startAt: number) => {
    const delay = startAt - Date.now();
    const deviceId = spotifyDeviceIdRef.current;
    if (!deviceId || !spotifyActivatedRef.current) {
      pendingSpotifyPlayRef.current = { uri, positionMs, startAt };
      return;
    }
    const isSameTrack = listenerCurrentTrackRef.current === uri;
    const player = spotifyPlayerRef.current;
    if (isSameTrack && player) {
      const waitMs = Math.max(0, delay);
      setTimeout(async () => {
        const driftMs = Date.now() - startAt;
        const target = positionMs + Math.max(0, driftMs);
        try { await player.seek(target); setSpotifyPlaying(true); } catch { /* ignore */ }
      }, waitMs);
      return;
    }
    const doPlay = async (adjustedPositionMs: number) => {
      try {
        const token = await getValidToken();
        if (!token || !spotifyDeviceIdRef.current) return;
        await playTrack(token, spotifyDeviceIdRef.current, uri, adjustedPositionMs);
        listenerCurrentTrackRef.current = uri;
        setSpotifyPlaying(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Spotify playback failed.";
        setSpotifyError(msg);
        setSpotifyPlaying(false);
      }
    };
    const fireMs = Math.max(0, delay - 200);
    if (fireMs > 0) setTimeout(() => doPlay(positionMs), fireMs);
    else await doPlay(positionMs + Math.max(0, -delay));
  }, []);

  const execSpotifyPause = useCallback(async () => {
    const token = await getValidToken();
    const deviceId = spotifyDeviceIdRef.current;
    if (!token || !deviceId) return;
    try { await pauseTrack(token, deviceId); } catch { /* ignore */ }
    setSpotifyPlaying(false);
  }, []);

  const execSpotifySeek = useCallback(async (positionMs: number) => {
    const player = spotifyPlayerRef.current;
    if (player) await player.seek(positionMs);
  }, []);

  // Cross-service: listener uses Spotify, receives apple-play → search Spotify for matching track
  const execSpotifyPlayByName = useCallback(async (songName: string, artistName: string, positionMs: number, startAt: number) => {
    const token = await getValidToken();
    const deviceId = spotifyDeviceIdRef.current;
    if (!token || !deviceId || !spotifyActivatedRef.current) {
      // Store as pending by name - we'll handle it after activation
      return;
    }
    try {
      const tracks = await searchTracks(token, `${songName} ${artistName}`);
      if (!tracks.length) { setSpotifyError(`Could not find "${songName}" on Spotify.`); return; }
      const track = tracks[0];
      setNowPlaying({ id: track.uri, name: track.name, artist: track.artists[0]?.name ?? "", albumArt: track.album.images[0]?.url ?? "" });
      const elapsed = Math.max(0, Date.now() - startAt);
      await execSpotifyPlay(track.uri, positionMs + elapsed, Date.now());
    } catch {
      setSpotifyError("Cross-service search failed. Try Force Sync.");
    }
  }, [execSpotifyPlay]);

  // ── Apple Music exec helpers ──────────────────────────────────────────────

  const execApplePlay = useCallback(async (songId: string, positionMs: number, startAt: number) => {
    const kit = appleKitRef.current;
    if (!kit) { pendingApplePlayRef.current = { songId, positionMs, startAt }; return; }
    const delay = startAt - Date.now();
    const waitMs = Math.max(0, delay - 300);
    const elapsed = Math.max(0, -delay);
    const targetSeconds = (positionMs + elapsed) / 1000;
    const doPlay = async () => {
      try {
        // Must play first — seeking before buffering starts fails silently
        await kit.setQueue({ song: songId });
        await kit.play();
        setApplePlaying(true);
        // Seek after a short buffer delay so the track is loaded
        if (targetSeconds > 0.5) {
          setTimeout(async () => {
            try { await kit.seekToTime(targetSeconds); } catch { /* ignore */ }
          }, 1200);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Apple Music playback failed.";
        setAppleError(msg);
        setApplePlaying(false);
      }
    };
    if (waitMs > 0) setTimeout(doPlay, waitMs);
    else await doPlay();
  }, []);

  const execApplePause = useCallback(async () => {
    const kit = appleKitRef.current;
    if (!kit) return;
    try { await kit.pause(); } catch { /* ignore */ }
    setApplePlaying(false);
  }, []);

  const execAppleSeek = useCallback(async (positionMs: number) => {
    const kit = appleKitRef.current;
    if (!kit) return;
    try { await kit.seekToTime(positionMs / 1000); } catch { /* ignore */ }
  }, []);

  // Cross-service: listener uses Apple Music, receives spotify-play → search Apple Music for matching track
  const execApplePlayByName = useCallback(async (songName: string, artistName: string, positionMs: number, startAt: number) => {
    const kit = appleKitRef.current;
    if (!kit || !kit.isAuthorized) return;
    try {
      const res = await kit.api.search(`${songName} ${artistName}`, { types: "songs", limit: 5 });
      const songs: AppleMusicItem[] = res.songs?.data ?? [];
      if (!songs.length) { setAppleError(`Could not find "${songName}" on Apple Music.`); return; }
      const song = songs[0];
      const albumArt = getArtworkUrl(song, 300);
      setAppleNowPlaying({ id: song.id, name: song.attributes.name, artist: song.attributes.artistName, albumArt });
      const elapsed = Math.max(0, Date.now() - startAt);
      await execApplePlay(song.id, positionMs + elapsed, Date.now());
    } catch {
      setAppleError("Cross-service search failed. Try Force Sync.");
    }
  }, [execApplePlay]);

  // ── Spotify HOST polling ──────────────────────────────────────────────────

  const pollAndSync = useCallback(async () => {
    const token = await getValidToken();
    if (!token) return;
    const apiStart = Date.now();
    const state = await getCurrentPlayback(token);
    const latency = Date.now() - apiStart;
    if (!state || !state.item) { setNoActivePlayback(true); return; }
    setNoActivePlayback(false);
    const { is_playing, progress_ms, item } = state;
    const estimatedPos = progress_ms + latency;
    const trackUri = item.uri;
    const trackName = item.name;
    const artistName = item.artists[0]?.name ?? "";
    const albumArt = item.album.images[0]?.url ?? "";
    const trackChanged = trackUri !== lastTrackUriRef.current;
    const playChanged = is_playing !== lastIsPlayingRef.current;
    const timeForResync = is_playing && Date.now() - lastResyncTimeRef.current > RESYNC_INTERVAL_MS;
    if (is_playing) {
      pauseCountRef.current = 0;
      if (trackChanged || playChanged || timeForResync) {
        const startAt = Date.now() + SYNC_LEAD_MS;
        send({ type: "spotify-play", trackUri, trackName, artistName, albumArt, positionMs: estimatedPos + SYNC_LEAD_MS, startAt });
        setNowPlaying({ id: trackUri, name: trackName, artist: artistName, albumArt });
        setSpotifyPlaying(true);
        lastTrackUriRef.current = trackUri;
        lastResyncTimeRef.current = Date.now();
      }
    } else {
      pauseCountRef.current += 1;
      if (pauseCountRef.current === PAUSE_CONFIRM_POLLS) { send({ type: "spotify-pause" }); setSpotifyPlaying(false); }
    }
    lastIsPlayingRef.current = is_playing;
    if (trackChanged) { setNowPlaying({ id: trackUri, name: trackName, artist: artistName, albumArt }); lastTrackUriRef.current = trackUri; }
  }, [send]);

  const handleStartSync = useCallback(async () => {
    isSyncingRef.current = true; setIsSyncing(true);
    lastTrackUriRef.current = null; lastIsPlayingRef.current = false; lastResyncTimeRef.current = 0; pauseCountRef.current = 0;
    await pollAndSync();
    syncIntervalRef.current = setInterval(pollAndSync, POLL_INTERVAL_MS);
  }, [pollAndSync]);

  const handleStopSync = useCallback(() => {
    isSyncingRef.current = false; setIsSyncing(false);
    if (syncIntervalRef.current) { clearInterval(syncIntervalRef.current); syncIntervalRef.current = null; }
    send({ type: "spotify-pause" }); setSpotifyPlaying(false);
  }, [send]);

  // ── Apple Music HOST polling ──────────────────────────────────────────────

  const applePollAndSync = useCallback(() => {
    const kit = appleKitRef.current;
    if (!kit) return;
    const item = kit.nowPlayingItem;
    const isPlaying = kit.playbackState === PlaybackState.playing;
    if (!item) { setAppleNoPlayback(true); return; }
    setAppleNoPlayback(false);
    const songId = item.id;
    const songName = item.attributes.name;
    const artistName = item.attributes.artistName;
    const albumArt = getArtworkUrl(item, 300);
    const positionMs = kit.currentPlaybackTime * 1000;
    const songChanged = songId !== appleLastSongIdRef.current;
    const playChanged = isPlaying !== appleLastIsPlayingRef.current;
    const timeForResync = isPlaying && Date.now() - appleLastResyncRef.current > RESYNC_INTERVAL_MS;
    if (isPlaying) {
      applePauseCntRef.current = 0;
      if (songChanged || playChanged || timeForResync) {
        const startAt = Date.now() + SYNC_LEAD_MS;
        send({ type: "apple-play", songId, songName, artistName, albumArt, positionMs: positionMs + SYNC_LEAD_MS, startAt });
        setAppleNowPlaying({ id: songId, name: songName, artist: artistName, albumArt });
        setApplePlaying(true);
        appleLastSongIdRef.current = songId;
        appleLastResyncRef.current = Date.now();
      }
    } else {
      applePauseCntRef.current += 1;
      if (applePauseCntRef.current === PAUSE_CONFIRM_POLLS) { send({ type: "apple-pause" }); setApplePlaying(false); }
    }
    appleLastIsPlayingRef.current = isPlaying;
    if (songChanged) { setAppleNowPlaying({ id: songId, name: songName, artist: artistName, albumArt }); appleLastSongIdRef.current = songId; }
  }, [send]);

  const handleStartAppleSync = useCallback(() => {
    appleIsSyncingRef.current = true; setAppleIsSyncing(true);
    appleLastSongIdRef.current = null; appleLastIsPlayingRef.current = false; appleLastResyncRef.current = 0; applePauseCntRef.current = 0;
    applePollAndSync();
    appleSyncIntervalRef.current = setInterval(applePollAndSync, POLL_INTERVAL_MS);
  }, [applePollAndSync]);

  const handleStopAppleSync = useCallback(() => {
    appleIsSyncingRef.current = false; setAppleIsSyncing(false);
    if (appleSyncIntervalRef.current) { clearInterval(appleSyncIntervalRef.current); appleSyncIntervalRef.current = null; }
    send({ type: "apple-pause" }); setApplePlaying(false);
  }, [send]);

  // ── Radio helpers ─────────────────────────────────────────────────────────

  const stopRadioAudio = useCallback(() => {
    if (radioAudioRef.current) { radioAudioRef.current.pause(); radioAudioRef.current.src = ""; radioAudioRef.current = null; }
    setRadioPlaying(false);
  }, []);

  const playRadioStream = useCallback((streamUrl: string, stationName: string, favicon: string) => {
    stopRadioAudio();
    const audio = new Audio(streamUrl);
    radioAudioRef.current = audio;
    setRadioStation({ streamUrl, stationName, favicon });
    setRadioError(null);
    audio.addEventListener("playing", () => { setRadioPlaying(true); setRadioError(null); }, { once: true });
    audio.onerror = () => { if (!audio.currentTime || audio.currentTime === 0) { setRadioError("Station may be offline. Try another."); setRadioPlaying(false); } };
    audio.play().catch((err) => { if (err?.name !== "NotAllowedError" && (!audio.currentTime || audio.currentTime === 0)) setRadioError("Could not connect. Try another."); setRadioPlaying(false); });
  }, [stopRadioAudio]);

  // ── WebSocket ─────────────────────────────────────────────────────────────

  const connectWs = useCallback(() => {
    setConnStatus("connecting");
    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      setConnStatus("connected");
      if (wsHeartbeatRef.current) clearInterval(wsHeartbeatRef.current);
      wsHeartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
      }, 15_000);
      const code = myRoomCodeRef.current;
      const p = myPhaseRef.current;
      if (code && p === "hosting") ws.send(JSON.stringify({ type: "rejoin-room", code }));
      else if (code && p === "joined") ws.send(JSON.stringify({ type: "join-room", code }));
    };

    ws.onmessage = (event) => {
      let msg: WsEvent;
      try { msg = JSON.parse(event.data as string) as WsEvent; } catch { return; }

      if (msg.type === "room-created") {
        setRoomCode(msg.code); myRoomCodeRef.current = msg.code;
        roomModeRef.current = msg.mode; setRoomMode(msg.mode);
        setChoosingMode(false); setPhase("hosting"); myPhaseRef.current = "hosting";

      } else if (msg.type === "joined-room") {
        setRoomCode(msg.code); myRoomCodeRef.current = msg.code;
        roomModeRef.current = msg.mode; setRoomMode(msg.mode);
        setPhase("joined"); myPhaseRef.current = "joined";
        if (msg.hostConnected !== false) setHostDisconnected(false);
        // Don't auto-init Spotify SDK here — wait for listener to pick their service
        if (msg.lastRadioPlay) playRadioStream(msg.lastRadioPlay.streamUrl, msg.lastRadioPlay.stationName, msg.lastRadioPlay.favicon);
        if (msg.lastSpotifyPlay && listenerServiceRef.current === "spotify") {
          const lsp = msg.lastSpotifyPlay as { trackUri: string; trackName: string; artistName: string; albumArt: string; positionMs: number; startAt: number };
          setNowPlaying({ id: lsp.trackUri, name: lsp.trackName, artist: lsp.artistName, albumArt: lsp.albumArt });
          execSpotifyPlay(lsp.trackUri, lsp.positionMs, lsp.startAt);
        }
        if (msg.lastApplePlay) {
          const lap = msg.lastApplePlay as { songId: string; songName: string; artistName: string; albumArt: string; positionMs: number; startAt: number };
          if (listenerServiceRef.current === "apple") {
            setAppleNowPlaying({ id: lap.songId, name: lap.songName, artist: lap.artistName, albumArt: lap.albumArt });
            execApplePlay(lap.songId, lap.positionMs, lap.startAt);
          } else if (listenerServiceRef.current === "spotify") {
            execSpotifyPlayByName(lap.songName, lap.artistName, lap.positionMs, lap.startAt);
          }
        }

      } else if (msg.type === "client-joined") { setClientConnected(true);
      } else if (msg.type === "client-disconnected") { setClientConnected(false);
      } else if (msg.type === "radio-play") { playRadioStream(msg.streamUrl, msg.stationName, msg.favicon); setHostDisconnected(false);
      } else if (msg.type === "radio-stop") { stopRadioAudio(); setRadioStation(null);
      } else if (msg.type === "host-disconnected") {
        setHostDisconnected(true);
        if (roomModeRef.current === "radio") stopRadioAudio();
        else { setSpotifyPlaying(false); setApplePlaying(false); }

      } else if (msg.type === "host-reconnected") { setHostDisconnected(false);
      } else if (msg.type === "pong") { /* keepalive */

      // ── Incoming play events for LISTENER ────────────────────────────────
      } else if (msg.type === "spotify-play" || msg.type === "sync-state") {
        setHostDisconnected(false);
        const svc = listenerServiceRef.current;
        if (svc === "spotify") {
          setNowPlaying({ id: msg.trackUri, name: msg.trackName, artist: msg.artistName, albumArt: msg.albumArt });
          setSpotifyPlaying(true);
          execSpotifyPlay(msg.trackUri, msg.positionMs, msg.startAt);
        } else if (svc === "apple") {
          // Cross-service: Spotify room, Apple listener → search Apple Music for matching track
          setAppleNowPlaying({ id: "", name: msg.trackName, artist: msg.artistName, albumArt: msg.albumArt });
          execApplePlayByName(msg.trackName, msg.artistName, msg.positionMs, msg.startAt);
        }

      } else if (msg.type === "spotify-pause") {
        if (listenerServiceRef.current === "spotify") execSpotifyPause();
        else setApplePlaying(false);
      } else if (msg.type === "spotify-seek") {
        if (listenerServiceRef.current === "spotify") execSpotifySeek(msg.positionMs);

      } else if (msg.type === "apple-play" || msg.type === "apple-sync") {
        setHostDisconnected(false);
        const svc = listenerServiceRef.current;
        if (svc === "apple") {
          setAppleNowPlaying({ id: msg.songId, name: msg.songName, artist: msg.artistName, albumArt: msg.albumArt });
          setApplePlaying(true);
          execApplePlay(msg.songId, msg.positionMs, msg.startAt);
        } else if (svc === "spotify") {
          // Cross-service: Apple room, Spotify listener
          setNowPlaying({ id: "", name: msg.songName, artist: msg.artistName, albumArt: msg.albumArt });
          setSpotifyPlaying(false);
          execSpotifyPlayByName(msg.songName, msg.artistName, msg.positionMs, msg.startAt);
        }
      } else if (msg.type === "apple-pause") {
        if (listenerServiceRef.current === "apple") execApplePause();
        else setSpotifyPlaying(false);
      } else if (msg.type === "apple-seek") {
        if (listenerServiceRef.current === "apple") execAppleSeek(msg.positionMs);
        else if (listenerServiceRef.current === "spotify") execSpotifySeek(msg.positionMs);

      } else if (msg.type === "error") { showError((msg as { type: "error"; message: string }).message); }
    };

    ws.onclose = () => { if (wsHeartbeatRef.current) { clearInterval(wsHeartbeatRef.current); wsHeartbeatRef.current = null; } setConnStatus("disconnected"); };
    ws.onerror = () => setConnStatus("disconnected");
  }, [execSpotifyPlay, execSpotifyPause, execSpotifySeek, execSpotifyPlayByName, execApplePlay, execApplePause, execAppleSeek, execApplePlayByName, playRadioStream, stopRadioAudio, showError]);

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    connectWs();
    return () => {
      wsRef.current?.close();
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      if (appleSyncIntervalRef.current) clearInterval(appleSyncIntervalRef.current);
      if (wsHeartbeatRef.current) clearInterval(wsHeartbeatRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconnect on disconnect
  useEffect(() => {
    if (connStatus !== "disconnected" || myPhaseRef.current === "idle") return;
    const t = setTimeout(() => connectWs(), 2_000);
    return () => clearTimeout(t);
  }, [connStatus, connectWs]);

  // Keep connectWs fresh
  const connectWsRef = useRef(connectWs);
  useEffect(() => { connectWsRef.current = connectWs; }, [connectWs]);

  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (myPhaseRef.current === "hosting" || myPhaseRef.current === "joined") { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, []);

  // Spotify OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("code")) {
      handleCallback().then((result) => {
        if (!result) return;
        setSpotifyToken(result.token);
        if (result.pendingAction === "host") setAutoAction({ type: "host", mode: "spotify" });
        else if (result.pendingAction === "join" && result.pendingCode) {
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

  useEffect(() => {
    if (connStatus !== "connected" || !autoAction) return;
    if (autoAction.type === "host") send({ type: "create-room", mode: autoAction.mode });
    else send({ type: "join-room", code: autoAction.code });
    setAutoAction(null);
  }, [connStatus, autoAction, send]);

  // Spotify SDK (listener side — only init when they've chosen Spotify)
  useEffect(() => {
    if (!spotifyToken || !audioEnabled || !shouldInitSdk) return;
    let mounted = true;
    const init = async () => {
      try {
        await loadSpotifySdk();
        if (!mounted) return;
        const player = createSpotifyPlayer(async () => { const t = await getValidToken(); return t ?? ""; });
        player.addListener("ready", (data: unknown) => {
          if (!mounted) return;
          const { device_id } = data as { device_id: string };
          spotifyDeviceIdRef.current = device_id;
          setSpotifyDeviceId(device_id);
          setSpotifyReady(true);
          spotifyPlayerRef.current = player;
          const pending = pendingSpotifyPlayRef.current;
          if (pending) { pendingSpotifyPlayRef.current = null; execSpotifyPlay(pending.uri, pending.positionMs, pending.startAt); }
        });
        player.addListener("not_ready", () => { if (!mounted) return; spotifyDeviceIdRef.current = null; setSpotifyDeviceId(null); setSpotifyReady(false); });
        player.addListener("initialization_error", (data: unknown) => { const { message } = data as { message: string }; setSpotifyError(message.includes("premium") ? "Spotify Premium is required." : `Player error: ${message}`); });
        player.addListener("authentication_error", () => { clearTokens(); setSpotifyToken(null); setSpotifyError("Spotify session expired. Please log in again."); });
        player.addListener("account_error", () => { setSpotifyError("Spotify Premium is required."); });
        player.addListener("player_state_changed", (state: unknown) => { if (!state) return; setSpotifyPlaying(!(state as { paused: boolean }).paused); });
        await player.connect();
      } catch (err) { console.error("Spotify SDK:", err); }
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

  // MusicKit (loads eagerly after audio enable)
  useEffect(() => {
    if (!audioEnabled) return;
    let mounted = true;
    loadMusicKit().then((kit) => {
      if (!mounted || !kit) return;
      appleKitRef.current = kit;
      setAppleReady(true);
      if (kit.isAuthorized) setAppleAuthorized(true);
      kit.addEventListener("playbackStateDidChange", () => {
        if (!appleKitRef.current) return;
        setApplePlaying(appleKitRef.current.playbackState === PlaybackState.playing);
      });
      const pending = pendingApplePlayRef.current;
      if (pending) { pendingApplePlayRef.current = null; execApplePlay(pending.songId, pending.positionMs, pending.startAt); }
    }).catch((err) => { console.warn("MusicKit:", err instanceof Error ? err.message : err); });
    return () => { mounted = false; };
  }, [audioEnabled, execApplePlay]);

  // Stop sync intervals when leaving hosting phase
  useEffect(() => {
    if (phase !== "hosting") {
      if (syncIntervalRef.current) { clearInterval(syncIntervalRef.current); syncIntervalRef.current = null; isSyncingRef.current = false; setIsSyncing(false); }
      if (appleSyncIntervalRef.current) { clearInterval(appleSyncIntervalRef.current); appleSyncIntervalRef.current = null; appleIsSyncingRef.current = false; setAppleIsSyncing(false); }
    }
  }, [phase]);

  // Visibility change re-sync
  useEffect(() => {
    const handle = () => {
      if (document.visibilityState !== "visible") return;
      if (isSyncingRef.current && myPhaseRef.current === "hosting") pollAndSync();
      else if (appleIsSyncingRef.current && myPhaseRef.current === "hosting") applePollAndSync();
      else if (myPhaseRef.current === "joined") send({ type: "request-sync" });
    };
    document.addEventListener("visibilitychange", handle);
    return () => document.removeEventListener("visibilitychange", handle);
  }, [pollAndSync, applePollAndSync, send]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleCreateSpotifyRoom = () => {
    if (!spotifyToken) { startLogin("host"); return; }
    if (connStatus !== "connected") return;
    send({ type: "create-room", mode: "spotify" });
  };

  const handleCreateRadioRoom = () => {
    if (connStatus !== "connected") return;
    send({ type: "create-room", mode: "radio" });
  };

  const handleCreateAppleRoom = async () => {
    if (connStatus !== "connected") return;
    const kit = appleKitRef.current;
    if (!kit) { setAppleError("MusicKit not ready yet. Wait a moment and try again."); return; }
    if (!kit.isAuthorized) {
      try { await kit.authorize(); setAppleAuthorized(true); } catch { setAppleError("Apple Music sign-in was cancelled."); return; }
    }
    send({ type: "create-room", mode: "apple" });
  };

  const handleJoinRoom = () => {
    if (!joinCode || joinCode.length !== 4 || connStatus !== "connected") return;
    setPhase("joining");
    send({ type: "join-room", code: joinCode });
  };

  const handleLogout = () => {
    clearTokens(); setSpotifyToken(null); setSpotifyReady(false); setNowPlaying(null);
    setIsSyncing(false); setSpotifyActivated(false); spotifyActivatedRef.current = false;
    if (syncIntervalRef.current) { clearInterval(syncIntervalRef.current); syncIntervalRef.current = null; }
  };

  // Listener chooses their service
  const handleChooseListenerService = async (svc: "apple" | "spotify") => {
    listenerServiceRef.current = svc;
    setListenerService(svc);
    if (svc === "spotify") {
      if (!spotifyToken) { startLogin("join", myRoomCodeRef.current || joinCode); return; }
      setShouldInitSdk(true);
    } else {
      // Apple
      const kit = appleKitRef.current;
      if (kit && !kit.isAuthorized) {
        try { await kit.authorize(); setAppleAuthorized(true); } catch { setAppleError("Apple Music sign-in was cancelled."); setListenerService(null); listenerServiceRef.current = null; }
      }
    }
  };

  const handleActivateSpotify = async () => {
    const player = spotifyPlayerRef.current;
    if (!player) return;
    try { await player.activateElement(); } catch { /* ignore */ }
    spotifyActivatedRef.current = true;
    setSpotifyActivated(true);
    setListenerActivated(true);
    const pending = pendingSpotifyPlayRef.current;
    if (pending) {
      pendingSpotifyPlayRef.current = null;
      const elapsed = Math.max(0, Date.now() - pending.startAt);
      execSpotifyPlay(pending.uri, pending.positionMs + elapsed, Date.now());
    } else {
      try { const state = await player.getCurrentState(); if (state && state.paused) await player.resume(); } catch { /* ignore */ }
    }
    send({ type: "request-sync" });
  };

  const handleActivateApple = async () => {
    const kit = appleKitRef.current;
    if (!kit) return;
    // Unlock the browser's audio context while we're still inside the user gesture
    try {
      const ctx = new AudioContext();
      await ctx.resume();
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      await new Promise<void>((r) => setTimeout(r, 50));
      ctx.close();
    } catch { /* ignore */ }
    setListenerActivated(true);
    const pending = pendingApplePlayRef.current;
    if (pending) { pendingApplePlayRef.current = null; await execApplePlay(pending.songId, pending.positionMs, pending.startAt); }
    else send({ type: "request-sync" });
  };

  // Apple host — song picker (to set the initial song; then they can use Apple Music app controls)
  const handleApplePickerSearch = (q: string) => {
    setApplePickerQuery(q);
    if (applePickerTimerRef.current) clearTimeout(applePickerTimerRef.current);
    if (!q.trim()) { setApplePickerResults([]); return; }
    applePickerTimerRef.current = setTimeout(async () => {
      const kit = appleKitRef.current;
      if (!kit) return;
      setApplePickerLoading(true);
      try {
        const res = await kit.api.search(q, { types: "songs", limit: 8 });
        setApplePickerResults(res.songs?.data ?? []);
      } catch { setApplePickerResults([]); }
      finally { setApplePickerLoading(false); }
    }, 500);
  };

  const handleApplePickSong = async (item: AppleMusicItem) => {
    const kit = appleKitRef.current;
    if (!kit) return;
    try {
      await kit.setQueue({ song: item.id, startPosition: 0 });
      await kit.seekToTime(0);
      await kit.play();
      setAppleNowPlaying({ id: item.id, name: item.attributes.name, artist: item.attributes.artistName, albumArt: getArtworkUrl(item, 300) });
      setApplePlaying(true);
      setApplePickerResults([]);
      setApplePickerQuery("");
      setApplePickerOpen(false);
      // Immediately broadcast
      const startAt = Date.now() + SYNC_LEAD_MS;
      send({ type: "apple-play", songId: item.id, songName: item.attributes.name, artistName: item.attributes.artistName, albumArt: getArtworkUrl(item, 300), positionMs: SYNC_LEAD_MS, startAt });
      if (!appleIsSyncing) handleStartAppleSync();
    } catch (err) { setAppleError(err instanceof Error ? err.message : "Could not play this song."); }
  };

  const handleForceSync = () => {
    if (phase === "hosting") {
      if (roomMode === "spotify") pollAndSync();
      else if (roomMode === "apple") applePollAndSync();
      else if (roomMode === "radio" && radioStation) send({ type: "radio-play", ...radioStation });
    } else if (phase === "joined") send({ type: "request-sync" });
  };

  const copyCode = () => {
    navigator.clipboard.writeText(roomCode).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const handleEnableAudio = () => {
    const el = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAIA");
    el.volume = 0;
    el.play().then(() => el.pause()).catch(() => {});
    setAudioEnabled(true);
  };

  // ── Audio gate ─────────────────────────────────────────────────────────────

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
          <button onClick={handleEnableAudio}
            className="group flex flex-col items-center gap-4 w-56 py-8 px-6 rounded-2xl bg-primary/10 border-2 border-primary/40 hover:bg-primary/20 hover:border-primary/70 active:scale-95 transition-all">
            <div className="w-16 h-16 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center group-hover:bg-primary/30 transition-colors">
              <Volume2 className="w-8 h-8 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-semibold text-foreground">Tap to Enable Audio</p>
              <p className="text-xs text-muted-foreground leading-snug">Required by your browser before<br />synchronized playback can work</p>
            </div>
          </button>
          <p className="text-xs text-muted-foreground/60">Tap once — no permissions needed</p>
        </div>
      </div>
    );
  }

  // ── Shared UI pieces ───────────────────────────────────────────────────────

  const connDot = connStatus === "connected" ? "bg-green-400" : connStatus === "connecting" ? "bg-yellow-400 animate-pulse" : "bg-red-400";

  const RoomCodeCard = () => (
    <div className="bg-card border border-card-border rounded-2xl p-6 text-center space-y-3 shadow-lg">
      <div className="flex items-center justify-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-widest">
        {roomMode === "spotify" ? <span className="text-[#1DB954]">● Spotify</span>
          : roomMode === "apple" ? <span className="text-pink-400 flex items-center gap-1.5"><AppleLogo size={3.5} className="fill-pink-400" /> Apple Music</span>
          : <span className="flex items-center gap-1.5"><Radio className="w-3.5 h-3.5" /> Radio</span>}
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
        {clientConnected ? "Listener connected" : "Waiting for listener…"}
      </div>
    </div>
  );

  // ── Listener service selector ──────────────────────────────────────────────

  const ListenerServicePicker = () => (
    <div className="bg-card border border-card-border rounded-2xl p-6 space-y-4 shadow-lg">
      <div className="text-center space-y-1">
        <h3 className="text-sm font-semibold">Choose your music service</h3>
        <p className="text-xs text-muted-foreground">Pick the service you want to listen through. Music will sync automatically.</p>
      </div>
      <button onClick={() => handleChooseListenerService("apple")}
        className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-pink-500/30 hover:border-pink-500/70 hover:bg-pink-500/5 active:scale-[0.98] transition-all text-left">
        <div className="w-12 h-12 rounded-xl bg-pink-500/20 flex items-center justify-center flex-shrink-0">
          <AppleLogo size={6} className="fill-pink-400" />
        </div>
        <div>
          <p className="font-semibold text-sm">Apple Music</p>
          <p className="text-xs text-muted-foreground mt-0.5">{appleAuthorized ? "Already signed in" : "Sign in with Apple ID"}</p>
        </div>
      </button>
      <button onClick={() => handleChooseListenerService("spotify")}
        className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-[#1DB954]/30 hover:border-[#1DB954]/70 hover:bg-[#1DB954]/5 active:scale-[0.98] transition-all text-left">
        <div className="w-12 h-12 rounded-xl bg-[#1DB954]/20 flex items-center justify-center flex-shrink-0">
          <SpotifyLogo size={6} />
        </div>
        <div>
          <p className="font-semibold text-sm">Spotify</p>
          <p className="text-xs text-muted-foreground mt-0.5">{spotifyToken ? "Already logged in" : "Requires Premium · tap to log in"}</p>
        </div>
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
      </div>
      <div className="relative z-10 max-w-sm mx-auto px-4 py-6 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Radio className="w-4 h-4 text-primary" />
            </div>
            <span className="font-bold text-lg tracking-tight">SyncWave</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className={`w-1.5 h-1.5 rounded-full ${connDot}`} />
            {connStatus === "connected" ? "Live" : connStatus === "connecting" ? "Connecting…" : "Offline"}
          </div>
        </div>

        {/* Banners */}
        {errorMsg && <div className="bg-destructive/20 border border-destructive/40 rounded-xl px-4 py-3 text-destructive-foreground text-sm text-center">{errorMsg}</div>}
        {spotifyError && (
          <div className="bg-orange-500/20 border border-orange-500/40 rounded-xl px-4 py-3 text-orange-200 text-sm flex items-start gap-2">
            <span className="flex-1">{spotifyError}</span>
            <button onClick={() => setSpotifyError(null)}><X className="w-4 h-4 mt-0.5" /></button>
          </div>
        )}
        {appleError && (
          <div className="bg-pink-500/20 border border-pink-500/40 rounded-xl px-4 py-3 text-pink-200 text-sm flex items-start gap-2">
            <span className="flex-1">{appleError}</span>
            <button onClick={() => setAppleError(null)}><X className="w-4 h-4 mt-0.5" /></button>
          </div>
        )}
        {hostDisconnected && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3 flex items-center justify-between gap-2">
            <span className="text-yellow-300 text-sm">Host stepped away — waiting to reconnect…</span>
            <button onClick={() => setHostDisconnected(false)}><X className="w-4 h-4 text-yellow-400" /></button>
          </div>
        )}

        {/* ── IDLE ── */}
        {phase === "idle" && !choosingMode && (
          <div className="bg-card border border-card-border rounded-2xl p-6 space-y-4 shadow-lg">
            <h2 className="text-lg font-semibold text-center">Get Started</h2>
            <div className="space-y-3">
              <button onClick={() => setChoosingMode(true)} disabled={connStatus !== "connected"}
                className="w-full py-3 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                Create a Room (Host)
              </button>
              <div className="relative flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">or join</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="flex gap-2">
                <input type="text" inputMode="numeric" maxLength={4} placeholder="4-digit code" value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  onKeyDown={(e) => e.key === "Enter" && handleJoinRoom()}
                  className="flex-1 bg-input border border-border rounded-xl px-4 py-3 text-center text-lg font-mono tracking-widest text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                <button onClick={handleJoinRoom} disabled={joinCode.length !== 4 || connStatus !== "connected"}
                  className="px-4 py-3 rounded-xl bg-secondary text-secondary-foreground font-semibold text-sm hover:bg-accent active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed">
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
              <button onClick={() => setChoosingMode(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <button onClick={handleCreateSpotifyRoom}
              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-[#1DB954]/30 hover:border-[#1DB954]/70 hover:bg-[#1DB954]/5 active:scale-[0.98] transition-all text-left">
              <div className="w-12 h-12 rounded-xl bg-[#1DB954]/20 flex items-center justify-center flex-shrink-0"><SpotifyLogo size={6} /></div>
              <div>
                <p className="font-semibold text-sm">Spotify</p>
                <p className="text-xs text-muted-foreground mt-0.5">{spotifyToken ? "Play anything in Spotify — it syncs automatically" : "Requires Premium · tap to log in"}</p>
              </div>
            </button>
            <button onClick={handleCreateAppleRoom}
              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-pink-500/30 hover:border-pink-500/70 hover:bg-pink-500/5 active:scale-[0.98] transition-all text-left">
              <div className="w-12 h-12 rounded-xl bg-pink-500/20 flex items-center justify-center flex-shrink-0"><AppleLogo size={6} className="fill-pink-400" /></div>
              <div>
                <p className="font-semibold text-sm">Apple Music</p>
                <p className="text-xs text-muted-foreground mt-0.5">{appleReady ? (appleAuthorized ? "Pick a song — the other phone follows" : "Sign in with Apple ID") : "Loading…"}</p>
              </div>
            </button>
            <button onClick={handleCreateRadioRoom}
              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-border hover:border-primary/50 hover:bg-accent/30 active:scale-[0.98] transition-all text-left">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0"><Radio className="w-6 h-6 text-primary" /></div>
              <div>
                <p className="font-semibold text-sm">Radio Stations</p>
                <p className="text-xs text-muted-foreground mt-0.5">Stream live US radio · free, no login</p>
              </div>
            </button>
          </div>
        )}

        {/* ── JOINING ── */}
        {phase === "joining" && (
          <div className="bg-card border border-card-border rounded-2xl p-6 text-center space-y-3">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-muted-foreground text-sm">Joining room…</p>
          </div>
        )}

        {/* ── HOSTING: Spotify ── */}
        {phase === "hosting" && roomMode === "spotify" && (
          <div className="space-y-4">
            <RoomCodeCard />
            <div className="bg-card border border-card-border rounded-2xl p-6 space-y-4 shadow-lg">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Spotify Auto-Sync</h3>
                <button onClick={handleLogout} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><LogOut className="w-3.5 h-3.5 text-muted-foreground" /></button>
              </div>
              {!isSyncing && (
                <div className="bg-secondary/50 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-medium">How it works</p>
                  <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Open the <strong className="text-foreground">Spotify app</strong> and start playing</li>
                    <li>Come back here and tap <strong className="text-foreground">Start Syncing</strong></li>
                    <li>Skip tracks in Spotify — the listener follows automatically</li>
                  </ol>
                </div>
              )}
              {nowPlaying && <NowPlayingCard track={nowPlaying} playing={spotifyPlaying} />}
              {isSyncing && noActivePlayback && <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-3 py-2.5"><span className="text-yellow-400 text-xs">Open Spotify on your phone and play something</span></div>}
              {isSyncing && !noActivePlayback && nowPlaying && <div className="flex items-center gap-2 text-xs text-[#1DB954]"><RefreshCw className="w-3.5 h-3.5 animate-spin" />Live · skip tracks in Spotify, the listener follows</div>}
              {!isSyncing
                ? <button onClick={handleStartSync} className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-[#1DB954] text-black font-bold text-base hover:opacity-90 active:scale-[0.97] transition-all shadow-lg"><SpotifyLogo size={5} />Start Syncing</button>
                : <div className="space-y-2">
                    <button onClick={handleStopSync} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-secondary font-semibold hover:bg-accent active:scale-[0.97] transition-all"><Pause className="w-4 h-4" /> Stop Syncing</button>
                    <button onClick={handleForceSync} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-secondary/60 text-muted-foreground text-xs font-medium hover:bg-accent hover:text-foreground active:scale-[0.97] transition-all"><RefreshCw className="w-3.5 h-3.5" /> Force Sync</button>
                  </div>}
              <p className="text-xs text-muted-foreground text-center">Spotify Premium required · use Chrome on Android</p>
            </div>
          </div>
        )}

        {/* ── HOSTING: Apple Music ── */}
        {phase === "hosting" && roomMode === "apple" && (
          <div className="space-y-4">
            <RoomCodeCard />
            <div className="bg-card border border-card-border rounded-2xl p-6 space-y-4 shadow-lg">
              <h3 className="text-sm font-semibold flex items-center gap-2"><AppleLogo size={4} className="fill-pink-400" /> Apple Music Auto-Sync</h3>
              {!appleIsSyncing && !appleNowPlaying && (
                <div className="bg-secondary/50 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-medium">How it works</p>
                  <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Search for a song below and tap it to start playing</li>
                    <li>Tap <strong className="text-foreground">Start Syncing</strong> — the listener hears the same song</li>
                    <li>Search and pick new songs anytime; the listener follows automatically</li>
                  </ol>
                  <p className="text-xs text-muted-foreground/70 pt-1">Note: Apple Music plays through this browser tab (not the Apple Music app)</p>
                </div>
              )}

              {/* Song search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input type="text" placeholder="Search Apple Music…" value={applePickerQuery}
                  onChange={(e) => { setApplePickerOpen(true); handleApplePickerSearch(e.target.value); }}
                  onFocus={() => setApplePickerOpen(true)}
                  className="w-full bg-secondary/60 border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                {applePickerLoading && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border border-pink-400 border-t-transparent rounded-full animate-spin" />}
                {applePickerQuery && !applePickerLoading && <button onClick={() => { setApplePickerQuery(""); setApplePickerResults([]); setApplePickerOpen(false); }} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="w-3.5 h-3.5 text-muted-foreground" /></button>}
              </div>

              {applePickerOpen && applePickerResults.length > 0 && (
                <div className="space-y-1 max-h-56 overflow-y-auto border border-border rounded-xl overflow-hidden">
                  {applePickerResults.map((item) => (
                    <button key={item.id} onClick={() => handleApplePickSong(item)}
                      className="w-full flex items-center gap-3 p-2.5 hover:bg-accent/50 active:scale-[0.98] transition-all text-left">
                      <img src={getArtworkUrl(item, 80)} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0 bg-secondary" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.attributes.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{item.attributes.artistName}</p>
                      </div>
                      <Play className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {appleNowPlaying && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground font-medium">Now playing</p>
                  <NowPlayingCard track={appleNowPlaying} playing={applePlaying} accentColor="#fc3c44" />
                </div>
              )}

              {appleIsSyncing && appleNoPlayback && <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-3 py-2.5 text-yellow-400 text-xs">Search and pick a song above to start syncing</div>}
              {appleIsSyncing && !appleNoPlayback && appleNowPlaying && <div className="flex items-center gap-2 text-xs text-pink-400"><RefreshCw className="w-3.5 h-3.5 animate-spin" />Live · the listener is following your playback</div>}

              {!appleIsSyncing
                ? <button onClick={handleStartAppleSync} disabled={!appleNowPlaying}
                    className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-pink-500 text-white font-bold text-base hover:opacity-90 active:scale-[0.97] transition-all shadow-lg disabled:opacity-40">
                    <AppleLogo size={5} className="fill-white" /> Start Syncing
                  </button>
                : <div className="space-y-2">
                    <button onClick={handleStopAppleSync} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-secondary font-semibold hover:bg-accent active:scale-[0.97] transition-all"><Pause className="w-4 h-4" /> Stop Syncing</button>
                    <button onClick={handleForceSync} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-secondary/60 text-muted-foreground text-xs font-medium hover:bg-accent hover:text-foreground active:scale-[0.97] transition-all"><RefreshCw className="w-3.5 h-3.5" /> Force Sync</button>
                  </div>}
              <p className="text-xs text-muted-foreground text-center">Apple Music subscription required on both phones</p>
            </div>
          </div>
        )}

        {/* ── HOSTING: Radio ── */}
        {phase === "hosting" && roomMode === "radio" && (
          <div className="space-y-4">
            <RoomCodeCard />
            <div className="bg-card border border-card-border rounded-2xl p-6 space-y-4 shadow-lg">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2"><Radio className="w-4 h-4 text-primary" /> Radio Stations</h3>
                {radioStation && <button onClick={() => { stopRadioAudio(); setRadioStation(null); send({ type: "radio-stop" }); }} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-secondary hover:bg-accent transition-colors"><Pause className="w-3 h-3" /> Stop</button>}
              </div>
              {radioStation && (
                <div className="flex items-center gap-3 bg-accent/30 rounded-xl p-3">
                  {radioStation.favicon ? <img src={radioStation.favicon} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0 bg-secondary" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} /> : <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0"><Radio className="w-5 h-5 text-primary" /></div>}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{radioStation.stationName}</p>
                    {radioPlaying ? <span className="flex items-center gap-1 text-xs text-red-400 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse inline-block" />LIVE</span> : <span className="text-xs text-muted-foreground">Stopped</span>}
                  </div>
                  <button onClick={() => setRadioStation(null)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1">Change</button>
                </div>
              )}
              {radioError && <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-xl px-3 py-2.5"><span className="text-destructive text-xs flex-1">{radioError}</span><button onClick={() => setRadioError(null)}><X className="w-3.5 h-3.5 text-destructive mt-0.5" /></button></div>}
              {radioStation && <button onClick={handleForceSync} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-secondary/60 text-muted-foreground text-xs font-medium hover:bg-accent hover:text-foreground active:scale-[0.97] transition-all"><RefreshCw className="w-3.5 h-3.5" /> Force Sync</button>}
              {!radioStation && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20 flex-shrink-0">🇺🇸 US Only</span>
                    <div className="relative flex-1">
                      <input type="text" placeholder="Search stations…" value={radioSearch} onChange={(e) => handleRadioSearch(e.target.value)}
                        className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                      {radioSearch && <button onClick={() => { setRadioSearch(""); setRadioSearchActive(false); setRadioStations([]); setRadioError(null); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>}
                    </div>
                  </div>
                  {!radioSearchActive && (
                    <>
                      <p className="text-xs text-muted-foreground font-medium">Browse by genre</p>
                      <div className="flex flex-wrap gap-1.5">
                        <button onClick={() => handleSelectGenre("__top__")} className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all active:scale-95 ${selectedGenre === "__top__" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent"}`}>⭐ Top</button>
                        {FEATURED_GENRES.map((g) => (
                          <button key={g.tag} onClick={() => handleSelectGenre(g.tag)} className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all active:scale-95 ${selectedGenre === g.tag ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent"}`}><span>{g.emoji}</span> {g.label}</button>
                        ))}
                      </div>
                    </>
                  )}
                  {radioLoading && <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />Finding stations…</div>}
                  {!radioLoading && radioStations.length > 0 && (
                    <div className="space-y-1 max-h-72 overflow-y-auto">
                      {radioStations.map((station) => (
                        <button key={station.stationuuid} onClick={() => handleSelectStation(station)}
                          className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-accent/50 active:scale-[0.98] transition-all text-left">
                          {station.favicon ? <img src={station.favicon} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0 bg-secondary" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} /> : <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0"><Radio className="w-4 h-4 text-muted-foreground" /></div>}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{station.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{station.state ? `${station.state} · ` : ""}{station.bitrate > 0 ? `${station.bitrate}kbps` : ""}</p>
                          </div>
                          <Play className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                  {!radioLoading && !selectedGenre && !radioSearchActive && <p className="text-center text-xs text-muted-foreground py-3">Tap ⭐ Top or pick a genre to browse</p>}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── JOINED (listener) ── */}
        {phase === "joined" && (
          <div className="space-y-4">
            {/* Room tag */}
            <div className="bg-card border border-card-border rounded-2xl p-5 text-center space-y-2 shadow-lg">
              <div className="text-muted-foreground text-xs font-medium uppercase tracking-widest">
                {roomMode === "spotify" ? <span className="text-[#1DB954]">● Spotify Room</span>
                  : roomMode === "apple" ? <span className="text-pink-400">● Apple Music Room</span>
                  : <span className="text-primary flex items-center justify-center gap-1.5"><Radio className="w-3.5 h-3.5" /> Radio Room</span>}
              </div>
              <div className="text-3xl font-mono font-bold text-primary tracking-widest">{roomCode}</div>
              <div className="flex items-center justify-center gap-2 text-xs font-medium text-green-400">
                <Wifi className="w-3.5 h-3.5" /> Connected to host
              </div>
            </div>

            {/* Radio listener (no service choice needed) */}
            {roomMode === "radio" && (
              <div className="bg-card border border-card-border rounded-2xl p-6 space-y-4 shadow-lg">
                {radioStation ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 bg-accent/30 rounded-xl p-3">
                      {radioStation.favicon ? <img src={radioStation.favicon} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0 bg-secondary" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} /> : <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0"><Radio className="w-6 h-6 text-primary" /></div>}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{radioStation.stationName}</p>
                        {radioPlaying ? <span className="flex items-center gap-1.5 text-xs text-red-400 font-medium mt-0.5"><span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse inline-block" />LIVE</span> : <span className="text-xs text-muted-foreground mt-0.5 block">{radioError ? "Unavailable" : "Connecting…"}</span>}
                      </div>
                    </div>
                    {radioError && <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-xl px-3 py-2.5"><span className="text-destructive text-xs flex-1">{radioError}</span><button onClick={() => setRadioError(null)}><X className="w-3.5 h-3.5 text-destructive mt-0.5" /></button></div>}
                    {radioPlaying && <div className="text-center text-xs font-medium text-green-400">▶ Playing in sync</div>}
                    <button onClick={handleForceSync} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-secondary/60 text-muted-foreground text-xs font-medium hover:bg-accent hover:text-foreground active:scale-[0.97] transition-all"><RefreshCw className="w-3.5 h-3.5" /> Force Sync</button>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <Radio className="w-10 h-10 text-primary/40 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">Waiting for host to pick a station…</p>
                  </div>
                )}
              </div>
            )}

            {/* Non-radio listener: pick your service first */}
            {roomMode !== "radio" && !listenerService && <ListenerServicePicker />}

            {/* Listener chose Apple Music */}
            {roomMode !== "radio" && listenerService === "apple" && (
              <div className="bg-card border border-card-border rounded-2xl p-6 space-y-4 shadow-lg">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold flex items-center gap-2"><AppleLogo size={4} className="fill-pink-400" /> Apple Music</h3>
                  <button onClick={() => { setListenerService(null); listenerServiceRef.current = null; setListenerActivated(false); }} className="text-xs text-muted-foreground hover:text-foreground">Change</button>
                </div>
                {!appleAuthorized ? (
                  <div className="flex flex-col items-center gap-4 py-4 text-center">
                    <AppleLogo size={10} className="fill-pink-400/40" />
                    <button onClick={async () => {
                      const kit = appleKitRef.current;
                      if (!kit) return;
                      try { await kit.authorize(); setAppleAuthorized(true); } catch { setAppleError("Sign-in was cancelled."); }
                    }} className="px-6 py-3 rounded-xl bg-pink-500 text-white font-semibold text-sm hover:opacity-90 active:scale-[0.97] transition-all">
                      Sign in with Apple
                    </button>
                  </div>
                ) : !listenerActivated ? (
                  <button onClick={handleActivateApple} className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-pink-500 text-white font-bold text-base hover:opacity-90 active:scale-[0.97] transition-all shadow-lg">
                    <Volume2 className="w-5 h-5" /> Tap to Start Listening
                  </button>
                ) : (
                  <div className="space-y-3">
                    {appleNowPlaying
                      ? <NowPlayingCard track={appleNowPlaying} playing={applePlaying} accentColor="#fc3c44" />
                      : <div className="text-center py-4 text-sm text-muted-foreground">Waiting for host to play a song…</div>}
                    {appleNowPlaying && <div className={`text-center text-xs font-medium ${applePlaying ? "text-pink-400" : "text-muted-foreground"}`}>{applePlaying ? "▶ Playing in sync" : "Paused"}</div>}
                    <button onClick={handleForceSync} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-secondary/60 text-muted-foreground text-xs font-medium hover:bg-accent hover:text-foreground active:scale-[0.97] transition-all"><RefreshCw className="w-3.5 h-3.5" /> Force Sync</button>
                  </div>
                )}
              </div>
            )}

            {/* Listener chose Spotify */}
            {roomMode !== "radio" && listenerService === "spotify" && (
              <div className="bg-card border border-card-border rounded-2xl p-6 space-y-4 shadow-lg">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold flex items-center gap-2"><SpotifyLogo size={4} /> Spotify</h3>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setListenerService(null); listenerServiceRef.current = null; setListenerActivated(false); setShouldInitSdk(false); }} className="text-xs text-muted-foreground hover:text-foreground">Change</button>
                    {spotifyToken && <button onClick={handleLogout} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><LogOut className="w-3.5 h-3.5 text-muted-foreground" /></button>}
                  </div>
                </div>
                {!spotifyToken ? (
                  <div className="flex flex-col items-center gap-4 py-4 text-center">
                    <SpotifyLogo size={10} />
                    <button onClick={() => startLogin("join", myRoomCodeRef.current || joinCode)} className="px-6 py-3 rounded-xl bg-[#1DB954] text-black font-semibold text-sm hover:opacity-90 active:scale-[0.97] transition-all">
                      Log in with Spotify
                    </button>
                    <p className="text-xs text-muted-foreground">Spotify Premium required</p>
                  </div>
                ) : !spotifyReady ? (
                  <div className="text-center py-4">
                    <div className="w-5 h-5 border-2 border-[#1DB954] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Connecting Spotify player…</p>
                  </div>
                ) : !spotifyActivated ? (
                  <button onClick={handleActivateSpotify} className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-[#1DB954] text-black font-bold text-base hover:opacity-90 active:scale-[0.97] transition-all shadow-lg">
                    <Volume2 className="w-5 h-5" /> Tap to Start Listening
                  </button>
                ) : (
                  <div className="space-y-3">
                    {nowPlaying
                      ? <NowPlayingCard track={nowPlaying} playing={spotifyPlaying} />
                      : <div className="text-center py-4 text-sm text-muted-foreground">Waiting for host to start syncing…</div>}
                    {nowPlaying && (
                      <>
                        {roomMode === "apple" && <p className="text-xs text-muted-foreground text-center">Cross-syncing · Spotify is matching the host's Apple Music track</p>}
                        <div className={`text-center text-xs font-medium ${spotifyPlaying ? "text-[#1DB954]" : "text-muted-foreground"}`}>{spotifyPlaying ? "▶ Playing in sync" : "Paused"}</div>
                        <button onClick={handleForceSync} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-secondary/60 text-muted-foreground text-xs font-medium hover:bg-accent hover:text-foreground active:scale-[0.97] transition-all"><RefreshCw className="w-3.5 h-3.5" /> Force Sync</button>
                      </>
                    )}
                  </div>
                )}
                {spotifyError && <div className="bg-orange-500/20 border border-orange-500/40 rounded-xl px-3 py-2.5 text-orange-200 text-xs">{spotifyError}</div>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // ── Radio helpers (used in hosting panel) ─────────────────────────────────

  function handleRadioSearch(query: string) {
    setRadioSearch(query);
    if (radioSearchTimerRef.current) clearTimeout(radioSearchTimerRef.current);
    if (!query.trim()) { setRadioSearchActive(false); setRadioStations([]); setRadioError(null); return; }
    setRadioSearchActive(true); setSelectedGenre(null);
    radioSearchTimerRef.current = setTimeout(async () => {
      setRadioLoading(true); setRadioError(null);
      const stations = await searchStationsByName(query);
      setRadioLoading(false);
      if (stations.length === 0) setRadioError("No US stations matched your search.");
      else setRadioStations(stations);
    }, 500);
  }

  async function handleSelectGenre(tag: string) {
    setSelectedGenre(tag); setRadioSearch(""); setRadioSearchActive(false); setRadioStations([]); setRadioLoading(true); setRadioError(null);
    const stations = tag === "__top__" ? await fetchTopUSStations() : await fetchStationsByTag(tag);
    setRadioLoading(false);
    if (stations.length === 0) setRadioError("No US stations found for this genre. Try another.");
    else setRadioStations(stations);
  }

  function handleSelectStation(station: RadioStation) {
    setRadioError(null);
    playRadioStream(station.url_resolved, station.name, station.favicon);
    send({ type: "radio-play", streamUrl: station.url_resolved, stationName: station.name, favicon: station.favicon });
  }
}
