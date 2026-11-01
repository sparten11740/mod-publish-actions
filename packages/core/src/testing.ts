import { setupServer } from 'msw/node';
import type { SetupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';

export const VALID_UPLOAD_INPUTS = {
  token: 'secret',
  'project-id': '123456',
  file: 'jars/mod.jar',
  'game-versions': '1.21.1',
  loaders: 'neoforge',
  environment: 'client',
  'release-type': 'alpha',
  changelog: 'Fixed a crash',
};

export function stubInputs(inputs: Record<string, string>): void {
  for (const [name, value] of Object.entries(inputs)) {
    vi.stubEnv(`INPUT_${name.toUpperCase()}`, value);
  }
}

export function useMockServer(): SetupServer {
  const server = setupServer();
  beforeAll(() => {
    server.listen({ onUnhandledFrame: 'error' });
  });
  afterEach(() => {
    server.resetHandlers();
    server.events.removeAllListeners();
  });
  afterAll(() => {
    server.close();
  });
  return server;
}

export function recordRequests(server: SetupServer): Request[] {
  const requests: Request[] = [];
  server.events.on('request:start', ({ request }) => {
    requests.push(request.clone());
  });
  return requests;
}
