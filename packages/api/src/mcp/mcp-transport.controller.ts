import {
  Body,
  Controller,
  HttpCode,
  NotFoundException,
  Post,
  Query,
  Req,
  Sse,
} from '@nestjs/common';
import { MessageEvent } from '@nestjs/common/interfaces';
import { Observable } from 'rxjs';

import { CoordAuthenticatedRequestLike } from '../auth/coord-auth.types';
import { isJsonRpcErrorResponse, JsonRpcResponse } from './mcp.types';
import { McpDispatcherService } from './mcp-dispatcher.service';
import { McpSseSessionService } from './mcp-sse-session.service';

interface SseRequestLike {
  protocol?: string;
  get?(headerName: string): string | undefined;
}

@Controller()
export class McpTransportController {
  constructor(
    private readonly dispatcher: McpDispatcherService,
    private readonly sseSessions: McpSseSessionService,
  ) {}

  @Sse('sse')
  openSseStream(
    @Req() request: SseRequestLike,
    @Query('stream') stream?: string,
  ): Observable<MessageEvent> {
    if (stream === 'dashboard') {
      return this.sseSessions.createDashboardStream();
    }

    const origin = this.resolveOrigin(request);

    return this.sseSessions.createSession(origin).stream$;
  }

  @Post('mcp')
  @HttpCode(200)
  async handleMcpRequest(
    @Body() body: unknown,
    @Req() request: CoordAuthenticatedRequestLike,
    @Query('sessionId') sessionId?: string,
  ): Promise<JsonRpcResponse | { accepted: true; sessionId: string } | null> {
    const context = {
      authenticatedAgentName: request.coordAuthContext?.agentName ?? null,
    };

    if (!sessionId) {
      return this.dispatcher.dispatch(body, context);
    }

    if (!this.sseSessions.hasSession(sessionId)) {
      throw new NotFoundException(`SSE session "${sessionId}" was not found.`);
    }

    try {
      const response = await this.dispatcher.dispatch(body, context);

      if (response !== null) {
        if (isJsonRpcErrorResponse(response)) {
          this.sseSessions.emitErrorAndComplete(sessionId, response);
        } else {
          this.sseSessions.emitResponse(sessionId, response);
        }
      }

      return {
        accepted: true,
        sessionId,
      };
    } catch (error) {
      this.sseSessions.emitErrorAndComplete(
        sessionId,
        this.dispatcher.createSseErrorPayload(error),
      );

      return {
        accepted: true,
        sessionId,
      };
    }
  }

  private resolveOrigin(request: SseRequestLike): string {
    const protocol = request.protocol ?? 'http';
    const host = request.get?.('host') ?? 'localhost:3000';

    return `${protocol}://${host}`;
  }
}
