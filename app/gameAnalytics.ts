"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameChapter } from "./game3d/scene";

type AnalyticsValue = string | number | boolean;
type AnalyticsData = Record<string, AnalyticsValue>;

type GoogleTagCommand = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: GoogleTagCommand;
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

export type GameplayAnalyticsEvent =
  | "floor_entered"
  | "game_over"
  | "intro_skipped"
  | "objective_completed"
  | "orientation_completed"
  | "story_completed";

export type AnalyticsConsentState =
  | "checking"
  | "unavailable"
  | "blocked"
  | "pending"
  | "denied"
  | "granted";

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

const ANALYTICS_META_NAME = "blackout-ga4-measurement-id";
const CONSENT_STORAGE_KEY = "blackout-at-st-orison-analytics-consent-v1";
const GOOGLE_TAG_SCRIPT_ID = "blackout-ga4-script";
const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]{6,20}$/;

let measurementId: string | null = null;
let consentState: AnalyticsConsentState = "unavailable";
let configuredMeasurementId: string | null = null;

function inputProfile() {
  if (typeof window === "undefined") return "unknown";
  if (window.matchMedia("(pointer: coarse)").matches) return "touch";
  return "keyboard-mouse";
}

function browserRequestsNoTracking() {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return false;
  }
  const privacyNavigator = navigator as Navigator & {
    globalPrivacyControl?: boolean;
  };
  const privacyWindow = window as Window & { doNotTrack?: string };
  return (
    navigator.doNotTrack === "1" ||
    privacyWindow.doNotTrack === "1" ||
    privacyNavigator.globalPrivacyControl === true
  );
}

function readMeasurementId() {
  if (typeof document === "undefined") return null;
  const configured = document
    .querySelector<HTMLMetaElement>(`meta[name="${ANALYTICS_META_NAME}"]`)
    ?.content.trim()
    .toUpperCase();
  return configured && MEASUREMENT_ID_PATTERN.test(configured)
    ? configured
    : null;
}

function savedConsent() {
  try {
    const stored = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    return stored === "granted" || stored === "denied" ? stored : null;
  } catch {
    return null;
  }
}

function rememberConsent(choice: "granted" | "denied") {
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, choice);
  } catch {
    // Consent still applies to this page if storage is unavailable.
  }
}

function consentDefaults(analyticsStorage: "denied" | "granted") {
  return {
    analytics_storage: analyticsStorage,
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  };
}

function loadGoogleAnalytics(id: string) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (configuredMeasurementId === id) {
    window.gtag?.("consent", "update", consentDefaults("granted"));
    return;
  }

  window.dataLayer ??= [];
  window.gtag ??= function googleTagCommand() {
    // Match Google's loader contract: gtag.js consumes the Arguments object.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer?.push(arguments);
  };

  // Basic Consent Mode: this code is reached only after permission. Queue the
  // denied default before the granted update so every Google storage category
  // has an explicit state, while all advertising features stay disabled.
  window.gtag("consent", "default", consentDefaults("denied"));
  window.gtag("consent", "update", consentDefaults("granted"));
  window.gtag("js", new Date());
  window.gtag("config", id, {
    send_page_view: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  if (!document.getElementById(GOOGLE_TAG_SCRIPT_ID)) {
    const script = document.createElement("script");
    script.id = GOOGLE_TAG_SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    script.referrerPolicy = "strict-origin-when-cross-origin";
    document.head.appendChild(script);
  }
  configuredMeasurementId = id;
}

function stopGoogleAnalytics() {
  window.gtag?.("consent", "update", consentDefaults("denied"));
}

function initializeAnalytics(): AnalyticsConsentState {
  measurementId = readMeasurementId();
  if (!measurementId) {
    consentState = "unavailable";
    return consentState;
  }
  if (browserRequestsNoTracking()) {
    consentState = "blocked";
    return consentState;
  }

  consentState = savedConsent() ?? "pending";
  if (consentState === "granted") loadGoogleAnalytics(measurementId);
  return consentState;
}

function chooseConsent(choice: "granted" | "denied") {
  measurementId ??= readMeasurementId();
  if (!measurementId) {
    consentState = "unavailable";
    return consentState;
  }
  if (browserRequestsNoTracking()) {
    consentState = "blocked";
    return consentState;
  }

  rememberConsent(choice);
  consentState = choice;
  if (choice === "granted") loadGoogleAnalytics(measurementId);
  else stopGoogleAnalytics();
  return consentState;
}

function send(event: string, data: AnalyticsData) {
  if (typeof window === "undefined" || consentState !== "granted") return;
  try {
    window.gtag?.("event", event, data);
  } catch {
    // Analytics must never interrupt the game if a tracker or network fails.
  }
}

export function useGameplayAnalytics(snapshot: GameplayAnalyticsSnapshot) {
  const snapshotRef = useRef(snapshot);
  const [analyticsConsent, setAnalyticsConsentState] =
    useState<AnalyticsConsentState>("checking");

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setAnalyticsConsentState(initializeAnalytics());
    });
    return () => {
      active = false;
    };
  }, []);

  const setAnalyticsConsent = useCallback(
    (choice: "granted" | "denied") => {
      setAnalyticsConsentState(chooseConsent(choice));
    },
    [],
  );

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
      input_type: inputProfile(),
    };
  }, []);

  const endSession = useCallback(
    (reason: string) => {
      const session = sessionRef.current;
      if (!session.started) return;
      accrueActiveTime();
      send("game_session_ended", { ...sessionData(), reason });
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
      send("game_started", {
        entry,
        chapter,
        objective_step: step,
        input_type: inputProfile(),
      });
    },
    [endSession],
  );

  const track = useCallback(
    (event: GameplayAnalyticsEvent, data: AnalyticsData = {}) => {
      const current = snapshotRef.current;
      send(event, {
        chapter: current.chapter,
        objective_step: current.step,
        input_type: inputProfile(),
        ...data,
      });
    },
    [],
  );

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
        send("game_session_heartbeat", sessionData());
      }
    }, 120_000);
    return () => window.clearInterval(heartbeat);
  }, [sessionData]);

  useEffect(() => {
    const recordExit = () => {
      if (!sessionRef.current.started) return;
      accrueActiveTime();
      send("game_session_checkpoint", {
        ...sessionData(),
        reason: "page-exit",
      });
    };
    window.addEventListener("pagehide", recordExit);
    return () => window.removeEventListener("pagehide", recordExit);
  }, [accrueActiveTime, sessionData]);

  return {
    analyticsConsent,
    endSession,
    setAnalyticsConsent,
    startSession,
    track,
  };
}
