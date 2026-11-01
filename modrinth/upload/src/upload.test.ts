import { http, HttpResponse } from 'msw/http';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { recordRequests, stubInputs, useMockServer, VALID_UPLOAD_INPUTS } from '@mod-publish-actions/core/testing';

import { publishVersion, readInputs, uploadVersion } from './upload';
import type { ModrinthUploadInputs } from './upload';

const API_URL = 'https://modrinth.test/v2';
const UPLOAD_URL = `${API_URL}/version`;
const VERSION_LOOKUP_URL = `${API_URL}/project/AABBCCDD/version/1.0.0%2B1.21.1-neoforge`;
const TOKEN = 'secret-token';

const server = useMockServer();
const uploadedForms: FormData[] = [];

type Responses = {
  upload: () => Response;
  lookup: () => Response;
  project: () => Response;
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
  return HttpResponse.json({ id });
}

function respondNotFound(): Response {
  return new HttpResponse(undefined, { status: 404 });
}

function mockModrinth(responses: Partial<Responses> = {}, apiUrl = API_URL): Request[] {
  uploadedForms.length = 0;
  const requests = recordRequests(server);
  const respondToUpload = responses.upload ?? (() => respondWithId('NEWVERSION'));
  server.use(
    http.get(`${apiUrl}/project/:project/version/:version`, responses.lookup ?? respondNotFound),
    http.get(`${apiUrl}/project/:project`, responses.project ?? respondNotFound),
    http.post(`${apiUrl}/version`, async ({ request }) => {
      uploadedForms.push(await request.formData());
      return respondToUpload();
    }),
  );
  return requests;
}

function findRequest(requests: Request[], url: string): Request {
  const request = requests.find((candidate) => candidate.url === url);
  if (request === undefined) {
    throw new Error(`No request to ${url}`);
  }
  return request;
}

function readUploadedForm(): FormData {
  const [form] = uploadedForms;
  if (form === undefined) {
    throw new Error('Nothing was uploaded');
  }
  return form;
}

function readUploadedData(): unknown {
  const data = readUploadedForm().get('data');
  if (typeof data === 'string') {
    return JSON.parse(data);
  }
  throw new Error('The form has no data field');
}

