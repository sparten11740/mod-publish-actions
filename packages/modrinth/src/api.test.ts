import { http, HttpResponse } from 'msw/http';
import { describe, expect, it } from 'vitest';

import { recordRequests, useMockServer } from '@mod-publish-actions/core/testing';

import { addGalleryImage, deleteGalleryImage, getGallery, getProjectId, modifyGalleryImage } from './api';

const API_URL = 'https://modrinth.test/v2';
const TOKEN = 'secret-token';
const IMAGE_URL = 'https://cdn.modrinth.test/images/crater_350.webp';
const ENCODED_IMAGE_URL = 'https%3A%2F%2Fcdn.modrinth.test%2Fimages%2Fcrater_350.webp';

const server = useMockServer();

function mockModrinth(respond: () => Response): Request[] {
  const requests = recordRequests(server);
  server.use(http.all(`${API_URL}/*`, respond));
  return requests;
}

function respondWithNoContent(): Response {
  return new HttpResponse(undefined, { status: 204 });
}

describe('rate limits', () => {
  it('says how long to wait', async () => {
    mockModrinth(() => new HttpResponse(undefined, { status: 429, headers: { 'X-Ratelimit-Reset': '42' } }));

    await expect(getProjectId(API_URL, 'fabric-api')).rejects.toThrow(
      `GET ${API_URL}/project/fabric-api was rate limited, try again in 42 seconds`,
    );
  });
});

describe('getGallery', () => {
  it('reads the images, with the token', async () => {
    const requests = mockModrinth(
      () =>
        new HttpResponse(
          `{"gallery":[{"url":"${IMAGE_URL}","featured":true,"title":"Crater","description":"A hole","created":"2026-01-01T00:00:00Z","ordering":2},{"url":"https://cdn.modrinth.test/images/untitled.webp","featured":false,"title":null,"created":"2026-01-01T00:00:00Z"}]}`,
        ),
    );

    await expect(getGallery(API_URL, TOKEN, 'my-mod')).resolves.toEqual([
      { url: IMAGE_URL, featured: true, title: 'Crater', ordering: 2 },
      { url: 'https://cdn.modrinth.test/images/untitled.webp', featured: false, title: undefined, ordering: 0 },
    ]);
    expect(requests[0]?.url).toBe(`${API_URL}/project/my-mod`);
    expect(requests[0]?.headers.get('authorization')).toBe(TOKEN);
  });

  it('drops null images, which the official spec allows', async () => {
    mockModrinth(() => new HttpResponse(`{"gallery":[null,{"url":"${IMAGE_URL}","featured":false}]}`));

    await expect(getGallery(API_URL, TOKEN, 'my-mod')).resolves.toEqual([
      { url: IMAGE_URL, featured: false, title: undefined, ordering: 0 },
    ]);
  });

  it('rejects a response without a gallery', async () => {
    mockModrinth(() => new HttpResponse('{"id":"abc"}'));

    await expect(getGallery(API_URL, TOKEN, 'my-mod')).rejects.toThrow('returned an unexpected response');
  });

  it('rejects a gallery image without a URL', async () => {
    mockModrinth(() => new HttpResponse('{"gallery":[{"featured":true}]}'));

    await expect(getGallery(API_URL, TOKEN, 'my-mod')).rejects.toThrow('returned an unexpected response');
  });
});

describe('addGalleryImage', () => {
  it('posts the bytes, with the metadata in the query', async () => {
    const requests = mockModrinth(respondWithNoContent);

    await addGalleryImage(API_URL, TOKEN, 'my-mod', {
      bytes: new TextEncoder().encode('image contents'),
      extension: 'jpg',
      contentType: 'image/jpeg',
      title: 'Crater floor',
      featured: true,
      ordering: 3,
    });

    expect(requests[0]?.url).toBe(`${API_URL}/project/my-mod/gallery?ext=jpg&featured=true&title=Crater+floor&ordering=3`);
    expect(requests[0]?.method).toBe('POST');
    expect(requests[0]?.headers.get('authorization')).toBe(TOKEN);
    expect(requests[0]?.headers.get('content-type')).toBe('image/jpeg');
    await expect(requests[0]?.text()).resolves.toBe('image contents');
  });
});

describe('modifyGalleryImage', () => {
  it('patches the image by its encoded URL', async () => {
    const requests = mockModrinth(respondWithNoContent);

    await modifyGalleryImage(API_URL, TOKEN, 'my-mod', { url: IMAGE_URL, featured: false, ordering: 1 });

    expect(requests[0]?.url).toBe(`${API_URL}/project/my-mod/gallery?url=${ENCODED_IMAGE_URL}&featured=false&ordering=1`);
    expect(requests[0]?.method).toBe('PATCH');
    expect(requests[0]?.headers.get('authorization')).toBe(TOKEN);
  });
});

describe('deleteGalleryImage', () => {
  it('deletes the image by its encoded URL', async () => {
    const requests = mockModrinth(respondWithNoContent);

    await deleteGalleryImage(API_URL, TOKEN, 'my-mod', IMAGE_URL);

    expect(requests[0]?.url).toBe(`${API_URL}/project/my-mod/gallery?url=${ENCODED_IMAGE_URL}`);
    expect(requests[0]?.method).toBe('DELETE');
    expect(requests[0]?.headers.get('authorization')).toBe(TOKEN);
  });

  it('reports a rejected request without the token', async () => {
    mockModrinth(() => new HttpResponse('{"error":"unauthorized"}', { status: 401 }));

    const failure = await deleteGalleryImage(API_URL, TOKEN, 'my-mod', IMAGE_URL).catch((error: unknown) => String(error));

    expect(failure).toContain('failed with status 401');
    expect(failure).not.toContain(TOKEN);
  });
});
