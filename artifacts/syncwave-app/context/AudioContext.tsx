import { useAudioPlayer, setAudioModeAsync } from "expo-audio";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

interface AudioContextValue {
  isPlaying: boolean;
  currentUrl: string | null;
  stationName: string | null;
  playStream: (url: string, name: string) => Promise<void>;
  stopStream: () => Promise<void>;
}

const AudioCtx = createContext<AudioContextValue | null>(null);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [stationName, setStationName] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const player = useAudioPlayer(null);

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
  }, [player]);

  const playStream = useCallback(async (url: string, name: string) => {
    try {
      player.replace({ uri: url });
      player.play();
      setCurrentUrl(url);
      setStationName(name);
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  }, [player]);

  return (
    <AudioCtx.Provider value={{ isPlaying, currentUrl, stationName, playStream, stopStream }}>
      {children}
    </AudioCtx.Provider>
  );
}

export function useAudio() {
  const ctx = useContext(AudioCtx);
  if (!ctx) throw new Error("useAudio must be used within AudioProvider");
  return ctx;
}
