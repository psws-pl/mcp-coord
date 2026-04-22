import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, Notification } from 'pg';

import { CoordDashboardRealtimeEvent } from './mcp.types';
import { McpSseSessionService } from './mcp-sse-session.service';

type CoordNotifyChannel =
  | 'coord_agents'
  | 'coord_tasks'
  | 'coord_messages'
  | 'coord_plans';

interface NotifyChannelConfig {
  dashboardChannel: CoordDashboardRealtimeEvent['channel'];
  entity: CoordDashboardRealtimeEvent['payload']['entity'];
  payloadKey: 'agent' | 'task' | 'message' | 'plan';
}

interface NotifyEntityRecord {
  id?: unknown;
}

type NotifyPayload = Partial<
  Record<NotifyChannelConfig['payloadKey'], NotifyEntityRecord>
> & {
  timestamp?: unknown;
};

const LISTEN_CHANNELS: ReadonlyArray<CoordNotifyChannel> = [
  'coord_agents',
  'coord_tasks',
  'coord_messages',
  'coord_plans',
];

const CHANNEL_CONFIG: Record<CoordNotifyChannel, NotifyChannelConfig> = {
  coord_agents: {
    dashboardChannel: 'agents',
    entity: 'agent',
    payloadKey: 'agent',
  },
  coord_tasks: {
    dashboardChannel: 'tasks',
    entity: 'task',
    payloadKey: 'task',
  },
  coord_messages: {
    dashboardChannel: 'messages',
    entity: 'message',
    payloadKey: 'message',
  },
  coord_plans: {
    dashboardChannel: 'plans',
    entity: 'plan',
    payloadKey: 'plan',
  },
};

const DEFAULT_DATABASE_URL = 'postgres://coord:coord@127.0.0.1:5432/coord';

@Injectable()
export class CoordNotifyListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CoordNotifyListenerService.name);
  private listenerClient?: Client;
  private reconnectTimer?: NodeJS.Timeout;
  private reconnecting = false;
  private shuttingDown = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly sseSessions: McpSseSessionService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.connectListener();
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    await this.disconnectListener();
  }

  private async connectListener(): Promise<void> {
    const client = new Client({
      connectionString:
        this.configService.get<string>('DATABASE_URL') ?? DEFAULT_DATABASE_URL,
    });

    client.on('notification', (notification) => {
      this.handleNotification(notification);
    });

    client.on('error', (error) => {
      this.logger.error(`LISTEN/NOTIFY connection failed: ${error.message}`, error.stack);
      void this.scheduleReconnect();
    });

    await client.connect();

    try {
      for (const channel of LISTEN_CHANNELS) {
        await client.query(`LISTEN ${channel}`);
      }
    } catch (error) {
      await client.end().catch(() => undefined);
      throw error;
    }

    this.listenerClient = client;
    this.logger.log(`Listening for coord notifications on ${LISTEN_CHANNELS.join(', ')}`);
  }

  private async disconnectListener(): Promise<void> {
    const client = this.listenerClient;
    this.listenerClient = undefined;

    if (!client) {
      return;
    }

    client.removeAllListeners('notification');
    client.removeAllListeners('error');

    await client.end().catch(() => undefined);
  }

  private async scheduleReconnect(): Promise<void> {
    if (this.shuttingDown || this.reconnecting) {
      return;
    }

    this.reconnecting = true;
    await this.disconnectListener();

    this.reconnectTimer = setTimeout(() => {
      void this.reconnectListener();
    }, 1_000);
  }

  private async reconnectListener(): Promise<void> {
    this.reconnectTimer = undefined;

    if (this.shuttingDown) {
      this.reconnecting = false;
      return;
    }

    try {
      await this.connectListener();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown LISTEN/NOTIFY reconnect error';
      this.logger.error(`Failed to reconnect LISTEN/NOTIFY listener: ${message}`);
      this.reconnectTimer = setTimeout(() => {
        void this.reconnectListener();
      }, 5_000);
      return;
    }

    this.reconnecting = false;
  }

  private handleNotification(notification: Notification): void {
    if (!this.isCoordNotifyChannel(notification.channel)) {
      return;
    }

    const config = CHANNEL_CONFIG[notification.channel];
    const payload = this.parsePayload(notification.payload);
    const entityRecord = payload?.[config.payloadKey];
    const entityId = typeof entityRecord?.id === 'string' ? entityRecord.id : null;

    if (!entityId) {
      this.logger.warn(
        `Ignoring ${notification.channel} notification without ${config.payloadKey}.id`,
      );
      return;
    }

    this.sseSessions.emitDashboardEvent({
      channel: config.dashboardChannel,
      event: 'invalidate',
      timestamp:
        typeof payload?.timestamp === 'string'
          ? payload.timestamp
          : new Date().toISOString(),
      payload: {
        entity: config.entity,
        id: entityId,
      },
    });
  }

  private parsePayload(payload: string | undefined): NotifyPayload | null {
    if (!payload) {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(payload);

      if (!this.isNotifyPayload(parsed)) {
        return null;
      }

      return parsed;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown payload parse error';
      this.logger.warn(`Failed to parse coord notification payload: ${message}`);
      return null;
    }
  }

  private isCoordNotifyChannel(channel: string): channel is CoordNotifyChannel {
    return (LISTEN_CHANNELS as ReadonlyArray<string>).includes(channel);
  }

  private isNotifyPayload(value: unknown): value is NotifyPayload {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
