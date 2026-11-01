import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { findSingleFile } from './fs';

function createFolder(...files: string[]): string {
  const folder = mkdtempSync(join(tmpdir(), 'find-single-file-'));
  for (const file of files) {
    writeFileSync(join(folder, file), '');
  }
  return folder;
}

describe('findSingleFile', () => {
  it('returns the one file a glob matches', () => {
    const folder = createFolder('mod-1.0.0+1.21.1-neoforge.jar', 'mod-1.0.0+1.21.1-fabric.jar');

    expect(findSingleFile(join(folder, 'mod-*+1.21.1-neoforge.jar'))).toBe(join(folder, 'mod-1.0.0+1.21.1-neoforge.jar'));
  });

  it('returns a plain path', () => {
    const folder = createFolder('mod.jar');

    expect(findSingleFile(join(folder, 'mod.jar'))).toBe(join(folder, 'mod.jar'));
  });

  it('ignores sources and javadoc jars', () => {
    const folder = createFolder('mod.jar', 'mod-sources.jar', 'mod-javadoc.jar');

    expect(findSingleFile(join(folder, '*.jar'))).toBe(join(folder, 'mod.jar'));
  });

  it('ignores folders', () => {
    const folder = createFolder('mod.jar');
    mkdirSync(join(folder, 'nested'));

    expect(findSingleFile(join(folder, '*'))).toBe(join(folder, 'mod.jar'));
  });

  it('rejects a pattern that matches nothing', () => {
    const folder = createFolder();

    expect(() => findSingleFile(join(folder, '*.jar'))).toThrow('matched none');
  });

  it('rejects a path to a folder', () => {
    const folder = createFolder();

    expect(() => findSingleFile(folder)).toThrow('matched none');
  });

  it('rejects a pattern that matches only a sources jar', () => {
    const folder = createFolder('mod-1.0.0-sources.jar');

    expect(() => findSingleFile(join(folder, '*.jar'))).toThrow('matched none');
  });

  it('lists the files when a pattern matches several', () => {
    const folder = createFolder('mod-a.jar', 'mod-b.jar');

    expect(() => findSingleFile(join(folder, '*.jar'))).toThrow('mod-b.jar');
  });
});
