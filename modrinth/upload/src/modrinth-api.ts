const USER_AGENT = 'sparten11740/mod-publish-actions';
const REQUEST_TIMEOUT_MILLISECONDS = 300_000;
const MAX_REPORTED_BODY_LENGTH = 500;
const NOT_FOUND = 404;
const TOO_MANY_REQUESTS = 429;
const PUBLIC_REQUEST: RequestInit = { method: 'GET', headers: { 'User-Agent': USER_AGENT } };

type Reply = {
  response: Response;
  text: string;
};

function summarizeBody(text: string): string {
  return text.length > MAX_REPORTED_BODY_LENGTH ? `${text.slice(0, MAX_REPORTED_BODY_LENGTH)}...` : text;
}

function describeFailure(error: unknown): string {
  const reason = error instanceof Error ? (error.cause ?? error) : error;
  const code = reason instanceof Object && 'code' in reason ? ` (${String(reason.code)})` : '';
  return `${String(reason)}${code}`;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function parseId(text: string, url: string): string {
  const parsed = parseJson(text);
  if (parsed instanceof Object && 'id' in parsed && typeof parsed.id === 'string') {
    return parsed.id;
  }
  throw new Error(`${url} returned a response without an ID: ${summarizeBody(text)}`);
}

async function send(url: string, init: RequestInit): Promise<Reply> {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS) });
    return { response, text: await response.text() };
  } catch (error) {
    throw new Error(`${init.method} ${url} failed: ${describeFailure(error)}`, { cause: error });
  }
}

function readId({ response, text }: Reply, url: string, init: RequestInit): string {
  if (response.status === TOO_MANY_REQUESTS) {
    throw new Error(`${init.method} ${url} was rate limited, try again in ${response.headers.get('X-Ratelimit-Reset') ?? 'a few'} seconds`);
  }
  if (!response.ok) {
    throw new Error(`${init.method} ${url} failed with status ${response.status}: ${summarizeBody(text)}`);
  }
  return parseId(text, url);
}

export async function getProjectId(apiUrl: string, project: string): Promise<string> {
  const url = `${apiUrl}/project/${encodeURIComponent(project)}`;
  return readId(await send(url, PUBLIC_REQUEST), url, PUBLIC_REQUEST);
}

export async function findVersionId(apiUrl: string, projectId: string, versionNumber: string): Promise<string | undefined> {
  const url = `${apiUrl}/project/${encodeURIComponent(projectId)}/version/${encodeURIComponent(versionNumber)}`;
  const reply = await send(url, PUBLIC_REQUEST);
  return reply.response.status === NOT_FOUND ? undefined : readId(reply, url, PUBLIC_REQUEST);
}

export async function postVersion(apiUrl: string, token: string, form: FormData): Promise<string> {
  const url = `${apiUrl}/version`;
  const init: RequestInit = {
    method: 'POST',
    headers: { Authorization: token, 'User-Agent': USER_AGENT },
    body: form,
  };
  return readId(await send(url, init), url, init);
}
