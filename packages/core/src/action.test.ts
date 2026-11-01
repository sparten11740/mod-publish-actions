import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { readChangelog, readToken, readUploadInputs } from './action';
import { stubInputs, VALID_UPLOAD_INPUTS } from './testing';

describe('readToken', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns the token and masks it in the logs', () => {
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    stubInputs({ token: 'secret-token' });

    expect(readToken()).toBe('secret-token');
    expect(write).toHaveBeenCalledWith(expect.stringContaining('::add-mask::secret-token'));
  });

  it('rejects a token spanning several lines, without repeating it', () => {
    stubInputs({ token: 'first-part\nsecond-part' });

    expect(() => readToken()).toThrow('token must be a single line');
    expect(() => readToken()).not.toThrow('first-part');
    expect(() => readToken()).not.toThrow('second-part');
  });

  it('requires a token', () => {
    stubInputs({ token: '' });

    expect(() => readToken()).toThrow('token');
  });
});

describe('readChangelog', () => {
  it('returns inline text', () => {
    expect(readChangelog('Fixed a crash', '')).toBe('Fixed a crash');
  });

  it('reads a file', () => {
    const changelogFile = join(mkdtempSync(join(tmpdir(), 'changelog-')), 'CHANGELOG.md');
    writeFileSync(changelogFile, '## 1.0.0');

    expect(readChangelog('', changelogFile)).toBe('## 1.0.0');
  });

  it('rejects both sources at once', () => {
    expect(() => readChangelog('Fixed a crash', 'CHANGELOG.md')).toThrow('not both');
  });

  it('rejects no source at all', () => {
    expect(() => readChangelog('', '')).toThrow('Set changelog or changelog-file');
  });
});

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
