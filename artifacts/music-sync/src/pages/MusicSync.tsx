import { useEffect, useRef, useState, useCallback } from "react";
import { Music, Upload, Play, Pause, Wifi, WifiOff, Users, Radio, Copy, Check } from "lucide-react";

type Phase =
  | "idle"
  | "creating"
  | "hosting"
  | "joining"
  | "joined";

type ConnectionStatus = "disconnected" | "connecting" | "connected";

type WsEvent =
  | { type: "room-created"; code: string }
  | { type: "joined-room"; code: string; hasAudio: boolean; audioName: string | null }
  | { type: "client-joined" }
  | { type: "client-disconnected" }
  | { type: "host-disconnected" }
  | { type: "audio-ready"; audioName: string }
  | { type: "play"; startAt: number }
  | { type: "pause" }
  | { type: "seek"; position: number }
  | { type: "error"; message: string };

function getWsUrl() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

export default function MusicSync() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [connStatus, setConnStatus] = useState<ConnectionStatus>("disconnected");
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [audioName, setAudioName] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [clientConnected, setClientConnected] = useState(false);
  const [hostDisconnected, setHostDisconnected] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [audioTime, setAudioTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const myRoomCodeRef = useRef<string>("");
  const myPhaseRef = useRef<Phase>("idle");

  const send = useCallback((data: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }, []);

  const connectWs = useCallback(() => {
    setConnStatus("connecting");
    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;

    ws.onopen = () => setConnStatus("connected");

    ws.onmessage = (event) => {
      let msg: WsEvent;
      try {
        msg = JSON.parse(event.data as string) as WsEvent;
      } catch {
        return;
      }

      if (msg.type === "room-created") {
        setRoomCode(msg.code);
        myRoomCodeRef.current = msg.code;
        setPhase("hosting");
        myPhaseRef.current = "hosting";
      } else if (msg.type === "joined-room") {
        setRoomCode(msg.code);
        myRoomCodeRef.current = msg.code;
        setPhase("joined");
        myPhaseRef.current = "joined";
        if (msg.hasAudio) {
          setAudioName(msg.audioName);
          const audio = new Audio(`/api/rooms/${msg.code}/audio`);
          audioRef.current = audio;
          audio.ontimeupdate = () => setAudioTime(audio.currentTime);
          audio.ondurationchange = () => setAudioDuration(audio.duration);
        }
      } else if (msg.type === "client-joined") {
        setClientConnected(true);
      } else if (msg.type === "client-disconnected") {
        setClientConnected(false);
      } else if (msg.type === "host-disconnected") {
        setHostDisconnected(true);
        setIsPlaying(false);
        if (audioRef.current) {
          audioRef.current.pause();
        }
      } else if (msg.type === "audio-ready") {
        setAudioName(msg.audioName);
        const code = myRoomCodeRef.current;
        const audio = new Audio(`/api/rooms/${code}/audio`);
        audioRef.current = audio;
        audio.ontimeupdate = () => setAudioTime(audio.currentTime);
        audio.ondurationchange = () => setAudioDuration(audio.duration);
      } else if (msg.type === "play") {
        const audio = audioRef.current;
        if (!audio) return;
        const delay = msg.startAt - Date.now();
        const play = () => {
          audio.play().catch(() => {});
          setIsPlaying(true);
        };
        if (delay > 0) {
          setTimeout(play, delay);
        } else {
          play();
        }
      } else if (msg.type === "pause") {
        if (audioRef.current) {
          audioRef.current.pause();
        }
        setIsPlaying(false);
      } else if (msg.type === "seek") {
        if (audioRef.current) {
          audioRef.current.currentTime = msg.position;
        }
      } else if (msg.type === "error") {
        setErrorMsg(msg.message);
        setTimeout(() => setErrorMsg(null), 3000);
      }
    };

    ws.onclose = () => {
      setConnStatus("disconnected");
    };

    ws.onerror = () => {
      setConnStatus("disconnected");
    };
  }, []);

  useEffect(() => {
    connectWs();
    return () => {
      wsRef.current?.close();
    };
  }, [connectWs]);

  const handleCreateRoom = () => {
    if (connStatus !== "connected") return;
    send({ type: "create-room" });
  };

  const handleJoinRoom = () => {
    if (!joinCode || joinCode.length !== 4) return;
    if (connStatus !== "connected") return;
    setPhase("joining");
    send({ type: "join-room", code: joinCode });
  };

  const handleFileUpload = async (file: File) => {
    if (!file || !myRoomCodeRef.current) return;
    setUploadProgress(0);
    const formData = new FormData();
    formData.append("audio", file);

    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setUploadProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      setUploadProgress(null);
      if (xhr.status === 200) {
        const resp = JSON.parse(xhr.responseText) as { audioName: string };
        setAudioName(resp.audioName);
        const url = `/api/rooms/${myRoomCodeRef.current}/audio`;
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.ontimeupdate = () => setAudioTime(audio.currentTime);
        audio.ondurationchange = () => setAudioDuration(audio.duration);
      }
    };
    xhr.onerror = () => {
      setUploadProgress(null);
      setErrorMsg("Upload failed");
      setTimeout(() => setErrorMsg(null), 3000);
    };
    xhr.open("POST", `/api/rooms/${myRoomCodeRef.current}/audio`);
    xhr.send(formData);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handlePlay = () => {
    if (!audioRef.current) return;
    const startAt = Date.now() + 300;
    send({ type: "play", startAt });
  };

  const handlePause = () => {
    send({ type: "pause" });
  };

  const copyCode = () => {
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const isHost = phase === "hosting";
  const isGuest = phase === "joined";
  const inRoom = isHost || isGuest;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      {/* Ambient glow */}
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

        {/* Connection status */}
        <div className={`flex items-center justify-center gap-2 text-xs font-medium transition-all ${
          connStatus === "connected" ? "text-green-400" :
          connStatus === "connecting" ? "text-yellow-400" : "text-red-400"
        }`}>
          {connStatus === "connected" ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          {connStatus === "connected" ? "Connected" : connStatus === "connecting" ? "Connecting..." : "Disconnected"}
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="bg-destructive/20 border border-destructive/40 rounded-xl px-4 py-3 text-destructive-foreground text-sm text-center">
            {errorMsg}
          </div>
        )}

        {/* Host disconnected notice */}
        {hostDisconnected && (
          <div className="bg-destructive/20 border border-destructive/40 rounded-xl px-4 py-3 text-destructive-foreground text-sm text-center">
            Host disconnected. Session ended.
          </div>
        )}

        {/* IDLE — Choose role */}
        {phase === "idle" && (
          <div className="bg-card border border-card-border rounded-2xl p-6 space-y-4 shadow-lg">
            <h2 className="text-lg font-semibold text-center">Get Started</h2>
            <div className="space-y-3">
              <button
                onClick={handleCreateRoom}
                disabled={connStatus !== "connected"}
                className="w-full py-3 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Create a Room (Host)
              </button>
              <div className="relative flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={4}
                  placeholder="4-digit code"
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

        {/* JOINING */}
        {phase === "joining" && (
          <div className="bg-card border border-card-border rounded-2xl p-6 text-center space-y-3">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-muted-foreground text-sm">Joining room...</p>
          </div>
        )}

        {/* HOSTING */}
        {phase === "hosting" && (
          <div className="space-y-4">
            {/* Room code card */}
            <div className="bg-card border border-card-border rounded-2xl p-6 text-center space-y-3 shadow-lg">
              <div className="flex items-center justify-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-widest">
                <Music className="w-3.5 h-3.5" /> Room Code
              </div>
              <div className="flex items-center justify-center gap-3">
                <span className="text-5xl font-mono font-bold text-primary tracking-widest">{roomCode}</span>
                <button onClick={copyCode} className="p-2 rounded-lg bg-secondary hover:bg-accent transition-colors" title="Copy code">
                  {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                </button>
              </div>
              <p className="text-muted-foreground text-xs">Share this code with another device</p>
              <div className={`flex items-center justify-center gap-2 text-xs font-medium ${clientConnected ? "text-green-400" : "text-muted-foreground"}`}>
                <Users className="w-3.5 h-3.5" />
                {clientConnected ? "Listener connected" : "Waiting for listener..."}
              </div>
            </div>

            {/* Audio upload */}
            <div className="bg-card border border-card-border rounded-2xl p-6 space-y-3 shadow-lg">
              <h3 className="text-sm font-semibold text-foreground">Upload Audio</h3>
              {!audioName ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  className="border-2 border-dashed border-border hover:border-primary/50 rounded-xl p-8 text-center cursor-pointer transition-colors group"
                >
                  <Upload className="w-8 h-8 text-muted-foreground group-hover:text-primary mx-auto mb-3 transition-colors" />
                  <p className="text-sm text-muted-foreground">Drop MP3 here or click to browse</p>
                  <p className="text-xs text-muted-foreground mt-1">Max 50MB</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-3 bg-accent/30 rounded-xl p-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Music className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{audioName}</p>
                    <p className="text-xs text-muted-foreground">{formatTime(audioDuration)}</p>
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                  >
                    Change
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                  />
                </div>
              )}

              {uploadProgress !== null && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Uploading...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Playback controls */}
            {audioName && (
              <div className="bg-card border border-card-border rounded-2xl p-6 space-y-4 shadow-lg">
                <h3 className="text-sm font-semibold text-foreground">Synchronized Playback</h3>

                {/* Seek bar */}
                {audioDuration > 0 && (
                  <div className="space-y-1">
                    <input
                      type="range"
                      min={0}
                      max={audioDuration}
                      value={audioTime}
                      onChange={(e) => {
                        const pos = Number(e.target.value);
                        if (audioRef.current) audioRef.current.currentTime = pos;
                        send({ type: "seek", position: pos });
                      }}
                      className="w-full accent-primary cursor-pointer"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{formatTime(audioTime)}</span>
                      <span>{formatTime(audioDuration)}</span>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-center gap-3">
                  {!isPlaying ? (
                    <button
                      onClick={handlePlay}
                      disabled={!audioName}
                      className="flex items-center gap-2 px-8 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
                    >
                      <Play className="w-5 h-5 fill-current" />
                      Play on all devices
                    </button>
                  ) : (
                    <button
                      onClick={handlePause}
                      className="flex items-center gap-2 px-8 py-3.5 rounded-xl bg-secondary text-secondary-foreground font-semibold hover:bg-accent active:scale-[0.97] transition-all shadow-lg"
                    >
                      <Pause className="w-5 h-5 fill-current" />
                      Pause
                    </button>
                  )}
                </div>

                {!clientConnected && (
                  <p className="text-xs text-center text-muted-foreground">
                    Playback will sync when a listener joins
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* JOINED as listener */}
        {phase === "joined" && (
          <div className="space-y-4">
            <div className="bg-card border border-card-border rounded-2xl p-6 text-center space-y-3 shadow-lg">
              <div className="flex items-center justify-center gap-2 text-green-400 text-xs font-medium uppercase tracking-widest">
                <Wifi className="w-3.5 h-3.5" /> Listening in Room
              </div>
              <span className="text-4xl font-mono font-bold text-primary tracking-widest">{roomCode}</span>
            </div>

            <div className="bg-card border border-card-border rounded-2xl p-6 space-y-4 shadow-lg">
              {!audioName ? (
                <div className="text-center py-4 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                    <Music className="w-6 h-6 text-primary/50" />
                  </div>
                  <p className="text-muted-foreground text-sm">Waiting for host to upload audio...</p>
                  <div className="flex items-center justify-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 bg-accent/30 rounded-xl p-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${isPlaying ? "bg-primary/30" : "bg-primary/10"}`}>
                      <Music className={`w-5 h-5 text-primary transition-all ${isPlaying ? "animate-pulse" : ""}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{audioName}</p>
                      <p className="text-xs text-muted-foreground">{formatTime(audioDuration)}</p>
                    </div>
                  </div>

                  {audioDuration > 0 && (
                    <div className="space-y-1">
                      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-200"
                          style={{ width: `${(audioTime / audioDuration) * 100}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{formatTime(audioTime)}</span>
                        <span>{formatTime(audioDuration)}</span>
                      </div>
                    </div>
                  )}

                  <div className="text-center py-2">
                    {isPlaying ? (
                      <div className="flex items-center justify-center gap-2 text-green-400 text-sm font-medium">
                        <div className="flex items-end gap-0.5 h-4">
                          {[1, 2, 3, 4].map((i) => (
                            <div
                              key={i}
                              className="w-1 bg-green-400 rounded-sm animate-bounce"
                              style={{
                                height: `${8 + i * 3}px`,
                                animationDelay: `${i * 80}ms`
                              }}
                            />
                          ))}
                        </div>
                        Now playing...
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-sm">Waiting for host to start playback...</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
