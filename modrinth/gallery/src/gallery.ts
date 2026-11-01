import { getBooleanInput, info } from '@actions/core';
import { readFile } from 'node:fs/promises';

import { readRequired, readToken } from '@mod-publish-actions/core';
import { addGalleryImage, deleteGalleryImage, getGallery, MODRINTH_API_URL, modifyGalleryImage } from '@mod-publish-actions/modrinth';
import type { GalleryImage, GalleryImageChange } from '@mod-publish-actions/modrinth';

import { readImages } from './images';
import type { LocalImage } from './images';

type GalleryInputs = {
  token: string;
  projectId: string;
  images: string;
  removeMissing: boolean;
};

type SyncPlan = {
  add: LocalImage[];
  modify: GalleryImageChange[];
  remove: GalleryImage[];
};

export function readInputs(): GalleryInputs {
  return {
    token: readToken(),
    projectId: readRequired('project-id'),
    images: readRequired('images'),
    removeMissing: getBooleanInput('remove-missing', { required: true }),
  };
}

export function planSync(local: LocalImage[], remote: GalleryImage[], removeMissing: boolean): SyncPlan {
  const remoteByTitle = new Map(remote.toReversed().map((image) => [image.title, image]));
  const matches = local.map((image) => ({ image, match: remoteByTitle.get(image.title) }));
  const matched = new Set(matches.flatMap(({ match }) => (match === undefined ? [] : [match])));
  const unmatched = remote.filter((image) => !matched.has(image));
  const changes = matches.flatMap(({ image, match }) =>
    match !== undefined && (match.featured !== image.featured || match.ordering !== image.ordering)
      ? [{ url: match.url, featured: image.featured, ordering: image.ordering }]
      : [],
  );
  const staleFeatured = unmatched.filter(({ featured }) => featured).map(({ url, ordering }) => ({ url, featured: false, ordering }));

  return {
    add: matches.filter(({ match }) => match === undefined).map(({ image }) => image),
    modify: removeMissing ? changes : [...changes, ...staleFeatured],
    remove: removeMissing ? unmatched : [],
  };
}

export async function applySync(inputs: GalleryInputs, apiUrl: string): Promise<SyncPlan> {
  const { token, projectId } = inputs;
  const local = readImages(inputs.images);
  const plan = planSync(local, await getGallery(apiUrl, token, projectId), inputs.removeMissing);
  const steps = [
    ...plan.remove.map(({ url, title }) => () => {
      info(`Removing ${title ?? 'an untitled image'}: ${url}`);
      return deleteGalleryImage(apiUrl, token, projectId, url);
    }),
    ...plan.add.map((image) => async () => {
      info(`Adding ${image.title}: ${image.path}`);
      return addGalleryImage(apiUrl, token, projectId, { ...image, bytes: await readFile(image.path) });
    }),
    ...plan.modify.map((change) => () => {
      info(`Updating ${change.url}`);
      return modifyGalleryImage(apiUrl, token, projectId, change);
    }),
  ];

  await steps.reduce((previous, step) => previous.then(step), Promise.resolve());
  return plan;
}

export async function syncGallery(): Promise<void> {
  const { add, modify, remove } = await applySync(readInputs(), MODRINTH_API_URL);
  info(`Modrinth gallery synced: ${add.length} added, ${modify.length} updated, ${remove.length} removed`);
}
