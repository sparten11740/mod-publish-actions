import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { stubInputs, VALID_UPLOAD_INPUTS } from '@mod-publish-actions/core/testing';

import { publishVersion, readInputs, uploadVersion } from './upload';
import type { ModrinthUploadInputs } from './upload';

const API_URL = 'https://modrinth.test/v2';
const UPLOAD_URL = `${API_URL}/version`;
const VERSION_LOOKUP_URL = `${API_URL}/project/AABBCCDD/version/1.0.0%2B1.21.1-neoforge`;
const TOKEN = 'secret-token';
const USER_AGENT = 'sparten11740/mod-publish-actions';

type RecordedRequest = {
  url: string;
  init: RequestInit;
};

function createJar(): string {
  const file = join(mkdtempSync(join(tmpdir(), 'publish-version-')), 'mod-1.0.0+1.21.1-neoforge.jar');
  writeFileSync(file, 'jar contents');
  return file;
}

function createInputs(overrides: Partial<ModrinthUploadInputs> = {}): ModrinthUploadInputs {
  return {
    token: TOKEN,
    projectId: 'AABBCCDD',
    file: createJar(),
    versionNumber: '1.0.0+1.21.1-neoforge',
    gameVersions: ['1.21.1'],
    loaders: ['neoforge'],
    environment: 'client',
    releaseType: 'alpha',
    changelog: 'Fixed a crash',
    displayName: undefined,
    dependencies: [],
    ...overrides,
  };
}

function respondWithId(id: string): Response {
  return new Response(JSON.stringify({ id }));
}

function stubFetch(
  respond: (url: string) => Response = () => respondWithId('NEWVERSION'),
  respondToLookup: () => Response = () => new Response('', { status: 404 }),
): RecordedRequest[] {
  const requests: RecordedRequest[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    return url === VERSION_LOOKUP_URL ? respondToLookup() : respond(url);
  });
  return requests;
}

function readForm({ init }: RecordedRequest): FormData {
  if (init.body instanceof FormData) {
    return init.body;
  }
  throw new Error('The request has no form body');
}

function readData(request: RecordedRequest): unknown {
  const data = readForm(request).get('data');
  if (typeof data === 'string') {
    return JSON.parse(data);
  }
  throw new Error('The form has no data field');
}

function findRequest(requests: RecordedRequest[], url: string): RecordedRequest {
  const request = requests.find((candidate) => candidate.url === url);
  if (request === undefined) {
    throw new Error(`No request to ${url}`);
  }
  return request;
}

function readUrls(requests: RecordedRequest[]): string[] {
  return requests.map(({ url }) => url);
}

describe('readInputs', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('adds the version number to the shared inputs', () => {
    stubInputs({ ...VALID_UPLOAD_INPUTS, 'version-number': '1.0.0+1.21.1-neoforge' });

    expect(readInputs()).toMatchObject({ projectId: '123456', versionNumber: '1.0.0+1.21.1-neoforge' });
  });

  it('requires a version number', () => {
    stubInputs({ ...VALID_UPLOAD_INPUTS, 'version-number': '' });

    expect(() => readInputs()).toThrow('version-number');
  });
});

