import { info, setOutput, warning } from '@actions/core';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

import { findSingleFile, readRequired, readUploadInputs } from '@mod-publish-actions/core';
import type { UploadInputs } from '@mod-publish-actions/core';
import type { ExistingVersion } from '@mod-publish-actions/modrinth';
import { findVersion, getProjectId, MODRINTH_API_URL, postVersion } from '@mod-publish-actions/modrinth';

const FILE_PART = 'file';
const PROJECT_ID = /^[a-zA-Z0-9]{8}$/;

const ENVIRONMENTS: Record<UploadInputs['environment'], string> = {
  client: 'client_only',
  server: 'server_only',
  both: 'client_and_server',
};

export type ModrinthUploadInputs = UploadInputs & {
  versionNumber: string;
};

export function readInputs(): ModrinthUploadInputs {
  const inputs = readUploadInputs();
  if (!PROJECT_ID.test(inputs.projectId)) {
    throw new Error(`project-id must be a Modrinth project ID of 8 letters and numbers, not a slug, got "${inputs.projectId}"`);
  }
  return {
    ...inputs,
    loaders: inputs.loaders.map((loader) => loader.toLowerCase()),
    versionNumber: readRequired('version-number'),
  };
}

function assertCoversFile(existing: ExistingVersion, { versionNumber, loaders, gameVersions }: ModrinthUploadInputs): void {
  const uncovered = [
    ...loaders.filter((loader) => !existing.loaders.includes(loader)),
    ...gameVersions.filter((gameVersion) => !existing.game_versions.includes(gameVersion)),
  ];
  if (uncovered.length > 0) {
    throw new Error(
      `version-number ${versionNumber} already exists as ${existing.id}, which does not include ${uncovered.join(', ')}. Give each file its own version-number`,
    );
  }
}

export async function publishVersion(inputs: ModrinthUploadInputs, apiUrl: string): Promise<string> {
  const filePath = findSingleFile(inputs.file);
  const existing = await findVersion(apiUrl, inputs.token, inputs.projectId, inputs.versionNumber);
  if (existing !== undefined) {
    assertCoversFile(existing, inputs);
    warning(`Version ${inputs.versionNumber} already exists as ${existing.id}, so nothing was uploaded`);
    return existing.id;
  }

  const dependencies = await Promise.all(
    inputs.dependencies.map(async ({ project, type }) => ({
      project_id: await getProjectId(apiUrl, project),
      dependency_type: type,
    })),
  );

  const form = new FormData();
  form.append(
    'data',
    JSON.stringify({
      name: inputs.displayName ?? inputs.versionNumber,
      version_number: inputs.versionNumber,
      changelog: inputs.changelog,
      dependencies,
      game_versions: inputs.gameVersions,
      version_type: inputs.releaseType,
      loaders: inputs.loaders,
      environment: ENVIRONMENTS[inputs.environment],
      featured: false,
      project_id: inputs.projectId,
      file_parts: [FILE_PART],
      primary_file: FILE_PART,
    }),
  );
  form.append(FILE_PART, new File([await readFile(filePath)], basename(filePath)));

  return postVersion(apiUrl, inputs.token, form);
}

export async function uploadVersion(): Promise<void> {
  const versionId = await publishVersion(readInputs(), MODRINTH_API_URL);
  setOutput('version-id', versionId);
  info(`Modrinth version ID: ${versionId}`);
}
