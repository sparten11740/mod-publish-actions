import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WORKFLOWS_DIRECTORY = '.github/workflows';
const COMMIT_SHA_REFERENCE = /@[0-9a-f]{40}$/;

function findActionReferences(workflow: string): string[] {
  return [...workflow.matchAll(/^\s*(?:-\s*)?uses:\s*(\S+)/gm)]
    .map(([, reference = '']) => reference)
    .filter((reference) => !reference.startsWith('./'));
}

describe('workflows', () => {
  it.each(readdirSync(WORKFLOWS_DIRECTORY))('%s pins every action to a full commit SHA', (file) => {
    const references = findActionReferences(readFileSync(join(WORKFLOWS_DIRECTORY, file), 'utf8'));

    expect(references.length).toBeGreaterThan(0);
    expect(references.filter((reference) => !COMMIT_SHA_REFERENCE.test(reference))).toEqual([]);
  });
});
