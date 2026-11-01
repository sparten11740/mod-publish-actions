import { afterEach, describe, expect, it, vi } from 'vitest';

import { readUploadInputs } from './read-upload-inputs';
import { stubInputs, VALID_UPLOAD_INPUTS } from './testing';

describe('readUploadInputs', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads the inputs both upload actions share', () => {
    stubInputs({ ...VALID_UPLOAD_INPUTS, 'game-versions': '1.21.1\n1.21', dependencies: 'fabric-api:required' });

    expect(readUploadInputs()).toEqual({
      token: 'secret',
      projectId: '123456',
      file: 'jars/mod.jar',
      gameVersions: ['1.21.1', '1.21'],
      loaders: ['neoforge'],
      environment: 'client',
      releaseType: 'alpha',
      changelog: 'Fixed a crash',
      displayName: undefined,
      dependencies: [{ project: 'fabric-api', type: 'required' }],
    });
  });

  it('names a missing required input', () => {
    stubInputs({ ...VALID_UPLOAD_INPUTS, 'game-versions': '' });

    expect(() => readUploadInputs()).toThrow('game-versions');
  });

  it('rejects an unknown environment', () => {
    stubInputs({ ...VALID_UPLOAD_INPUTS, environment: 'client_only' });

    expect(() => readUploadInputs()).toThrow('environment must be one of client, server, both');
  });

  it('rejects an unknown release type', () => {
    stubInputs({ ...VALID_UPLOAD_INPUTS, 'release-type': 'stable' });

    expect(() => readUploadInputs()).toThrow('release-type must be one of alpha, beta, release');
  });
});
