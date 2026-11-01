import { warning } from '@actions/core';
import { readdirSync, statSync } from 'node:fs';
import { extname, join, parse } from 'node:path';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const CONTENT_TYPES = new Map([
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['bmp', 'image/bmp'],
  ['gif', 'image/gif'],
  ['webp', 'image/webp'],
  ['svg', 'image/svg'],
  ['svgz', 'image/svgz'],
  ['rgb', 'image/rgb'],
]);

export type LocalImage = {
  path: string;
  extension: string;
  contentType: string;
  title: string;
  featured: boolean;
  ordering: number;
};

function readExtension(fileName: string): string {
  return extname(fileName).slice(1).toLowerCase();
}

function toTitle(fileName: string): string {
  const words = parse(fileName)
    .name.replace(/^\d+[-_ ]+/, '')
    .replaceAll(/[-_]+/g, ' ')
    .trim();
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

function listFileNames(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .toSorted((first, second) => first.localeCompare(second, 'en', { numeric: true }));
}

function selectImageNames(folder: string): string[] {
  if (statSync(folder, { throwIfNoEntry: false })?.isDirectory() !== true) {
    throw new Error(`images folder "${folder}" does not exist`);
  }
  const fileNames = listFileNames(folder);
  const imageNames = fileNames.filter((fileName) => CONTENT_TYPES.has(readExtension(fileName)));
  const skipped = fileNames.filter((fileName) => !imageNames.includes(fileName));
  if (skipped.length > 0) {
    warning(`Skipping files in ${folder} that Modrinth doesn't accept as images: ${skipped.join(', ')}`);
  }
  if (imageNames.length === 0) {
    throw new Error(`images folder "${folder}" has no images`);
  }
  return imageNames;
}

function assertWithinSizeLimit(folder: string, imageNames: string[]): void {
  const oversized = imageNames.filter((imageName) => statSync(join(folder, imageName)).size > MAX_IMAGE_BYTES);
  if (oversized.length > 0) {
    throw new Error(`Modrinth gallery images can be at most 5 MiB, but these in "${folder}" are larger: ${oversized.join(', ')}`);
  }
}

function assertUniqueTitles(images: LocalImage[]): void {
  const titles = images.map(({ title }) => title);
  const repeated = titles.filter((title, index) => titles.indexOf(title) !== index);
  if (repeated.length > 0) {
    throw new Error(`Gallery titles come from file names and must be unique, but these repeat: ${repeated.join(', ')}`);
  }
}

export function readImages(folder: string): LocalImage[] {
  const imageNames = selectImageNames(folder);
  assertWithinSizeLimit(folder, imageNames);
  const images = imageNames.map((imageName, index) => {
    const extension = readExtension(imageName);
    return {
      path: join(folder, imageName),
      extension,
      contentType: CONTENT_TYPES.get(extension) ?? '',
      title: toTitle(imageName),
      featured: index === 0,
      ordering: index,
    };
  });
  assertUniqueTitles(images);
  return images;
}
