import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { COORD_API_KEYS_ENV } from './coord-auth.constants';
import { CoordAuthContext } from './coord-auth.types';

@Injectable()
export class CoordAuthService {
  private cachedSource?: string;
  private cachedContexts = new Map<string, CoordAuthContext>();

  constructor(private readonly configService: ConfigService) {}

  isValidKey(candidate: string | undefined): boolean {
    return this.authenticateKey(candidate) !== null;
  }

  authenticateKey(candidate: string | undefined): CoordAuthContext | null {
    if (!candidate) {
      return null;
    }

    const normalized = candidate.trim();

    if (normalized.length === 0) {
      return null;
    }

    return this.getAuthContexts().get(normalized) ?? null;
  }

  private getAuthContexts(): ReadonlyMap<string, CoordAuthContext> {
    const source = this.configService.get<string>(COORD_API_KEYS_ENV) ?? '';

    if (source === this.cachedSource) {
      return this.cachedContexts;
    }

    this.cachedSource = source;
    const entries: Array<[string, CoordAuthContext]> = source
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .map((entry) => {
        const separatorIndex = entry.indexOf('=');

        if (separatorIndex <= 0) {
          return [
            entry,
            {
              apiKey: entry,
              agentName: null,
            },
          ];
        }

        const agentName = entry.slice(0, separatorIndex).trim();
        const apiKey = entry.slice(separatorIndex + 1).trim();

        if (agentName.length === 0 || apiKey.length === 0) {
          return [
            entry,
            {
              apiKey: entry,
              agentName: null,
            },
          ];
        }

        return [
          apiKey,
          {
            apiKey,
            agentName,
          },
        ];
      });

    this.cachedContexts = new Map(entries);

    return this.cachedContexts;
  }
}
