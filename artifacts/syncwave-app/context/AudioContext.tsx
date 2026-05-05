import { useAudioPlayer, setAudioModeAsync } from "expo-audio";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

interface AudioContextValue {
  isPlaying: boolean;
  currentUrl: string | null;
  stationName: string | null;
  streamStartedAt: number | null;
  playbackRate: number;
  playStream: (url: string, name: string) => Promise<void>;
  stopStream: () => Promise<void>;
  setPlaybackRate: (rate: number) => void;
}

const AudioCtx = createContext<AudioContextValue | null>(null);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [stationName, setStationName] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [streamStartedAt, setStreamStartedAt] = useState<number | null>(null);
  const [playbackRate, setPlaybackRateState] = useState(1.0);

  const player = useAudioPlayer(null);
  const rateRef = useRef(1.0);

  useEffect(() => {
    setAudioModeAsync({
      allowsRecording: false,
      shouldPlayInBackground: true,
      playsInSilentMode: true,
      shouldRouteThroughEarpiece: false,
    }).catch(() => {});
  }, []);

  const stopStream = useCallback(async () => {
    try {
      player.pause();
    } catch {}
    setIsPlaying(false);
    setCurrentUrl(null);
    setStationName(null);
    setStreamStartedAt(null);
    setPlaybackRateState(1.0);
    rateRef.current = 1.0;
    try { player.playbackRate = 1.0; } catch {}
  }, [player]);

  const playStream = useCallback(async (url: string, name: string) => {
    try {
      player.replace({ uri: url });
      player.play();
      setCurrentUrl(url);
      setStationName(name);
      setIsPlaying(true);
      setStreamStartedAt(Date.now());
    } catch {
      setIsPlaying(false);
    }
  }, [player]);

  const setPlaybackRate = useCallback((rate: number) => {
    const clamped = Math.min(Math.max(rate, 0.5), 2.0);
    if (Math.abs(clamped - rateRef.current) < 0.005) return;
    rateRef.current = clamped;
    setPlaybackRateState(clamped);
    try { player.playbackRate = clamped; } catch {}
  }, [player]);

  return (
    <AudioCtx.Provider value={{
      isPlaying, currentUrl, stationName,
      streamStartedAt, playbackRate,
      playStream, stopStream, setPlaybackRate,
    }}>
      {children}
    </AudioCtx.Provider>
  );
}

export function useAudio() {
  const ctx = useContext(AudioCtx);
  if (!ctx) throw new Error("useAudio must be used within AudioProvider");
  return ctx;
}
