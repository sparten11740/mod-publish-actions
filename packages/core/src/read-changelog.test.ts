import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { readChangelog } from './read-changelog';

describe('readChangelog', () => {
  it('returns inline text', () => {
    expect(readChangelog('Fixed a crash', '')).toBe('Fixed a crash');
  });

  it('reads a file', () => {
    const changelogFile = join(mkdtempSync(join(tmpdir(), 'changelog-')), 'CHANGELOG.md');
    writeFileSync(changelogFile, '## 1.0.0');

    expect(readChangelog('', changelogFile)).toBe('## 1.0.0');
  });

  it('rejects both sources at once', () => {
    expect(() => readChangelog('Fixed a crash', 'CHANGELOG.md')).toThrow('not both');
  });

  it('rejects no source at all', () => {
    expect(() => readChangelog('', '')).toThrow('Set changelog or changelog-file');
  });
});
