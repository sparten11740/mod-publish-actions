import { http, HttpResponse } from 'msw/http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { recordRequests, stubInputs, useMockServer } from '@mod-publish-actions/core/testing';
import type { GalleryImage } from '@mod-publish-actions/modrinth';

import { applySync, planSync, readInputs, syncGallery } from './gallery';
import type { LocalImage } from './images';

const API_URL = 'https://modrinth.test/v2';
const TOKEN = 'secret-token';
const VALID_INPUTS = {
  token: TOKEN,
  'project-id': 'blockpilot',
  images: 'docs/images',
  'remove-missing': 'true',
};

const server = useMockServer();

function createLocalImage(title: string, ordering: number): LocalImage {
  return {
    path: `docs/images/${title}.png`,
    extension: 'png',
    contentType: 'image/png',
    title,
    featured: ordering === 0,
    ordering,
  };
}

function createRemoteImage(title: string | undefined, ordering: number, featured = ordering === 0): GalleryImage {
  return { url: `https://cdn.modrinth.test/${title ?? 'untitled'}.webp`, title, featured, ordering };
}

function createFolder(...files: string[]): string {
  const folder = mkdtempSync(join(tmpdir(), 'sync-gallery-'));
  for (const file of files) {
    writeFileSync(join(folder, file), `contents of ${file}`);
  }
  return folder;
}

function mockModrinth(gallery: GalleryImage[], { failOn, apiUrl = API_URL }: { failOn?: string; apiUrl?: string } = {}): Request[] {
  const requests = recordRequests(server);
  server.use(
    http.get(`${apiUrl}/project/:project`, () => HttpResponse.json({ gallery })),
    http.all(`${apiUrl}/project/:project/gallery`, ({ request }) =>
      request.method === failOn ? new HttpResponse('Server error', { status: 500 }) : new HttpResponse(undefined, { status: 204 }),
    ),
  );
  return requests;
}

function describeRequests(requests: Request[]): string[] {
  return requests.map(({ method, url }) => `${method} ${url}`);
}

describe('readInputs', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads the gallery inputs', () => {
    stubInputs(VALID_INPUTS);

    expect(readInputs()).toEqual({ token: TOKEN, projectId: 'blockpilot', images: 'docs/images', removeMissing: true });
  });

  it('requires a token', () => {
    stubInputs({ ...VALID_INPUTS, token: '' });

    expect(() => readInputs()).toThrow('token');
  });

  it.each(['project-id', 'images'])('rejects a %s that is only whitespace', (name) => {
    stubInputs({ ...VALID_INPUTS, [name]: '   ' });

    expect(() => readInputs()).toThrow(name);
  });

  it('rejects a remove-missing value that is not a boolean', () => {
    stubInputs({ ...VALID_INPUTS, 'remove-missing': 'sometimes' });

    expect(() => readInputs()).toThrow('remove-missing');
  });
});

describe('planSync', () => {
  it('clears the featured flag of an image that stays but is not in the folder', () => {
    const old = createRemoteImage('Old', 4, true);

    expect(planSync([createLocalImage('Crater', 0)], [old], false).modify).toEqual([{ url: old.url, featured: false, ordering: 4 }]);
  });

  it('removes an image with no file even if another image shares its URL', () => {
    const kept = { ...createRemoteImage('Crater', 0), url: 'https://cdn.modrinth.test/shared.webp' };
    const old = { ...createRemoteImage('Old', 1, false), url: 'https://cdn.modrinth.test/shared.webp' };

    expect(planSync([createLocalImage('Crater', 0)], [kept, old], true).remove).toEqual([old]);
  });

  it('adds images the gallery does not have', () => {
    const local = [createLocalImage('Crater', 0)];

    expect(planSync(local, [], false)).toEqual({ add: local, modify: [], remove: [] });
  });

  it('plans nothing when the gallery already matches', () => {
    const plan = planSync(
      [createLocalImage('Crater', 0), createLocalImage('Fireball', 1)],
      [createRemoteImage('Crater', 0), createRemoteImage('Fireball', 1)],
      true,
    );

    expect(plan).toEqual({ add: [], modify: [], remove: [] });
  });

  it('updates an image whose position changed', () => {
    const remote = createRemoteImage('Fireball', 5, false);

    expect(
      planSync([createLocalImage('Crater', 0), createLocalImage('Fireball', 1)], [createRemoteImage('Crater', 0), remote], false).modify,
    ).toEqual([{ url: remote.url, featured: false, ordering: 1 }]);
  });

  it('moves the featured flag to the first image', () => {
    const crater = createRemoteImage('Crater', 0, false);
    const fireball = createRemoteImage('Fireball', 1, true);

    expect(planSync([createLocalImage('Crater', 0), createLocalImage('Fireball', 1)], [crater, fireball], false).modify).toEqual([
      { url: crater.url, featured: true, ordering: 0 },
      { url: fireball.url, featured: false, ordering: 1 },
    ]);
  });

  it('keeps images that are not in the folder unless asked to remove them', () => {
    const local = [createLocalImage('Crater', 0)];
    const remote = [createRemoteImage('Crater', 0), createRemoteImage('Old', 1)];

    expect(planSync(local, remote, false).remove).toEqual([]);
    expect(planSync(local, remote, true).remove).toEqual([remote[1]]);
  });

  it('leaves a stale featured image alone when it is being deleted anyway', () => {
    const local = [createLocalImage('Crater', 0)];
    const old = createRemoteImage('Old', 4, true);

    expect(planSync(local, [old], true)).toEqual({ add: local, modify: [], remove: [old] });
  });

  it('plans nothing for an extra image that is kept and not featured, so a re-run changes nothing', () => {
    const plan = planSync([createLocalImage('Crater', 0)], [createRemoteImage('Crater', 0), createRemoteImage('Old', 4, false)], false);

    expect(plan).toEqual({ add: [], modify: [], remove: [] });
  });

  it('treats an untitled image as not in the folder', () => {
    const untitled = createRemoteImage(undefined, 1);

    expect(planSync([createLocalImage('Crater', 0)], [untitled], true).remove).toEqual([untitled]);
  });

  it('removes a second gallery image with the same title', () => {
    const first = { ...createRemoteImage('Crater', 0), url: 'https://cdn.modrinth.test/first.webp' };
    const second = { ...createRemoteImage('Crater', 1, false), url: 'https://cdn.modrinth.test/second.webp' };

    expect(planSync([createLocalImage('Crater', 0)], [first, second], true)).toEqual({ add: [], modify: [], remove: [second] });
  });
});