function readUrls(requests: Request[]): string[] {
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
  it('returns the ID of the new version', async () => {
    mockModrinth();

    await expect(publishVersion(createInputs(), API_URL)).resolves.toBe('NEWVERSION');
  });

  it('posts to the version endpoint with the token', async () => {
    const requests = mockModrinth();

    await publishVersion(createInputs(), API_URL);

    const request = findRequest(requests, UPLOAD_URL);
    expect(request.method).toBe('POST');
    expect(request.headers.get('authorization')).toBe(TOKEN);
  });

  it('translates the inputs into the version data', async () => {
    mockModrinth();

    await publishVersion(createInputs(), API_URL);

    expect(readUploadedData()).toEqual({
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
    mockModrinth();

    await publishVersion(createInputs(), API_URL);

    const form = readUploadedForm();
    expect([...form.keys()]).toEqual(['data', 'file']);
    const file = form.get('file');
    expect(file).toBeInstanceOf(File);
    expect(file instanceof File && file.name).toBe('mod-1.0.0+1.21.1-neoforge.jar');
    expect(file instanceof File && (await file.text())).toBe('jar contents');
  });

  it('uses the display name as the version name when there is one', async () => {
    mockModrinth();

    await publishVersion(createInputs({ displayName: 'My Mod 1.0.0' }), API_URL);

    expect(readUploadedData()).toMatchObject({ name: 'My Mod 1.0.0' });
  });

  it.each([
    ['client', 'client_only'],
    ['server', 'server_only'],
    ['both', 'client_and_server'],
  ] as const)('translates the %s environment to %s', async (environment, expected) => {
    mockModrinth();

    await publishVersion(createInputs({ environment }), API_URL);

    expect(readUploadedData()).toMatchObject({ environment: expected });
  });

  it('looks for an existing version by project and encoded number, without sending the token', async () => {
    const requests = mockModrinth();

    await publishVersion(createInputs(), API_URL);

    const lookup = findRequest(requests, VERSION_LOOKUP_URL);
    expect(lookup.method).toBe('GET');
    expect(lookup.headers.has('authorization')).toBe(false);
  });

  it('returns the existing ID and uploads nothing when the version number already exists', async () => {
    const requests = mockModrinth({ lookup: () => respondWithId('EXISTING') });

    await expect(publishVersion(createInputs({ dependencies: [{ project: 'fabric-api', type: 'required' }] }), API_URL)).resolves.toBe(
      'EXISTING',
    );
    expect(readUrls(requests)).toEqual([VERSION_LOOKUP_URL]);
  });

  it('uploads nothing when the check for an existing version fails', async () => {
    const requests = mockModrinth({ lookup: () => new HttpResponse('Server error', { status: 500 }) });

    await expect(publishVersion(createInputs(), API_URL)).rejects.toThrow(`GET ${VERSION_LOOKUP_URL} failed with status 500`);
    expect(readUrls(requests)).not.toContain(UPLOAD_URL);
  });

  it('resolves dependency slugs to project IDs without sending the token', async () => {
    const requests = mockModrinth({ project: () => respondWithId('P7dR8mSH') });

    await publishVersion(createInputs({ dependencies: [{ project: 'fabric-api', type: 'required' }] }), API_URL);

    const lookup = findRequest(requests, `${API_URL}/project/fabric-api`);
    expect(lookup.method).toBe('GET');
    expect(lookup.headers.has('authorization')).toBe(false);
    expect(readUploadedData()).toMatchObject({
      dependencies: [{ project_id: 'P7dR8mSH', dependency_type: 'required' }],
    });
  });

  it('publishes nothing when a dependency cannot be found', async () => {
    const requests = mockModrinth();

    await expect(publishVersion(createInputs({ dependencies: [{ project: 'missing', type: 'required' }] }), API_URL)).rejects.toThrow(
      `GET ${API_URL}/project/missing failed with status 404`,
    );
    expect(readUrls(requests)).not.toContain(UPLOAD_URL);
  });

  it('sends nothing when the file pattern matches no file', async () => {
    const requests = mockModrinth();

    await expect(publishVersion(createInputs({ file: join(tmpdir(), 'no-such-folder-zzqq', '*.jar') }), API_URL)).rejects.toThrow(
      'matched none',
    );
    expect(requests).toEqual([]);
  });

  it('reports the status and body of a rejected upload, without the token', async () => {
    mockModrinth({ upload: () => new HttpResponse('{"error":"unauthorized","description":"Bad token"}', { status: 401 }) });

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
    mockModrinth({ upload: () => new HttpResponse(body) });

    await expect(publishVersion(createInputs(), API_URL)).rejects.toThrow('returned an unexpected response');
  });
});

describe('uploadVersion', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('publishes to the production API and sets the version-id output', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'upload-version-'));
    const file = join(folder, 'mod.jar');
    const outputFile = join(folder, 'output');
    writeFileSync(file, 'jar contents');
    writeFileSync(outputFile, '');
    stubInputs({ ...VALID_UPLOAD_INPUTS, file, 'version-number': '1.0.0' });
    vi.stubEnv('GITHUB_OUTPUT', outputFile);
    const requests = mockModrinth({}, 'https://api.modrinth.com/v2');

    await uploadVersion();

    expect(readUrls(requests)).toEqual(['https://api.modrinth.com/v2/project/123456/version/1.0.0', 'https://api.modrinth.com/v2/version']);
    const output = readFileSync(outputFile, 'utf8');
    expect(output).toContain('version-id');
    expect(output).toContain('NEWVERSION');
  });
});
