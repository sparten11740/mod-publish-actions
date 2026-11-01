import { http, HttpResponse } from 'msw/http';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { recordRequests, stubInputs, useMockServer, VALID_UPLOAD_INPUTS } from '@mod-publish-actions/core/testing';

import { publishFile, readInputs, uploadFile } from './upload';
import type { CurseforgeUploadInputs } from './upload';

const API_URL = 'https://curseforge.test/api';
const UPLOAD_URL = `${API_URL}/projects/123456/upload-file`;
const TOKEN = 'secret-token';

const server = useMockServer();
const uploadedForms: FormData[] = [];

function createJar(): string {
  const file = join(mkdtempSync(join(tmpdir(), 'publish-file-')), 'mod-1.0.0+1.21.1-neoforge.jar');
  writeFileSync(file, 'jar contents');
  return file;
}

function createInputs(overrides: Partial<CurseforgeUploadInputs> = {}): CurseforgeUploadInputs {
  return {
    token: TOKEN,
    projectId: '123456',
    file: createJar(),
    gameVersions: ['1.21.1'],
    loaders: ['neoforge'],
    environment: 'client',
    javaVersions: [],
    releaseType: 'alpha',
    changelog: 'Fixed a crash',
    displayName: undefined,
    dependencies: [],
    ...overrides,
  };
}

function mockCurseforge(respond: () => Response = () => HttpResponse.json({ id: 20402 }), url = UPLOAD_URL): Request[] {
  uploadedForms.length = 0;
  const requests = recordRequests(server);
  server.use(
    http.post(url, async ({ request }) => {
      uploadedForms.push(await request.formData());
      return respond();
    }),
  );
  return requests;
}

function readUploadedForm(): FormData {
  const [form] = uploadedForms;
  if (form === undefined) {
    throw new Error('Nothing was uploaded');
  }
  return form;
}

function readUploadedMetadata(): unknown {
  const metadata = readUploadedForm().get('metadata');
  if (typeof metadata === 'string') {
    return JSON.parse(metadata);
  }
  throw new Error('The form has no metadata field');
}

describe('readInputs', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('adds the Java versions to the shared inputs', () => {
    stubInputs({ ...VALID_UPLOAD_INPUTS, 'java-versions': '21, 25' });

    expect(readInputs()).toMatchObject({ projectId: '123456', javaVersions: ['21', '25'] });
  });

  it('treats Java versions as optional', () => {
    stubInputs(VALID_UPLOAD_INPUTS);

    expect(readInputs().javaVersions).toEqual([]);
  });

  it('rejects a Java version that is not a plain number, naming the input', () => {
    stubInputs({ ...VALID_UPLOAD_INPUTS, 'java-versions': '21, Java 25' });

    expect(() => readInputs()).toThrow('java-versions must be plain numbers such as 21, got "Java 25"');
  });

  it('rejects a project ID that is not numeric', () => {
    stubInputs({ ...VALID_UPLOAD_INPUTS, 'project-id': 'blockpilot' });

    expect(() => readInputs()).toThrow('project-id must be a numeric CurseForge project ID');
  });
});

