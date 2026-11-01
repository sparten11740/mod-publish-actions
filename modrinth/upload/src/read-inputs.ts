import { getInput } from '@actions/core';

import { readUploadInputs } from '@mod-publish-actions/core';
import type { UploadInputs } from '@mod-publish-actions/core';

type ModrinthUploadInputs = UploadInputs & {
  versionNumber: string;
};

export function readInputs(): ModrinthUploadInputs {
  return { ...readUploadInputs(), versionNumber: getInput('version-number', { required: true }) };
}
