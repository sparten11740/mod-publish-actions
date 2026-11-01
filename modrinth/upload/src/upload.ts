import { getInput } from '@actions/core';

import { readUploadInputs } from '@mod-publish-actions/core';
import type { UploadInputs } from '@mod-publish-actions/core';

type ModrinthUploadInputs = UploadInputs & {
  versionNumber: string;
};

export function readInputs(): ModrinthUploadInputs {
  return { ...readUploadInputs(), versionNumber: getInput('version-number', { required: true }) };
}

export async function uploadVersion(): Promise<void> {
  readInputs();
  throw new Error('modrinth/upload is not implemented yet');
}
