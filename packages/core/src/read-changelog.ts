import { readFileSync } from 'node:fs';

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
