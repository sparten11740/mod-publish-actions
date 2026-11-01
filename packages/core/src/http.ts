import * as zod from 'zod/v4';

const USER_AGENT = 'sparten11740/mod-publish-actions';
const REQUEST_TIMEOUT_MILLISECONDS = 300_000;
const MAX_REPORTED_BODY_LENGTH = 500;

export type HttpRequest = {
  method: string;
  headers?: Record<string, string>;
  body?: RequestInit['body'];
};

export type HttpReply = {
  response: Response;
  text: string;
};

function describeFailure(error: unknown): string {
  const reason = error instanceof Error ? (error.cause ?? error) : error;
  const code = reason instanceof Object && 'code' in reason ? ` (${String(reason.code)})` : '';
  return `${String(reason)}${code}`;
}

function summarizeBody(text: string): string {
  return text.length > MAX_REPORTED_BODY_LENGTH ? `${text.slice(0, MAX_REPORTED_BODY_LENGTH)}...` : text;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export async function sendRequest(url: string, { method, headers, body }: HttpRequest): Promise<HttpReply> {
  try {
    const response = await fetch(url, {
      method,
      headers: { ...headers, 'User-Agent': USER_AGENT },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
    });
    return { response, text: await response.text() };
  } catch (error) {
    throw new Error(`${method} ${url} failed: ${describeFailure(error)}`, { cause: error });
  }
}

export function assertSuccess({ response, text }: HttpReply, url: string, method: string): void {
  if (!response.ok) {
    throw new Error(`${method} ${url} failed with status ${response.status}: ${summarizeBody(text)}`);
  }
}

export function parseReply<Output>(text: string, schema: zod.ZodType<Output>, url: string): Output {
  const result = schema.safeParse(parseJson(text));
  if (result.success) {
    return result.data;
  }
  const problems = zod.prettifyError(result.error).replaceAll('\n', ' ');
  throw new Error(`${url} returned an unexpected response (${problems}): ${summarizeBody(text)}`);
}
