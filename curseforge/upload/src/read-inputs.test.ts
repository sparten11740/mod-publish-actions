import { afterEach, describe, expect, it, vi } from 'vitest';

import { stubInputs, VALID_UPLOAD_INPUTS } from '@mod-publish-actions/core/testing';

import { readInputs } from './read-inputs';

describe('readInputs', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('adds the Java versions to the shared inputs', () => {
    stubInputs({ ...VALID_UPLOAD_INPUTS, 'java-versions': '21, 25' });

    expect(readInputs()).toMatchObject({ projectId: '123456', javaVersions: ['21', '25'] });
  });

  it('treats Java versions as optional', () => {
    stubInputs(VALID_UPLOAD_INPUTS);

    expect(readInputs().javaVersions).toEqual([]);
  });

  it('rejects a project ID that is not numeric', () => {
    stubInputs({ ...VALID_UPLOAD_INPUTS, 'project-id': 'blockpilot' });

    expect(() => readInputs()).toThrow('project-id must be a numeric CurseForge project ID');
  });
});
