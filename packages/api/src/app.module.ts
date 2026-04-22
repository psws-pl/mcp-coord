import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CoordAuthService } from './auth/coord-auth.service';
import { CoordKeyAuthGuard } from './auth/coord-key-auth.guard';
import { createCoordTypeOrmOptions } from './database/coord-database.config';
import {
  CoordAgentEntity,
  CoordPlanEntity,
  CoordMessageEntity,
  CoordTaskEntity,
} from './database/entities';
import { HealthController } from './health/health.controller';
import { CoordNotifyListenerService } from './mcp/coord-notify-listener.service';
import { CoordRealtimeService } from './mcp/coord-realtime.service';
import { McpAgentToolsService } from './mcp/mcp-agent-tools.service';
import { McpDispatcherService } from './mcp/mcp-dispatcher.service';
import { McpMessageToolsService } from './mcp/mcp-message-tools.service';
import { McpPlanToolsService } from './mcp/mcp-plan-tools.service';
import { McpSseSessionService } from './mcp/mcp-sse-session.service';
import { McpTaskToolsService } from './mcp/mcp-task-tools.service';
import { McpToolHandlersService } from './mcp/mcp-tool-handlers.service';
import { McpTransportController } from './mcp/mcp-transport.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      expandVariables: true,
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        createCoordTypeOrmOptions(configService),
    }),
    TypeOrmModule.forFeature([
      CoordAgentEntity,
      CoordPlanEntity,
      CoordTaskEntity,
      CoordMessageEntity,
    ]),
  ],
  controllers: [HealthController, McpTransportController],
  providers: [
    CoordAuthService,
    CoordNotifyListenerService,
    CoordRealtimeService,
    McpAgentToolsService,
    McpDispatcherService,
    McpMessageToolsService,
    McpPlanToolsService,
    McpSseSessionService,
    McpTaskToolsService,
    McpToolHandlersService,
    {
      provide: APP_GUARD,
      useClass: CoordKeyAuthGuard,
    },
  ],
})
export class AppModule {}
