import { globSync } from 'node:fs';
import { join } from 'node:path';

const NON_RELEASE_JAR = /-(sources|javadoc)\.jar$/;

export function findSingleFile(pattern: string): string {
  const matches = globSync(pattern, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !NON_RELEASE_JAR.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
  const [match, ...others] = matches;
  if (match === undefined) {
    throw new Error(`file must match exactly one file, but "${pattern}" matched none. -sources and -javadoc jars are ignored`);
  }
  if (others.length > 0) {
    throw new Error(`file must match exactly one file, but "${pattern}" matched ${matches.length}: ${matches.join(', ')}`);
  }
  return match;
}
