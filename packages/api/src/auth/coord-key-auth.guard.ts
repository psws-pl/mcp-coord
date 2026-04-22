import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { COORD_API_KEY_HEADER } from './coord-auth.constants';
import { CoordAuthService } from './coord-auth.service';
import { CoordAuthenticatedRequestLike } from './coord-auth.types';

@Injectable()
export class CoordKeyAuthGuard implements CanActivate {
  constructor(private readonly coordAuthService: CoordAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<CoordAuthenticatedRequestLike>();
    const apiKeyHeader = request.headers?.[COORD_API_KEY_HEADER];
    const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
    const authContext = this.coordAuthService.authenticateKey(apiKey);

    if (!authContext) {
      throw new UnauthorizedException('Missing or invalid X-Coord-Key header');
    }

    request.coordAuthContext = authContext;

    return true;
  }
}
