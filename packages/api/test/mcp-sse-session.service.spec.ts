import { MessageEvent } from '@nestjs/common/interfaces';

import { McpSseSessionService } from '../src/mcp/mcp-sse-session.service';

describe('McpSseSessionService', () => {
  it('emits an SSE error event and completes the stream', async () => {
    const service = new McpSseSessionService();
    const session = service.createSession('http://localhost:3000');
    const events: MessageEvent[] = [];

    let completed = false;

    const completion = new Promise<void>((resolve) => {
      session.stream$.subscribe({
        next: (event) => events.push(event),
        complete: () => {
          completed = true;
          resolve();
        },
      });
    });

    service.emitErrorAndComplete(session.sessionId, {
      reason: 'boom',
    });

    await completion;

    expect(events[0]).toMatchObject({
      type: 'endpoint',
      data: {
        sessionId: session.sessionId,
        mcpPath: `/mcp?sessionId=${session.sessionId}`,
      },
    });
    expect(events[1]).toMatchObject({
      type: 'error',
      data: {
        reason: 'boom',
      },
    });
    expect(completed).toBe(true);
    expect(service.hasSession(session.sessionId)).toBe(false);
  });
});
