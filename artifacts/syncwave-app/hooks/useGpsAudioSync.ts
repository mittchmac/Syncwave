/**
 * useGpsAudioSync
 *
 * Ties together three things for radio sync:
 *  1. GPS distance → speed-of-sound delay (delay listener's audio start)
 *  2. Sync-ping heartbeat → smooth playback-rate correction instead of hard seeks
 *
 * Physics:
 *   Sound travels at ~343 m/s.
 *   If a listener is 100 m from the host, they'd naturally hear sound ~291 ms later.
 *   We delay the listener's stream start by exactly that amount, then use tiny
 *   playback-rate nudges (±4%) to maintain the offset as both devices drift.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import * as Location from "expo-location";
import { useSync } from "@/context/SyncContext";
import { useAudio } from "@/context/AudioContext";
import { distanceMeters, soundDelayMs } from "@/lib/gpsDistance";

const RATE_NUDGE = 0.04;           // ±4% — inaudible at this level
const DRIFT_APPLY_THRESHOLD = 150; // ms — only nudge if drift exceeds this
const DRIFT_HARD_SEEK_MS = 5000;   // ms — if >5 s off, just accept it (live stream edge)
const GPS_INTERVAL_MS = 8000;      // how often listener re-reads their own GPS
const RATE_RESTORE_TIMEOUT = 6000; // ms of correct rate before returning to 1.0x

export interface GpsAudioSyncState {
  distanceM: number | null;
  soundOffsetMs: number | null;
  driftMs: number | null;
  rateAdjust: number;
  gpsStatus: "idle" | "acquiring" | "active" | "denied";
}

export function useGpsAudioSync(enabled: boolean) {
  const { hostGps, lastSyncPing, broadcastGps, phase, roomMode } = useSync();
  const { streamStartedAt, setPlaybackRate } = useAudio();

  const [state, setState] = useState<GpsAudioSyncState>({
    distanceM: null,
    soundOffsetMs: null,
    driftMs: null,
    rateAdjust: 1.0,
    gpsStatus: "idle",
  });

  const myGpsRef = useRef<{ lat: number; lng: number } | null>(null);
  const rateRestoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentRateRef = useRef(1.0);

  // ── Own GPS acquisition ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || phase !== "joined" || roomMode !== "radio") return;

    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      setState((s) => ({ ...s, gpsStatus: "acquiring" }));
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== "granted") {
        setState((s) => ({ ...s, gpsStatus: "denied" }));
        return;
      }

      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: GPS_INTERVAL_MS, distanceInterval: 5 },
        (loc) => {
          if (cancelled) return;
          const { latitude: lat, longitude: lng } = loc.coords;
          myGpsRef.current = { lat, lng };
          broadcastGps(lat, lng);
          setState((s) => ({ ...s, gpsStatus: "active" }));
        },
      );
    })();

    return () => {
      cancelled = true;
      sub?.remove();
      setState((s) => ({ ...s, gpsStatus: "idle" }));
    };
  }, [enabled, phase, roomMode, broadcastGps]);

  // ── Distance + sound-delay recalculation whenever host GPS changes ──────────
  useEffect(() => {
    if (!hostGps || !myGpsRef.current) return;
    const distM = distanceMeters(myGpsRef.current.lat, myGpsRef.current.lng, hostGps.lat, hostGps.lng);
    const offsetMs = soundDelayMs(distM);
    setState((s) => ({ ...s, distanceM: distM, soundOffsetMs: offsetMs }));
  }, [hostGps]);

  // ── Rate correction on each sync-ping ──────────────────────────────────────
  const applyRateCorrection = useCallback((targetRate: number, driftMs: number) => {
    if (Math.abs(targetRate - currentRateRef.current) < 0.005) return;

    // Cancel any pending restore
    if (rateRestoreTimerRef.current) clearTimeout(rateRestoreTimerRef.current);

    currentRateRef.current = targetRate;
    setPlaybackRate(targetRate);
    setState((s) => ({ ...s, rateAdjust: targetRate, driftMs }));

    // Schedule restoring to 1.0x after the nudge window
    rateRestoreTimerRef.current = setTimeout(() => {
      currentRateRef.current = 1.0;
      setPlaybackRate(1.0);
      setState((s) => ({ ...s, rateAdjust: 1.0 }));
    }, RATE_RESTORE_TIMEOUT);
  }, [setPlaybackRate]);

  useEffect(() => {
    if (!lastSyncPing || !streamStartedAt) return;

    const soundOffset = state.soundOffsetMs ?? 0;

    // How long the host's stream has been playing (accounting for network one-way delay)
    const networkOneWay = Math.max(0, (lastSyncPing.relayedAt - lastSyncPing.sentAt));
    const hostStreamAge = lastSyncPing.streamAgeMs + networkOneWay;

    // How long our stream has been playing
    const listenerStreamAge = Date.now() - streamStartedAt;

    // We WANT to be exactly soundOffset ms behind the host's stream age.
    // Positive drift = we're running ahead of target (need to slow down).
    // Negative drift = we're behind target (need to speed up).
    const targetListenerAge = hostStreamAge - soundOffset;
    const driftMs = listenerStreamAge - targetListenerAge;

    if (Math.abs(driftMs) < DRIFT_APPLY_THRESHOLD) {
      // Within tolerance — restore to 1.0x if we were nudging
      if (currentRateRef.current !== 1.0) {
        applyRateCorrection(1.0, driftMs);
      } else {
        setState((s) => ({ ...s, driftMs }));
      }
      return;
    }

    if (Math.abs(driftMs) > DRIFT_HARD_SEEK_MS) {
      // Too far gone (e.g. app was backgrounded) — live stream, just accept current position
      setState((s) => ({ ...s, driftMs }));
      return;
    }

    // Apply a gentle nudge
    const rate = driftMs > 0
      ? 1.0 - RATE_NUDGE  // ahead → slow down
      : 1.0 + RATE_NUDGE; // behind → speed up

    applyRateCorrection(rate, driftMs);
  }, [lastSyncPing, streamStartedAt, state.soundOffsetMs, applyRateCorrection]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (rateRestoreTimerRef.current) clearTimeout(rateRestoreTimerRef.current);
    };
  }, []);

  return state;
}
