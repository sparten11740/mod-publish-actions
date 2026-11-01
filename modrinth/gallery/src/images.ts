import { warning } from '@actions/core';
import { readdirSync, statSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { extname, join, parse } from 'node:path';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ORDER_PREFIX = /^\d+[-_ ]+/;
const WORD_SEPARATORS = /[-_]+/g;

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
  const words = parse(fileName).name.replace(ORDER_PREFIX, '').replaceAll(WORD_SEPARATORS, ' ').trim();
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

function listEntries(folder: string): Dirent[] {
  return readdirSync(folder, { withFileTypes: true })
    .filter(({ name }) => !name.startsWith('.'))
    .toSorted((first, second) => first.name.localeCompare(second.name, 'en', { numeric: true }));
}

function selectImageNames(folder: string): string[] {
  if (statSync(folder, { throwIfNoEntry: false })?.isDirectory() !== true) {
    throw new Error(`images folder "${folder}" does not exist`);
  }
  const entries = listEntries(folder);
  const imageNames = entries.filter((entry) => entry.isFile() && CONTENT_TYPES.has(readExtension(entry.name))).map(({ name }) => name);
  const skipped = entries.filter(({ name }) => !imageNames.includes(name)).map(({ name }) => name);
  if (skipped.length > 0) {
    warning(`Skipping entries in ${folder} that are not image files Modrinth accepts: ${skipped.join(', ')}`);
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

function assertUsableTitles(images: LocalImage[]): void {
  const untitled = images.filter(({ title }) => title === '').map(({ path }) => path);
  if (untitled.length > 0) {
    throw new Error(`Gallery titles come from file names, but these give an empty title: ${untitled.join(', ')}`);
  }
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
  assertUsableTitles(images);
  return images;
}
