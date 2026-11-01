import { getInput, info, setOutput } from '@actions/core';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import * as zod from 'zod/v4';

import { assertSuccess, findSingleFile, parseList, parseReply, readUploadInputs, sendRequest } from '@mod-publish-actions/core';
import type { UploadInputs } from '@mod-publish-actions/core';

const CURSEFORGE_API_URL = 'https://minecraft.curseforge.com/api';
const WHOLE_NUMBER = /^\d+$/;

const UPLOADED_FILE_SCHEMA = zod.object({ id: zod.int() });

const LOADER_NAMES = new Map([
  ['fabric', 'Fabric'],
  ['forge', 'Forge'],
  ['neoforge', 'NeoForge'],
  ['quilt', 'Quilt'],
]);

const ENVIRONMENT_NAMES: Record<UploadInputs['environment'], string[]> = {
  client: ['Client'],
  server: ['Server'],
  both: ['Client', 'Server'],
};

const RELATION_TYPES: Record<UploadInputs['dependencies'][number]['type'], string> = {
  required: 'requiredDependency',
  optional: 'optionalDependency',
  embedded: 'embeddedLibrary',
  incompatible: 'incompatible',
};

export type CurseforgeUploadInputs = UploadInputs & {
  javaVersions: string[];
};

export function readInputs(): CurseforgeUploadInputs {
  const inputs = readUploadInputs();
  if (!WHOLE_NUMBER.test(inputs.projectId)) {
    throw new Error(`project-id must be a numeric CurseForge project ID, got "${inputs.projectId}"`);
  }
  const javaVersions = parseList(getInput('java-versions'));
  const invalidJavaVersions = javaVersions.filter((javaVersion) => !WHOLE_NUMBER.test(javaVersion));
  if (invalidJavaVersions.length > 0) {
    throw new Error(`java-versions must be plain numbers such as 21, got "${invalidJavaVersions.join(', ')}"`);
  }
  return { ...inputs, javaVersions };
}

function toGameVersionNames({ gameVersions, loaders, environment, javaVersions }: CurseforgeUploadInputs): string[] {
  return [
    ...gameVersions,
    ...loaders.map((loader) => LOADER_NAMES.get(loader.toLowerCase()) ?? loader),
    ...ENVIRONMENT_NAMES[environment],
    ...javaVersions.map((javaVersion) => `Java ${javaVersion}`),
  ];
}

function createMetadata(inputs: CurseforgeUploadInputs): string {
  const projects = inputs.dependencies.map(({ project, type }) => ({ slug: project, type: RELATION_TYPES[type] }));
  return JSON.stringify({
    changelog: inputs.changelog,
    changelogType: 'markdown',
    displayName: inputs.displayName,
    gameVersionNames: toGameVersionNames(inputs),
    releaseType: inputs.releaseType,
    relations: projects.length > 0 ? { projects } : undefined,
  });
}

export async function publishFile(inputs: CurseforgeUploadInputs, apiUrl: string): Promise<number> {
  const filePath = findSingleFile(inputs.file);
  const form = new FormData();
  form.append('metadata', createMetadata(inputs));
  form.append('file', new File([await readFile(filePath)], basename(filePath)));

  const method = 'POST';
  const url = `${apiUrl}/projects/${inputs.projectId}/upload-file`;
  const reply = await sendRequest(url, { method, headers: { 'X-Api-Token': inputs.token }, body: form });
  assertSuccess(reply, url, method);
  return parseReply(reply.text, UPLOADED_FILE_SCHEMA, url).id;
}

export async function uploadFile(): Promise<void> {
  const fileId = await publishFile(readInputs(), CURSEFORGE_API_URL);
  setOutput('file-id', String(fileId));
  info(`CurseForge file ID: ${fileId}`);
}
