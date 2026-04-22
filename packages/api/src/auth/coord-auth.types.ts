export interface CoordAuthContext {
  apiKey: string;
  agentName: string | null;
}

export interface CoordAuthenticatedRequestLike {
  headers?: Record<string, string | string[] | undefined>;
  coordAuthContext?: CoordAuthContext;
}
