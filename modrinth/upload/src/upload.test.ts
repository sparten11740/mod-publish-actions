import { afterEach, describe, expect, it, vi } from 'vitest';

import { stubInputs, VALID_UPLOAD_INPUTS } from '@mod-publish-actions/core/testing';

import { readInputs } from './upload';

describe('readInputs', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('adds the version number to the shared inputs', () => {
    stubInputs({ ...VALID_UPLOAD_INPUTS, 'version-number': '1.0.0+1.21.1-neoforge' });

    expect(readInputs()).toMatchObject({ projectId: '123456', versionNumber: '1.0.0+1.21.1-neoforge' });
  });

  it('requires a version number', () => {
    stubInputs({ ...VALID_UPLOAD_INPUTS, 'version-number': '' });

    expect(() => readInputs()).toThrow('version-number');
  });
});
