import { getInput } from '@actions/core';

import { parseChoice } from './parse-choice';
import { parseDependencies } from './parse-dependencies';
import type { Dependency } from './parse-dependencies';
import { parseList } from './parse-list';
import { readChangelog } from './read-changelog';

const ENVIRONMENTS = ['client', 'server', 'both'] as const;
const RELEASE_TYPES = ['alpha', 'beta', 'release'] as const;

type Environment = (typeof ENVIRONMENTS)[number];
type ReleaseType = (typeof RELEASE_TYPES)[number];

export type UploadInputs = {
  token: string;
  projectId: string;
  file: string;
  gameVersions: string[];
  loaders: string[];
  environment: Environment;
  releaseType: ReleaseType;
  changelog: string;
  displayName: string | undefined;
  dependencies: Dependency[];
};

function getRequired(name: string): string {
  return getInput(name, { required: true });
}

export function readUploadInputs(): UploadInputs {
  return {
    token: getRequired('token'),
    projectId: getRequired('project-id'),
    file: getRequired('file'),
    gameVersions: parseList(getRequired('game-versions')),
    loaders: parseList(getRequired('loaders')),
    environment: parseChoice('environment', getRequired('environment'), ENVIRONMENTS),
    releaseType: parseChoice('release-type', getRequired('release-type'), RELEASE_TYPES),
    changelog: readChangelog(getInput('changelog'), getInput('changelog-file')),
    displayName: getInput('display-name') || undefined,
    dependencies: parseDependencies(getInput('dependencies')),
  };
}
