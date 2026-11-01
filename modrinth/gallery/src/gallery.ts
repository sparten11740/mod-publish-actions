import { getBooleanInput, getInput } from '@actions/core';

type GalleryInputs = {
  token: string;
  projectId: string;
  images: string;
  removeMissing: boolean;
};

export function readInputs(): GalleryInputs {
  return {
    token: getInput('token', { required: true }),
    projectId: getInput('project-id', { required: true }),
    images: getInput('images', { required: true }),
    removeMissing: getBooleanInput('remove-missing', { required: true }),
  };
}

export async function syncGallery(): Promise<void> {
  readInputs();
  throw new Error('modrinth/gallery is not implemented yet');
}
