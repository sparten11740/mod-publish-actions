import { getInput } from '@actions/core';

import { parseList, readUploadInputs } from '@mod-publish-actions/core';
import type { UploadInputs } from '@mod-publish-actions/core';

type CurseforgeUploadInputs = UploadInputs & {
  javaVersions: string[];
};

export function readInputs(): CurseforgeUploadInputs {
  const inputs = readUploadInputs();
  if (!/^\d+$/.test(inputs.projectId)) {
    throw new Error(`project-id must be a numeric CurseForge project ID, got "${inputs.projectId}"`);
  }
  return { ...inputs, javaVersions: parseList(getInput('java-versions')) };
}