describe('publishVersion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the ID of the new version', async () => {
    stubFetch();

    await expect(publishVersion(createInputs(), API_URL)).resolves.toBe('NEWVERSION');
  });

  it('posts to the version endpoint with the token, a User-Agent and a timeout', async () => {
    const requests = stubFetch();

    await publishVersion(createInputs(), API_URL);

    const request = findRequest(requests, UPLOAD_URL);
    expect(request.init.method).toBe('POST');
    expect(request.init.headers).toEqual({ Authorization: TOKEN, 'User-Agent': USER_AGENT });
    expect(request.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('translates the inputs into the version data', async () => {
    const requests = stubFetch();

    await publishVersion(createInputs(), API_URL);

    expect(readData(findRequest(requests, UPLOAD_URL))).toEqual({
      name: '1.0.0+1.21.1-neoforge',
      version_number: '1.0.0+1.21.1-neoforge',
      changelog: 'Fixed a crash',
      dependencies: [],
      game_versions: ['1.21.1'],
      version_type: 'alpha',
      loaders: ['neoforge'],
      environment: 'client_only',
      featured: false,
      project_id: 'AABBCCDD',
      file_parts: ['file'],
      primary_file: 'file',
    });
  });

  it('sends the data field before the file, with the file under its own name', async () => {
    const requests = stubFetch();

    await publishVersion(createInputs(), API_URL);

    const form = readForm(findRequest(requests, UPLOAD_URL));
    expect([...form.keys()]).toEqual(['data', 'file']);
    const file = form.get('file');
    expect(file).toBeInstanceOf(File);
    expect(file instanceof File && file.name).toBe('mod-1.0.0+1.21.1-neoforge.jar');
    expect(file instanceof File && (await file.text())).toBe('jar contents');
  });

  it('uses the display name as the version name when there is one', async () => {
    const requests = stubFetch();

    await publishVersion(createInputs({ displayName: 'My Mod 1.0.0' }), API_URL);

    expect(readData(findRequest(requests, UPLOAD_URL))).toMatchObject({ name: 'My Mod 1.0.0' });
  });

  it.each([
    ['client', 'client_only'],
    ['server', 'server_only'],
    ['both', 'client_and_server'],
  ] as const)('translates the %s environment to %s', async (environment, expected) => {
    const requests = stubFetch();

    await publishVersion(createInputs({ environment }), API_URL);

    expect(readData(findRequest(requests, UPLOAD_URL))).toMatchObject({ environment: expected });
  });

  it('looks for an existing version by project and encoded number, without sending the token', async () => {
    const requests = stubFetch();

    await publishVersion(createInputs(), API_URL);

    const lookup = findRequest(requests, VERSION_LOOKUP_URL);
    expect(lookup.init.method).toBe('GET');
    expect(lookup.init.headers).toEqual({ 'User-Agent': USER_AGENT });
  });

  it('returns the existing ID and uploads nothing when the version number already exists', async () => {
    const requests = stubFetch(undefined, () => respondWithId('EXISTING'));

    await expect(publishVersion(createInputs({ dependencies: [{ project: 'fabric-api', type: 'required' }] }), API_URL)).resolves.toBe(
      'EXISTING',
    );
    expect(readUrls(requests)).toEqual([VERSION_LOOKUP_URL]);
  });

  it('uploads nothing when the check for an existing version fails', async () => {
    const requests = stubFetch(undefined, () => new Response('Server error', { status: 500 }));

    await expect(publishVersion(createInputs(), API_URL)).rejects.toThrow(`GET ${VERSION_LOOKUP_URL} failed with status 500`);
    expect(readUrls(requests)).not.toContain(UPLOAD_URL);
  });

  it('resolves dependency slugs to project IDs without sending the token', async () => {
    const requests = stubFetch((url) => respondWithId(url.endsWith('/project/fabric-api') ? 'P7dR8mSH' : 'NEWVERSION'));

    await publishVersion(createInputs({ dependencies: [{ project: 'fabric-api', type: 'required' }] }), API_URL);

    const lookup = findRequest(requests, `${API_URL}/project/fabric-api`);
    expect(lookup.init.method).toBe('GET');
    expect(lookup.init.headers).toEqual({ 'User-Agent': USER_AGENT });
    expect(readData(findRequest(requests, UPLOAD_URL))).toMatchObject({
      dependencies: [{ project_id: 'P7dR8mSH', dependency_type: 'required' }],
    });
  });

  it('publishes nothing when a dependency cannot be found', async () => {
    const requests = stubFetch(() => new Response('{"error":"not_found"}', { status: 404 }));

    await expect(publishVersion(createInputs({ dependencies: [{ project: 'missing', type: 'required' }] }), API_URL)).rejects.toThrow(
      `GET ${API_URL}/project/missing failed with status 404`,
    );
    expect(readUrls(requests)).not.toContain(UPLOAD_URL);
  });

  it('sends nothing when the file pattern matches no file', async () => {
    const requests = stubFetch();

    await expect(publishVersion(createInputs({ file: join(tmpdir(), 'no-such-folder-zzqq', '*.jar') }), API_URL)).rejects.toThrow(
      'matched none',
    );
    expect(requests).toEqual([]);
  });

  it('reports the status and body of a rejected upload, without the token', async () => {
    stubFetch(() => new Response('{"error":"unauthorized","description":"Bad token"}', { status: 401 }));

    const failure = await publishVersion(createInputs(), API_URL).catch((error: unknown) => String(error));

    expect(failure).toContain(`POST ${UPLOAD_URL} failed with status 401`);
    expect(failure).toContain('Bad token');
    expect(failure).not.toContain(TOKEN);
  });

  it.each([
    ['is not JSON', 'Bad Gateway'],
    ['has no ID', '{"name":"1.0.0"}'],
    ['has an ID that is not a string', '{"id":1}'],
  ])('rejects a successful response that %s', async (_description, body) => {
    stubFetch(() => new Response(body));

    await expect(publishVersion(createInputs(), API_URL)).rejects.toThrow('returned an unexpected response');
  });
});

describe('uploadVersion', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('publishes to the production API and sets the version-id output', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'upload-version-'));
    const file = join(folder, 'mod.jar');
    const outputFile = join(folder, 'output');
    writeFileSync(file, 'jar contents');
    writeFileSync(outputFile, '');
    stubInputs({ ...VALID_UPLOAD_INPUTS, file, 'version-number': '1.0.0' });
    vi.stubEnv('GITHUB_OUTPUT', outputFile);
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url);
      return url.includes('/project/') ? new Response('', { status: 404 }) : new Response('{"id":"NEWVERSION"}');
    });

    await uploadVersion();

    expect(urls).toEqual(['https://api.modrinth.com/v2/project/123456/version/1.0.0', 'https://api.modrinth.com/v2/version']);
    const output = readFileSync(outputFile, 'utf8');
    expect(output).toContain('version-id');
    expect(output).toContain('NEWVERSION');
  });
});
