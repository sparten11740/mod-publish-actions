import { mkdirSync, mkdtempSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { readImages } from './images';

const FIVE_MEBIBYTES = 5 * 1024 * 1024;

function createFolder(...files: string[]): string {
  const folder = mkdtempSync(join(tmpdir(), 'read-images-'));
  for (const file of files) {
    writeFileSync(join(folder, file), 'image contents');
  }
  return folder;
}

describe('readImages', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('orders images by file name, treating numbers as numbers', () => {
    const folder = createFolder('10-last.png', '2-second.png', '1-first.png');

    expect(readImages(folder).map(({ title, ordering }) => [title, ordering])).toEqual([
      ['First', 0],
      ['Second', 1],
      ['Last', 2],
    ]);
  });

  it('features only the first image', () => {
    const folder = createFolder('a.png', 'b.png', 'c.png');

    expect(readImages(folder).map(({ featured }) => featured)).toEqual([true, false, false]);
  });

  it.each([
    ['mushroom-cloud.jpg', 'Mushroom cloud'],
    ['01-crater-floor.jpg', 'Crater floor'],
    ['black_rain.jpg', 'Black rain'],
    ['2026.jpg', '2026'],
  ])('titles %s as "%s"', (fileName, title) => {
    expect(readImages(createFolder(fileName))[0]?.title).toBe(title);
  });

  it('reads the path, extension and content type, whatever the case of the extension', () => {
    const folder = createFolder('Crater.JPG');

    expect(readImages(folder)[0]).toMatchObject({ path: join(folder, 'Crater.JPG'), extension: 'jpg', contentType: 'image/jpeg' });
  });

  it('ignores hidden files, folders and files that are not images', () => {
    const folder = createFolder('crater.png', '.DS_Store', '.hidden.png', 'notes.txt');
    mkdirSync(join(folder, 'nested.png'));

    expect(readImages(folder).map(({ title }) => title)).toEqual(['Crater']);
  });

  it('warns about the entries it skips, including folders and symlinks', () => {
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const folder = createFolder('crater.png', 'notes.txt');
    mkdirSync(join(folder, 'nested'));
    symlinkSync(join(folder, 'crater.png'), join(folder, 'linked.png'));

    expect(readImages(folder).map(({ title }) => title)).toEqual(['Crater']);
    expect(write).toHaveBeenCalledWith(expect.stringContaining('linked.png, nested, notes.txt'));
  });

  it('rejects a file name that gives an empty title', () => {
    const folder = createFolder('01-crater.png', '02-.png');

    expect(() => readImages(folder)).toThrow('give an empty title');
  });

  it('accepts an image of exactly 5 MiB', () => {
    const folder = createFolder('crater.png');
    truncateSync(join(folder, 'crater.png'), FIVE_MEBIBYTES);

    expect(readImages(folder)).toHaveLength(1);
  });

  it('names images over 5 MiB', () => {
    const folder = createFolder('crater.png', 'small.png');
    truncateSync(join(folder, 'crater.png'), FIVE_MEBIBYTES + 1);

    expect(() => readImages(folder)).toThrow('are larger: crater.png');
  });

  it('rejects a folder without images, so a typo cannot empty the gallery', () => {
    const folder = createFolder('notes.txt');

    expect(() => readImages(folder)).toThrow(`images folder "${folder}" has no images`);
  });

  it('names a folder that does not exist', () => {
    const folder = join(createFolder(), 'missing');

    expect(() => readImages(folder)).toThrow(`images folder "${folder}" does not exist`);
  });

  it('rejects file names that give the same title', () => {
    const folder = createFolder('01-crater.png', '02-crater.png');

    expect(() => readImages(folder)).toThrow('must be unique, but these repeat: Crater');
  });
});
