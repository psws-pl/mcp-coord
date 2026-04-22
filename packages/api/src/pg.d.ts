declare module 'pg' {
  export interface Notification {
    channel: string;
    payload?: string;
    processId: number;
  }

  export interface ClientConfig {
    connectionString?: string;
  }

  export class Client {
    constructor(config?: ClientConfig);

    connect(): Promise<void>;
    query(queryText: string): Promise<unknown>;
    end(): Promise<void>;
    removeAllListeners(event?: string | symbol): this;
    on(event: 'notification', listener: (message: Notification) => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
  }
}
