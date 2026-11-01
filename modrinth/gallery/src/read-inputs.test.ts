import { afterEach, describe, expect, it, vi } from 'vitest';

import { stubInputs } from '@mod-publish-actions/core/testing';

import { readInputs } from './read-inputs';

const VALID_INPUTS = {
  token: 'secret',
  'project-id': 'blockpilot',
  images: 'docs/images',
  'remove-missing': 'true',
};

describe('readInputs', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads the gallery inputs', () => {
    stubInputs(VALID_INPUTS);

    expect(readInputs()).toEqual({ token: 'secret', projectId: 'blockpilot', images: 'docs/images', removeMissing: true });
  });

  it('requires a token', () => {
    stubInputs({ ...VALID_INPUTS, token: '' });

    expect(() => readInputs()).toThrow('token');
  });

  it('rejects a remove-missing value that is not a boolean', () => {
    stubInputs({ ...VALID_INPUTS, 'remove-missing': 'sometimes' });

    expect(() => readInputs()).toThrow('remove-missing');
  });
});
