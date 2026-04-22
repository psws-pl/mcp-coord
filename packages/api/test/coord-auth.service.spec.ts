import { ConfigService } from '@nestjs/config';

import { CoordAuthService } from '../src/auth/coord-auth.service';

describe('CoordAuthService', () => {
  it('parses named and unnamed API keys', () => {
    const service = new CoordAuthService(
      new ConfigService({
        COORD_API_KEYS: 'be=be-key, orch=orch-key , raw-key',
      }),
    );

    expect(service.authenticateKey('be-key')).toEqual({
      apiKey: 'be-key',
      agentName: 'be',
    });
    expect(service.authenticateKey('orch-key')).toEqual({
      apiKey: 'orch-key',
      agentName: 'orch',
    });
    expect(service.authenticateKey('raw-key')).toEqual({
      apiKey: 'raw-key',
      agentName: null,
    });
  });

  it('rejects missing or blank keys', () => {
    const service = new CoordAuthService(
      new ConfigService({
        COORD_API_KEYS: 'be=be-key',
      }),
    );

    expect(service.authenticateKey(undefined)).toBeNull();
    expect(service.authenticateKey('')).toBeNull();
    expect(service.authenticateKey('   ')).toBeNull();
    expect(service.authenticateKey('invalid-key')).toBeNull();
  });
});