describe('publishFile', () => {
  it('returns the ID of the uploaded file', async () => {
    mockCurseforge();

    await expect(publishFile(createInputs(), API_URL)).resolves.toBe(20402);
  });

  it('posts to the upload endpoint with the token in the header, never in the URL', async () => {
    const requests = mockCurseforge();

    await publishFile(createInputs(), API_URL);

    expect(requests[0]?.method).toBe('POST');
    expect(requests[0]?.url).toBe(UPLOAD_URL);
    expect(requests[0]?.headers.get('x-api-token')).toBe(TOKEN);
  });

  it('translates the inputs into the metadata', async () => {
    mockCurseforge();

    await publishFile(createInputs(), API_URL);

    expect(readUploadedMetadata()).toEqual({
      changelog: 'Fixed a crash',
      changelogType: 'markdown',
      gameVersionNames: ['1.21.1', 'NeoForge', 'Client'],
      releaseType: 'alpha',
    });
  });

  it('sends the metadata field before the file, with the file under its own name', async () => {
    mockCurseforge();

    await publishFile(createInputs(), API_URL);

    const form = readUploadedForm();
    expect([...form.keys()]).toEqual(['metadata', 'file']);
    const file = form.get('file');
    expect(file).toBeInstanceOf(File);
    expect(file instanceof File && file.name).toBe('mod-1.0.0+1.21.1-neoforge.jar');
    expect(file instanceof File && (await file.text())).toBe('jar contents');
  });

  it('sends the display name when there is one', async () => {
    mockCurseforge();

    await publishFile(createInputs({ displayName: 'My Mod 1.0.0' }), API_URL);

    expect(readUploadedMetadata()).toMatchObject({ displayName: 'My Mod 1.0.0' });
  });

  it('lists every game version, loader, environment and Java version by name', async () => {
    mockCurseforge();

    await publishFile(
      createInputs({ gameVersions: ['1.21.1', '26.1.2'], loaders: ['fabric', 'quilt'], environment: 'both', javaVersions: ['21', '25'] }),
      API_URL,
    );

    expect(readUploadedMetadata()).toMatchObject({
      gameVersionNames: ['1.21.1', '26.1.2', 'Fabric', 'Quilt', 'Client', 'Server', 'Java 21', 'Java 25'],
    });
  });

  it.each([
    ['client', ['Client']],
    ['server', ['Server']],
    ['both', ['Client', 'Server']],
  ] as const)('translates the %s environment', async (environment, names) => {
    mockCurseforge();

    await publishFile(createInputs({ environment, loaders: [], gameVersions: [] }), API_URL);

    expect(readUploadedMetadata()).toMatchObject({ gameVersionNames: names });
  });

  it.each([
    ['neoforge', 'NeoForge'],
    ['NeoForge', 'NeoForge'],
    ['forge', 'Forge'],
    ['some-new-loader', 'some-new-loader'],
  ])('sends the %s loader as %s', async (loader, name) => {
    mockCurseforge();

    await publishFile(createInputs({ loaders: [loader] }), API_URL);

    expect(readUploadedMetadata()).toMatchObject({ gameVersionNames: ['1.21.1', name, 'Client'] });
  });

  it('translates every dependency type by slug', async () => {
    mockCurseforge();

    await publishFile(
      createInputs({
        dependencies: [
          { project: 'create', type: 'required' },
          { project: 'create-aeronautics', type: 'optional' },
          { project: 'mantle', type: 'embedded' },
          { project: 'optifine', type: 'incompatible' },
        ],
      }),
      API_URL,
    );

    expect(readUploadedMetadata()).toMatchObject({
      relations: {
        projects: [
          { slug: 'create', type: 'requiredDependency' },
          { slug: 'create-aeronautics', type: 'optionalDependency' },
          { slug: 'mantle', type: 'embeddedLibrary' },
          { slug: 'optifine', type: 'incompatible' },
        ],
      },
    });
  });

  it('leaves relations out when there are no dependencies', async () => {
    mockCurseforge();

    await publishFile(createInputs(), API_URL);

    expect(readUploadedMetadata()).not.toHaveProperty('relations');
  });

  it('sends nothing when the file pattern matches no file', async () => {
    const requests = mockCurseforge();

    await expect(publishFile(createInputs({ file: join(tmpdir(), 'no-such-folder-zzqq', '*.jar') }), API_URL)).rejects.toThrow(
      'matched none',
    );
    expect(requests).toEqual([]);
  });

  it('reports the status and body of a rejected upload, without the token even when the server repeats it', async () => {
    mockCurseforge(
      () => new HttpResponse(`{"errorCode":3,"errorMessage":"API token is malformed. Token provided: ${TOKEN}."}`, { status: 400 }),
    );

    const failure = await publishFile(createInputs(), API_URL).catch((error: unknown) => String(error));

    expect(failure).toContain(`POST ${UPLOAD_URL} failed with status 400`);
    expect(failure).toContain('Token provided: [redacted]');
    expect(failure).not.toContain(TOKEN);
  });

  it.each([
    ['is not JSON', 'Bad Gateway'],
    ['has no ID', '{"name":"mod.jar"}'],
    ['has an ID that is not a whole number', '{"id":"20402"}'],
  ])('rejects a successful response that %s', async (_description, body) => {
    mockCurseforge(() => new HttpResponse(body));

    await expect(publishFile(createInputs(), API_URL)).rejects.toThrow('returned an unexpected response');
  });
});

describe('uploadFile', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uploads to the Minecraft site and sets the file-id output', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'upload-file-'));
    const file = join(folder, 'mod.jar');
    const outputFile = join(folder, 'output');
    writeFileSync(file, 'jar contents');
    writeFileSync(outputFile, '');
    stubInputs({ ...VALID_UPLOAD_INPUTS, file });
    vi.stubEnv('GITHUB_OUTPUT', outputFile);
    const requests = mockCurseforge(undefined, 'https://minecraft.curseforge.com/api/projects/123456/upload-file');

    await uploadFile();

    expect(requests[0]?.url).toBe('https://minecraft.curseforge.com/api/projects/123456/upload-file');
    const output = readFileSync(outputFile, 'utf8');
    expect(output).toContain('file-id');
    expect(output).toContain('20402');
  });
});
