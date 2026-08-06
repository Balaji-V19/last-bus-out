"use client";

import { useCallback, useEffect, useRef } from "react";
import type { GameChapter } from "./game3d/scene";

type AnalyticsValue = string | number | boolean;
type AnalyticsData = Record<string, AnalyticsValue>;

type UmamiTracker = {
  track: (event: string, data?: AnalyticsData) => void;
};

declare global {
  interface Window {
    umami?: UmamiTracker;
  }
}

export type GameplayAnalyticsMode =
  | "menu"
  | "intro"
  | "tutorial"
  | "playing"
  | "paused"
  | "ending";

export type GameplayAnalyticsSnapshot = {
  mode: GameplayAnalyticsMode;
  chapter: GameChapter;
  step: number;
  health: number;
  infection: number;
  kills: number;
  survivors: number;
  survivalWave: number;
};

type SessionEntry = "new" | "continue" | "endless";

type AnalyticsSession = {
  started: boolean;
  activeSince: number | null;
  activeSeconds: number;
  entry: SessionEntry;
};

const ACTIVE_MODES = new Set<GameplayAnalyticsMode>([
  "intro",
  "tutorial",
  "playing",
]);

function inputProfile() {
  if (typeof window === "undefined") return "unknown";
  if (window.matchMedia("(pointer: coarse)").matches) return "touch";
  return "keyboard-mouse";
}

function send(event: string, data: AnalyticsData) {
  if (typeof window === "undefined") return;
  try {
    window.umami?.track(event, data);
  } catch {
    // Analytics must never interrupt the game if a tracker or network fails.
  }
}

export function useGameplayAnalytics(snapshot: GameplayAnalyticsSnapshot) {
  const snapshotRef = useRef(snapshot);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const sessionRef = useRef<AnalyticsSession>({
    started: false,
    activeSince: null,
    activeSeconds: 0,
    entry: "new",
  });

  const accrueActiveTime = useCallback(() => {
    const session = sessionRef.current;
    if (session.activeSince === null) return;
    session.activeSeconds += (performance.now() - session.activeSince) / 1000;
    session.activeSince = null;
  }, []);

  const sessionData = useCallback((): AnalyticsData => {
    const session = sessionRef.current;
    const current = snapshotRef.current;
    const runningSeconds =
      session.activeSince === null
        ? 0
        : (performance.now() - session.activeSince) / 1000;
    return {
      entry: session.entry,
      active_seconds: Math.max(
        0,
        Math.round(session.activeSeconds + runningSeconds),
      ),
      chapter: current.chapter,
      objective_step: current.step,
      health: Math.round(current.health),
      infection: Math.round(current.infection),
      kills: current.kills,
      survivors: current.survivors,
      survival_wave: current.survivalWave,
      input: inputProfile(),
    };
  }, []);

  const endSession = useCallback(
    (reason: string) => {
      const session = sessionRef.current;
      if (!session.started) return;
      accrueActiveTime();
      send("game-session-ended", { ...sessionData(), reason });
      session.started = false;
    },
    [accrueActiveTime, sessionData],
  );

  const startSession = useCallback(
    (entry: SessionEntry, chapter: GameChapter, step: number) => {
      if (sessionRef.current.started) endSession("restarted");
      const active =
        ACTIVE_MODES.has(snapshotRef.current.mode) &&
        document.visibilityState === "visible";
      sessionRef.current = {
        started: true,
        activeSince: active ? performance.now() : null,
        activeSeconds: 0,
        entry,
      };
      send("game-started", {
        entry,
        chapter,
        objective_step: step,
        input: inputProfile(),
      });
    },
    [endSession],
  );

  const track = useCallback((event: string, data: AnalyticsData = {}) => {
    const current = snapshotRef.current;
    send(event, {
      chapter: current.chapter,
      objective_step: current.step,
      input: inputProfile(),
      ...data,
    });
  }, []);

  useEffect(() => {
    const updateClock = () => {
      const session = sessionRef.current;
      if (!session.started) return;
      const shouldRun =
        ACTIVE_MODES.has(snapshotRef.current.mode) &&
        document.visibilityState === "visible";
      if (shouldRun && session.activeSince === null) {
        session.activeSince = performance.now();
      } else if (!shouldRun && session.activeSince !== null) {
        accrueActiveTime();
      }
    };

    updateClock();
    document.addEventListener("visibilitychange", updateClock);
    return () => document.removeEventListener("visibilitychange", updateClock);
  }, [accrueActiveTime, snapshot.mode]);

  useEffect(() => {
    const heartbeat = window.setInterval(() => {
      if (
        sessionRef.current.started &&
        sessionRef.current.activeSince !== null
      ) {
        send("game-session-heartbeat", sessionData());
      }
    }, 60_000);
    return () => window.clearInterval(heartbeat);
  }, [sessionData]);

  useEffect(() => {
    const recordExit = () => {
      if (!sessionRef.current.started) return;
      accrueActiveTime();
      send("game-session-checkpoint", {
        ...sessionData(),
        reason: "page-exit",
      });
    };
    window.addEventListener("pagehide", recordExit);
    return () => window.removeEventListener("pagehide", recordExit);
  }, [accrueActiveTime, sessionData]);

  return { endSession, startSession, track };
}
