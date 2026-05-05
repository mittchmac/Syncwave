import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, AppStateStatus } from "react-native";
import { useSync } from "./SyncContext";

export interface GolfCourse {
  id: string;
  name: string;
  location: string;
  holes: GolfHole[];
  par: number;
}

export interface GolfHole {
  number: number;
  par: number;
  yards: { black: number; blue: number; white: number; red: number };
  handicap: number;
  pin: { lat: number; lng: number };
  tee: { lat: number; lng: number };
}

export interface Player {
  id: string;
  name: string;
  handicap: number;
}

export interface HoleScore {
  [playerId: string]: number | null;
}

export interface RoundState {
  courseId: string | null;
  currentHole: number;
  scores: { [hole: number]: HoleScore };
  players: Player[];
  startedAt: number | null;
  roomCode: string | null;
}

interface GolfContextValue {
  course: GolfCourse | null;
  round: RoundState;
  players: Player[];
  currentHole: number;
  setCourse: (course: GolfCourse) => void;
  startRound: (course: GolfCourse, players: Player[], roomCode?: string) => void;
  endRound: () => void;
  setCurrentHole: (hole: number) => void;
  setScore: (hole: number, playerId: string, strokes: number | null) => void;
  addPlayer: (name: string, handicap?: number) => void;
  removePlayer: (id: string) => void;
  updatePlayer: (id: string, updates: Partial<Player>) => void;
  totalScore: (playerId: string) => number;
  scoreToPar: (playerId: string) => number;
  holeScore: (hole: number, playerId: string) => number | null;
  isRoundActive: boolean;
}

const defaultRound: RoundState = {
  courseId: null,
  currentHole: 1,
  scores: {},
  players: [],
  startedAt: null,
  roomCode: null,
};

const GolfContext = createContext<GolfContextValue | null>(null);

const STORAGE_KEY = "golf_round_state";
const PLAYERS_KEY = "golf_players";

export function GolfProvider({ children }: { children: React.ReactNode }) {
  const [course, setCourseState] = useState<GolfCourse | null>(null);
  const [round, setRound] = useState<RoundState>(defaultRound);
  const [players, setPlayers] = useState<Player[]>([
    { id: "p1", name: "Player 1", handicap: 18 },
  ]);
  const { sendMessage, lastMessage } = useSync();
  const appState = useRef(AppState.currentState);

  // Load persisted state
  useEffect(() => {
    (async () => {
      try {
        const [roundData, playersData] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(PLAYERS_KEY),
        ]);
        if (roundData) {
          const parsed: RoundState = JSON.parse(roundData);
          setRound(parsed);
        }
        if (playersData) {
          setPlayers(JSON.parse(playersData));
        }
      } catch {
        // ignore parse errors
      }
    })();
  }, []);

  // Listen for WebSocket golf messages
  useEffect(() => {
    if (!lastMessage) return;
    if (lastMessage.type === "golf-score-update") {
      const { hole, playerId, strokes } = lastMessage as {
        type: string;
        hole: number;
        playerId: string;
        strokes: number | null;
      };
      setRound((prev) => ({
        ...prev,
        scores: {
          ...prev.scores,
          [hole]: { ...(prev.scores[hole] ?? {}), [playerId]: strokes },
        },
      }));
    } else if (lastMessage.type === "golf-hole-change") {
      const { hole } = lastMessage as { type: string; hole: number };
      setRound((prev) => ({ ...prev, currentHole: hole }));
    }
  }, [lastMessage]);

  // Persist round & players on change
  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(round)).catch(() => {});
  }, [round]);

  useEffect(() => {
    AsyncStorage.setItem(PLAYERS_KEY, JSON.stringify(players)).catch(() => {});
  }, [players]);

  const setCourse = useCallback((c: GolfCourse) => {
    setCourseState(c);
  }, []);

  const startRound = useCallback(
    (c: GolfCourse, newPlayers: Player[], roomCode?: string) => {
      setCourseState(c);
      const newRound: RoundState = {
        courseId: c.id,
        currentHole: 1,
        scores: {},
        players: newPlayers,
        startedAt: Date.now(),
        roomCode: roomCode ?? null,
      };
      setRound(newRound);
      setPlayers(newPlayers);
    },
    []
  );

  const endRound = useCallback(() => {
    setRound(defaultRound);
    setCourseState(null);
  }, []);

  const setCurrentHole = useCallback(
    (hole: number) => {
      setRound((prev) => ({ ...prev, currentHole: hole }));
      sendMessage({ type: "golf-hole-change", hole });
    },
    [sendMessage]
  );

  const setScore = useCallback(
    (hole: number, playerId: string, strokes: number | null) => {
      setRound((prev) => ({
        ...prev,
        scores: {
          ...prev.scores,
          [hole]: { ...(prev.scores[hole] ?? {}), [playerId]: strokes },
        },
      }));
      sendMessage({ type: "golf-score-update", hole, playerId, strokes });
    },
    [sendMessage]
  );

  const addPlayer = useCallback((name: string, handicap = 18) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2, 7);
    setPlayers((prev) => [...prev, { id, name, handicap }]);
  }, []);

  const removePlayer = useCallback((id: string) => {
    setPlayers((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const updatePlayer = useCallback((id: string, updates: Partial<Player>) => {
    setPlayers((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
    );
  }, []);

  const totalScore = useCallback(
    (playerId: string) => {
      return Object.values(round.scores).reduce((sum, holeScores) => {
        const s = holeScores[playerId];
        return sum + (s ?? 0);
      }, 0);
    },
    [round.scores]
  );

  const scoreToPar = useCallback(
    (playerId: string) => {
      if (!course) return 0;
      let holesPlayed = 0;
      const total = Object.entries(round.scores).reduce(
        (sum, [holeStr, holeScores]) => {
          const s = holeScores[playerId];
          if (s != null) {
            const h = course.holes[parseInt(holeStr) - 1];
            holesPlayed++;
            return sum + s - (h?.par ?? 4);
          }
          return sum;
        },
        0
      );
      return total;
    },
    [round.scores, course]
  );

  const holeScore = useCallback(
    (hole: number, playerId: string) => {
      return round.scores[hole]?.[playerId] ?? null;
    },
    [round.scores]
  );

  return (
    <GolfContext.Provider
      value={{
        course,
        round,
        players,
        currentHole: round.currentHole,
        setCourse,
        startRound,
        endRound,
        setCurrentHole,
        setScore,
        addPlayer,
        removePlayer,
        updatePlayer,
        totalScore,
        scoreToPar,
        holeScore,
        isRoundActive: round.startedAt !== null,
      }}
    >
      {children}
    </GolfContext.Provider>
  );
}

export function useGolf(): GolfContextValue {
  const ctx = useContext(GolfContext);
  if (!ctx) throw new Error("useGolf must be used within GolfProvider");
  return ctx;
}