describe('applySync', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('removes, then adds, then updates, so a renamed file cannot lose its new image', async () => {
    const folder = createFolder('crater.png', 'fireball.png');
    const fireball = createRemoteImage('Fireball', 7, false);
    const old = createRemoteImage('Old', 8, false);
    const requests = mockModrinth([fireball, old]);

    await applySync({ token: TOKEN, projectId: 'my-mod', images: folder, removeMissing: true }, API_URL);

    expect(describeRequests(requests)).toEqual([
      `GET ${API_URL}/project/my-mod`,
      `DELETE ${API_URL}/project/my-mod/gallery?url=${encodeURIComponent(old.url)}`,
      `POST ${API_URL}/project/my-mod/gallery?ext=png&featured=true&title=Crater&ordering=0`,
      `PATCH ${API_URL}/project/my-mod/gallery?url=${encodeURIComponent(fireball.url)}&featured=false&ordering=1`,
    ]);
  });

  it('stops at the first failed request', async () => {
    const folder = createFolder('crater.png', 'fireball.png');
    const requests = mockModrinth([createRemoteImage('Fireball', 7, false)], { failOn: 'POST' });

    await expect(applySync({ token: TOKEN, projectId: 'my-mod', images: folder, removeMissing: false }, API_URL)).rejects.toThrow(
      'failed with status 500',
    );
    expect(requests.some(({ method }) => method === 'PATCH')).toBe(false);
  });

  it('logs each change before making it, so a later failure still leaves a record of what was removed', async () => {
    const events: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      events.push(String(chunk));
      return true;
    });
    const folder = createFolder('crater.png');
    const old = createRemoteImage('Old', 8, false);
    mockModrinth([old], { failOn: 'POST' });
    server.events.on('request:start', ({ request }) => {
      events.push(`request ${request.method}`);
    });

    await expect(applySync({ token: TOKEN, projectId: 'my-mod', images: folder, removeMissing: true }, API_URL)).rejects.toThrow(
      'failed with status 500',
    );

    const removal = events.findIndex((event) => event.includes(`Removing Old: ${old.url}`));
    const addition = events.findIndex((event) => event.includes('Adding Crater'));
    expect(removal).toBeGreaterThanOrEqual(0);
    expect(removal).toBeLessThan(events.indexOf('request DELETE'));
    expect(addition).toBeGreaterThanOrEqual(0);
    expect(addition).toBeLessThan(events.indexOf('request POST'));
  });

  it('sends the contents of the file', async () => {
    const folder = createFolder('crater.png');
    const requests = mockModrinth([]);

    await applySync({ token: TOKEN, projectId: 'my-mod', images: folder, removeMissing: false }, API_URL);

    await expect(requests.find(({ method }) => method === 'POST')?.text()).resolves.toBe('contents of crater.png');
  });

  it('only reads the gallery when nothing changed', async () => {
    const folder = createFolder('crater.png');
    const requests = mockModrinth([createRemoteImage('Crater', 0)]);

    await applySync({ token: TOKEN, projectId: 'my-mod', images: folder, removeMissing: true }, API_URL);

    expect(describeRequests(requests)).toEqual([`GET ${API_URL}/project/my-mod`]);
  });

  it('sends nothing when the folder has no images, even with remove-missing on', async () => {
    const folder = createFolder();
    const requests = mockModrinth([createRemoteImage('Crater', 0)]);

    await expect(applySync({ token: TOKEN, projectId: 'my-mod', images: folder, removeMissing: true }, API_URL)).rejects.toThrow(
      'has no images',
    );
    expect(requests).toEqual([]);
  });
});

describe('syncGallery', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('syncs against the production API', async () => {
    stubInputs({ ...VALID_INPUTS, images: createFolder('crater.png') });
    const requests = mockModrinth([], { apiUrl: 'https://api.modrinth.com/v2' });

    await syncGallery();

    expect(describeRequests(requests)[0]).toBe('GET https://api.modrinth.com/v2/project/blockpilot');
  });
});
