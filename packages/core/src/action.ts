import { getInput, setFailed, setSecret } from '@actions/core';
import { readFileSync } from 'node:fs';

import { parseChoice, parseDependencies, parseList } from './parse';
import type { Dependency } from './parse';

const LINE_BREAK = /[\r\n]/;
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

export function readRequired(name: string): string {
  const value = getInput(name, { required: true });
  if (value === '') {
    throw new Error(`Input required and not supplied: ${name}`);
  }
  return value;
}

function readRequiredList(name: string): string[] {
  const entries = parseList(readRequired(name));
  if (entries.length === 0) {
    throw new Error(`${name} must list at least one value`);
  }
  return entries;
}

export function readToken(): string {
  const token = readRequired('token');
  if (LINE_BREAK.test(token)) {
    throw new Error('token must be a single line, so check the secret it comes from');
  }
  setSecret(token);
  return token;
}

export function readChangelog(changelog: string, changelogFile: string): string {
  if (changelog !== '' && changelogFile !== '') {
    throw new Error('Set changelog or changelog-file, not both');
  }
  if (changelog !== '') {
    return changelog;
  }
  if (changelogFile !== '') {
    return readFileSync(changelogFile, 'utf8');
  }
  throw new Error('Set changelog or changelog-file');
}

export function readUploadInputs(): UploadInputs {
  return {
    token: readToken(),
    projectId: readRequired('project-id'),
    file: readRequired('file'),
    gameVersions: readRequiredList('game-versions'),
    loaders: readRequiredList('loaders'),
    environment: parseChoice('environment', readRequired('environment'), ENVIRONMENTS),
    releaseType: parseChoice('release-type', readRequired('release-type'), RELEASE_TYPES),
    changelog: readChangelog(getInput('changelog'), getInput('changelog-file')),
    displayName: getInput('display-name') || undefined,
    dependencies: parseDependencies(getInput('dependencies')),
  };
}

export async function runAction(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    setFailed(error instanceof Error ? error.message : String(error));
  }
}
