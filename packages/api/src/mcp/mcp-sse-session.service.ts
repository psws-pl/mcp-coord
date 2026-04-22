import { Injectable } from '@nestjs/common';
import { MessageEvent } from '@nestjs/common/interfaces';
import {
  Observable,
  Subject,
  finalize,
  interval,
  map,
  merge,
  of,
  takeUntil,
} from 'rxjs';
import { randomUUID } from 'node:crypto';

import { CoordDashboardRealtimeEvent, JsonRpcResponse } from './mcp.types';

interface SseSession {
  close$: Subject<void>;
  subject: Subject<MessageEvent>;
}

@Injectable()
export class McpSseSessionService {
  private readonly sessions = new Map<string, SseSession>();
  private readonly dashboardClients = new Map<string, SseSession>();

  createSession(baseUrl: string): { sessionId: string; stream$: Observable<MessageEvent> } {
    const sessionId = randomUUID();
    const close$ = new Subject<void>();
    const subject = new Subject<MessageEvent>();

    this.sessions.set(sessionId, { close$, subject });

    const endpointEvent: MessageEvent = {
      type: 'endpoint',
      data: {
        sessionId,
        mcpPath: `/mcp?sessionId=${sessionId}`,
        mcpUrl: `${baseUrl}/mcp?sessionId=${sessionId}`,
      },
    };

    return {
      sessionId,
      stream$: merge(
        of(endpointEvent),
        this.createKeepAliveStream(close$),
        subject.asObservable(),
      ).pipe(
        finalize(() => {
          this.sessions.delete(sessionId);
          close$.next();
          close$.complete();
          subject.complete();
        }),
      ),
    };
  }

  createDashboardStream(): Observable<MessageEvent> {
    const streamId = randomUUID();
    const close$ = new Subject<void>();
    const subject = new Subject<MessageEvent>();

    this.dashboardClients.set(streamId, { close$, subject });

    return merge(this.createKeepAliveStream(close$), subject.asObservable()).pipe(
      finalize(() => {
        this.dashboardClients.delete(streamId);
        close$.next();
        close$.complete();
        subject.complete();
      }),
    );
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  emitResponse(sessionId: string, response: JsonRpcResponse): void {
    this.getSession(sessionId)?.subject.next({
      type: 'message',
      data: response,
    });
  }

  emitErrorAndComplete(sessionId: string, payload: unknown): void {
    const session = this.getSession(sessionId);

    if (!session) {
      return;
    }

    session.subject.next({
      type: 'error',
      data: this.toEventData(payload),
    });
    session.close$.next();
    session.close$.complete();
    session.subject.complete();
    this.sessions.delete(sessionId);
  }

  emitDashboardEvent(event: CoordDashboardRealtimeEvent): void {
    for (const dashboardClient of this.dashboardClients.values()) {
      dashboardClient.subject.next({
        data: event,
      });
    }
  }

  private getSession(sessionId: string): SseSession | undefined {
    return this.sessions.get(sessionId);
  }

  private createKeepAliveStream(close$: Subject<void>): Observable<MessageEvent> {
    return interval(30_000).pipe(
      takeUntil(close$),
      map(
        (): MessageEvent => ({
          type: 'ping',
          data: {
            timestamp: new Date().toISOString(),
          },
        }),
      ),
    );
  }

  private toEventData(payload: unknown): string | object {
    if (typeof payload === 'string') {
      return payload;
    }

    if (typeof payload === 'object' && payload !== null) {
      return payload;
    }

    return {
      value: payload ?? null,
    };
  }
}
