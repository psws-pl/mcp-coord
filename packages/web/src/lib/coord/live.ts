"use client";

import { useEffect, useRef } from "react";

import { useCoordEvents } from "@/lib/coord/sse";
import type {
  CoordDashboardInvalidationPayload,
  CoordRealtimeEntity,
} from "@/lib/coord/types";

type CoordRealtimeHandler = (
  payload: CoordDashboardInvalidationPayload,
) => void | Promise<void>;

interface UseCoordRealtimeRefreshOptions {
  handlers: Partial<Record<CoordRealtimeEntity, CoordRealtimeHandler>>;
  poll?: () => void | Promise<void>;
  pollIntervalMs?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 15_000;

export function useCoordRealtimeRefresh({
  handlers,
  poll,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: UseCoordRealtimeRefreshOptions) {
  const { lastEvent, polling } = useCoordEvents();
  const lastHandledEventRef = useRef<string | null>(null);

  useEffect(() => {
    if (!lastEvent || lastEvent.event !== "invalidate") {
      return;
    }

    const payload = parseInvalidationPayload(lastEvent.payload);

    if (!payload) {
      return;
    }

    const signature = `${lastEvent.channel}:${payload.entity}:${payload.id}:${lastEvent.timestamp}`;

    if (lastHandledEventRef.current === signature) {
      return;
    }

    lastHandledEventRef.current = signature;
    void handlers[payload.entity]?.(payload);
  }, [handlers, lastEvent]);

  useEffect(() => {
    if (!polling || !poll) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void poll();
    }, pollIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [poll, pollIntervalMs, polling]);
}

function parseInvalidationPayload(
  value: Record<string, unknown>,
): CoordDashboardInvalidationPayload | null {
  const entity = value.entity;
  const id = value.id;

  if (!isRealtimeEntity(entity) || typeof id !== "string") {
    return null;
  }

  return {
    entity,
    id,
  };
}

function isRealtimeEntity(value: unknown): value is CoordRealtimeEntity {
  return (
    value === "agent" ||
    value === "task" ||
    value === "message" ||
    value === "plan"
  );
}
