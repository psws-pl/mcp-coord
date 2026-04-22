"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { CoordConnectionState, CoordRealtimeEvent } from "@/lib/coord/types";

const INITIAL_STATE: CoordConnectionState = {
  status: "disconnected",
  attempts: 0,
  endpoint: null,
  lastEventAt: null,
  lastEvent: null,
  reason: null,
  polling: false,
  droppedConnections: 0,
};

const MAX_RETRY_DELAY_MS = 15_000;
const CoordEventsContext = createContext<CoordConnectionState>(INITIAL_STATE);

export function CoordEventsProvider({ children }: { children: ReactNode }) {
  const state = useCoordEventSource();

  return (
    <CoordEventsContext.Provider value={state}>
      {children}
    </CoordEventsContext.Provider>
  );
}

export function useCoordEvents() {
  return useContext(CoordEventsContext);
}

function useCoordEventSource(): CoordConnectionState {
  const [state, setState] = useState<CoordConnectionState>(INITIAL_STATE);
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const retriesRef = useRef(0);

  const endpoint = useMemo(() => "/api/coord/sse?stream=dashboard", []);

  useEffect(() => {
    if (!endpoint) {
        setState({
          ...INITIAL_STATE,
          reason: "NEXT_PUBLIC_API_URL is not set.",
        });
      return;
    }

    let cancelled = false;

    const cleanup = () => {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };

      const scheduleReconnect = (reason: string) => {
        cleanup();

        if (cancelled) {
          return;
        }

        retriesRef.current += 1;
        const attempts = retriesRef.current;

        if (attempts > 3) {
          setState((current) => ({
            ...current,
            status: "disconnected",
            attempts,
            endpoint,
            reason: "Dashboard stream disconnected repeatedly. Falling back to 15s polling.",
            polling: true,
            droppedConnections: attempts,
          }));
          return;
        }

        const delay = Math.min(1_000 * 2 ** Math.min(attempts - 1, 4), MAX_RETRY_DELAY_MS);

        setState((current) => ({
          ...current,
          status: "reconnecting",
          attempts,
          endpoint,
          reason,
          polling: false,
          droppedConnections: attempts,
        }));

        retryTimerRef.current = window.setTimeout(connect, delay);
      };

    const connect = () => {
      if (cancelled) {
        return;
      }

        setState((current) => ({
          ...current,
          status: retriesRef.current > 0 ? "reconnecting" : "connecting",
          attempts: retriesRef.current,
          endpoint,
          reason: null,
          polling: false,
        }));

      const source = new EventSource(endpoint);
      eventSourceRef.current = source;

        source.onopen = () => {
          retriesRef.current = 0;
          setState((current) => ({
            ...current,
            status: "connected",
          attempts: 0,
            endpoint,
            reason: null,
            polling: false,
            droppedConnections: 0,
          }));
        };

      source.onmessage = (message) => {
        const event = parseRealtimeEvent(message.data);
        const lastEventAt = event?.timestamp ?? new Date().toISOString();

        setState((current) => ({
          ...current,
          status: "connected",
            attempts: 0,
            endpoint,
            lastEventAt,
            lastEvent: event,
            reason: null,
            polling: false,
          }));
        };

      source.onerror = () => {
        scheduleReconnect("Lost connection to coord SSE stream.");
      };
    };

    connect();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [endpoint]);

  return state;
}

function parseRealtimeEvent(value: string): CoordRealtimeEvent | null {
  try {
    const payload: unknown = JSON.parse(value);

    if (!isRecord(payload)) {
      return null;
    }

    return {
      channel:
        typeof payload.channel === "string" ? payload.channel : "system",
      event: typeof payload.event === "string" ? payload.event : "message",
      timestamp:
        typeof payload.timestamp === "string"
          ? payload.timestamp
          : new Date().toISOString(),
      payload: isRecord(payload.payload) ? payload.payload : payload,
    };
  } catch {
    return {
      channel: "system",
      event: "message",
      timestamp: new Date().toISOString(),
      payload: {
        raw: value,
      },
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
