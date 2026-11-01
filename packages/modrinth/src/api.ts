import * as zod from 'zod/v4';

import { assertSuccess, parseReply, sendRequest } from '@mod-publish-actions/core';
import type { HttpReply, HttpRequest } from '@mod-publish-actions/core';

const NOT_FOUND = 404;
const TOO_MANY_REQUESTS = 429;

const IDENTIFIED_SCHEMA = zod.object({ id: zod.string() });

const EXISTING_VERSION_SCHEMA = zod.object({
  id: zod.string(),
  loaders: zod.array(zod.string()),
  game_versions: zod.array(zod.string()),
});

const GALLERY_IMAGE_SCHEMA = zod.object({
  url: zod.string(),
  featured: zod.boolean(),
  title: zod
    .string()
    .nullish()
    .transform((title) => title ?? undefined),
  ordering: zod.int().default(0),
});

const PROJECT_GALLERY_SCHEMA = zod.object({
  gallery: zod.array(GALLERY_IMAGE_SCHEMA.nullable()).transform((images) => images.flatMap((image) => image ?? [])),
});

export const MODRINTH_API_URL = 'https://api.modrinth.com/v2';

export type ExistingVersion = zod.infer<typeof EXISTING_VERSION_SCHEMA>;

export type GalleryImage = zod.infer<typeof GALLERY_IMAGE_SCHEMA>;

type NewGalleryImage = {
  bytes: Uint8Array<ArrayBuffer>;
  extension: string;
  contentType: string;
  title: string;
  featured: boolean;
  ordering: number;
};

export type GalleryImageChange = {
  url: string;
  featured: boolean;
  ordering: number;
};

function assertAccepted(reply: HttpReply, url: string, method: string): void {
  if (reply.response.status === TOO_MANY_REQUESTS) {
    throw new Error(
      `${method} ${url} was rate limited, try again in ${reply.response.headers.get('X-Ratelimit-Reset') ?? 'a few'} seconds`,
    );
  }
  assertSuccess(reply, url, method);
}

async function sendAccepted(url: string, request: HttpRequest): Promise<string> {
  const reply = await sendRequest(url, request);
  assertAccepted(reply, url, request.method);
  return reply.text;
}

function projectUrl(apiUrl: string, project: string): string {
  return `${apiUrl}/project/${encodeURIComponent(project)}`;
}

function galleryUrl(apiUrl: string, project: string, parameters: Record<string, string>): string {
  return `${projectUrl(apiUrl, project)}/gallery?${new URLSearchParams(parameters).toString()}`;
}

export async function getProjectId(apiUrl: string, project: string): Promise<string> {
  const url = projectUrl(apiUrl, project);
  return parseReply(await sendAccepted(url, { method: 'GET' }), IDENTIFIED_SCHEMA, url).id;
}

export async function findVersion(
  apiUrl: string,
  token: string,
  projectId: string,
  versionNumber: string,
): Promise<ExistingVersion | undefined> {
  const method = 'GET';
  const url = `${projectUrl(apiUrl, projectId)}/version/${encodeURIComponent(versionNumber)}`;
  const reply = await sendRequest(url, { method, headers: { Authorization: token } });
  if (reply.response.status === NOT_FOUND) {
    return undefined;
  }
  assertAccepted(reply, url, method);
  return parseReply(reply.text, EXISTING_VERSION_SCHEMA, url);
}

export async function postVersion(apiUrl: string, token: string, form: FormData): Promise<string> {
  const url = `${apiUrl}/version`;
  return parseReply(await sendAccepted(url, { method: 'POST', headers: { Authorization: token }, body: form }), IDENTIFIED_SCHEMA, url).id;
}

export async function getGallery(apiUrl: string, token: string, project: string): Promise<GalleryImage[]> {
  const url = projectUrl(apiUrl, project);
  const text = await sendAccepted(url, { method: 'GET', headers: { Authorization: token } });
  return parseReply(text, PROJECT_GALLERY_SCHEMA, url).gallery;
}

export async function addGalleryImage(apiUrl: string, token: string, project: string, image: NewGalleryImage): Promise<void> {
  const url = galleryUrl(apiUrl, project, {
    ext: image.extension,
    featured: String(image.featured),
    title: image.title,
    ordering: String(image.ordering),
  });
  await sendAccepted(url, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': image.contentType },
    body: image.bytes,
  });
}

export async function modifyGalleryImage(apiUrl: string, token: string, project: string, change: GalleryImageChange): Promise<void> {
  const url = galleryUrl(apiUrl, project, {
    url: change.url,
    featured: String(change.featured),
    ordering: String(change.ordering),
  });
  await sendAccepted(url, { method: 'PATCH', headers: { Authorization: token } });
}

export async function deleteGalleryImage(apiUrl: string, token: string, project: string, imageUrl: string): Promise<void> {
  await sendAccepted(galleryUrl(apiUrl, project, { url: imageUrl }), { method: 'DELETE', headers: { Authorization: token } });
}
