import { http, HttpResponse } from 'msw/http';
import { passthrough } from 'msw/utils/passthrough';
import { createServer } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as zod from 'zod/v4';

import { assertSuccess, parseReply, sendRequest } from './http';
import { recordRequests, useMockServer } from './testing';

const URL_UNDER_TEST = 'https://api.test/thing';
const ID_SCHEMA = zod.object({ id: zod.string() });

const server = useMockServer();

async function findClosedPortUrl(): Promise<string> {
  const listener = createServer();
  await new Promise<void>((resolve) => {
    listener.listen(0, '127.0.0.1', resolve);
  });
  const address = listener.address();
  await new Promise((resolve) => {
    listener.close(resolve);
  });
  if (address instanceof Object) {
    return `http://127.0.0.1:${address.port}/thing`;
  }
  throw new Error('The listener has no port');
}

describe('sendRequest', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the method, headers, body and a User-Agent', async () => {
    const requests = recordRequests(server);
    server.use(http.post(URL_UNDER_TEST, () => new HttpResponse('ok')));

    const { text } = await sendRequest(URL_UNDER_TEST, { method: 'POST', headers: { Authorization: 'token' }, body: 'data' });

    expect(text).toBe('ok');
    expect(requests[0]?.method).toBe('POST');
    expect(requests[0]?.headers.get('authorization')).toBe('token');
    expect(requests[0]?.headers.get('user-agent')).toBe('sparten11740/mod-publish-actions');
    await expect(requests[0]?.text()).resolves.toBe('data');
  });

  it.each(['Authorization', 'X-Api-Token'])('removes a token sent as %s from the reply, because servers can echo it', async (header) => {
    server.use(
      http.post(URL_UNDER_TEST, () => new HttpResponse('{"error":"Token provided: secret-token, again secret-token"}', { status: 400 })),
    );

    const { text } = await sendRequest(URL_UNDER_TEST, { method: 'POST', headers: { [header]: 'secret-token' } });

    expect(text).toBe('{"error":"Token provided: [redacted], again [redacted]"}');
  });

  it('removes a token from a successful reply too, because unexpected replies get printed', async () => {
    server.use(http.get(URL_UNDER_TEST, () => new HttpResponse('Welcome, secret-token')));

    const { text } = await sendRequest(URL_UNDER_TEST, { method: 'GET', headers: { Authorization: 'secret-token' } });

    expect(text).toBe('Welcome, [redacted]');
  });

  it('leaves the values of other headers in the reply', async () => {
    server.use(http.post(URL_UNDER_TEST, () => new HttpResponse('expected image/png')));

    const { text } = await sendRequest(URL_UNDER_TEST, { method: 'POST', headers: { 'Content-Type': 'image/png' } });

    expect(text).toBe('expected image/png');
  });

  it('does not follow a redirect, so a token cannot reach another host', async () => {
    const requests = recordRequests(server);
    server.use(
      http.post(URL_UNDER_TEST, () => new HttpResponse(undefined, { status: 302, headers: { Location: 'https://other.test/landing' } })),
    );

    const reply = await sendRequest(URL_UNDER_TEST, { method: 'POST', headers: { 'X-Api-Token': 'token' } });

    expect(reply.response.status).toBe(302);
    expect(requests.map(({ url }) => url)).toEqual([URL_UNDER_TEST]);
    expect(() => assertSuccess(reply, URL_UNDER_TEST, 'POST')).toThrow(`POST ${URL_UNDER_TEST} failed with status 302`);
  });

  it('sets a timeout on every request', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    server.use(http.get(URL_UNDER_TEST, () => new HttpResponse('ok')));

    await sendRequest(URL_UNDER_TEST, { method: 'GET' });

    expect(timeout).toHaveBeenCalledWith(300_000);
  });

  it('names the request when the response cannot be read', async () => {
    server.use(
      http.post(
        URL_UNDER_TEST,
        () =>
          new HttpResponse(
            new ReadableStream({
              start(controller) {
                controller.error(new Error('terminated'));
              },
            }),
          ),
      ),
    );

    await expect(sendRequest(URL_UNDER_TEST, { method: 'POST' })).rejects.toThrow(`POST ${URL_UNDER_TEST} failed:`);
  });

  it('names the request when the network fails', async () => {
    server.use(http.get(URL_UNDER_TEST, () => HttpResponse.error()));

    await expect(sendRequest(URL_UNDER_TEST, { method: 'GET' })).rejects.toThrow(`GET ${URL_UNDER_TEST} failed:`);
  });

  it('does not report the numeric code of a timeout as an error code', async () => {
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(AbortSignal.abort(new DOMException('The operation timed out', 'TimeoutError')));
    server.use(http.get(URL_UNDER_TEST, () => new HttpResponse('ok')));

    const failure = await sendRequest(URL_UNDER_TEST, { method: 'GET' }).catch((error: unknown) => String(error));

    expect(failure).toContain('TimeoutError');
    expect(failure).not.toMatch(/\(\d+\)/);
  });

  it('keeps the error code of a real connection failure', async () => {
    const url = await findClosedPortUrl();
    server.use(http.get(url, () => passthrough()));

    await expect(sendRequest(url, { method: 'GET' })).rejects.toThrow('ECONNREFUSED');
  });
});

describe('assertSuccess', () => {
  it('accepts a successful reply', () => {
    expect(() => assertSuccess({ response: new Response('', { status: 200 }), text: '' }, URL_UNDER_TEST, 'GET')).not.toThrow();
  });

  it('reports the request, status and body of a failed reply', () => {
    expect(() => assertSuccess({ response: new Response('', { status: 401 }), text: 'Bad token' }, URL_UNDER_TEST, 'POST')).toThrow(
      `POST ${URL_UNDER_TEST} failed with status 401: Bad token`,
    );
  });

  it('shortens a long error page', () => {
    const reply = { response: new Response('', { status: 524 }), text: `<!doctype html>${'x'.repeat(5000)}` };

    expect(() => assertSuccess(reply, URL_UNDER_TEST, 'POST')).toThrow(/status 524: <!doctype html>x+\.\.\.$/);
    expect(() => assertSuccess(reply, URL_UNDER_TEST, 'POST')).not.toThrow('x'.repeat(600));
  });
});

describe('parseReply', () => {
  it('returns the parsed data, typed by the schema', () => {
    expect(parseReply('{"id":"abc","extra":1}', ID_SCHEMA, URL_UNDER_TEST)).toEqual({ id: 'abc' });
  });

  it.each([
    ['is not JSON', 'Bad Gateway'],
    ['lacks a required field', '{"name":"1.0.0"}'],
    ['has a field of the wrong type', '{"id":1}'],
  ])('rejects a reply that %s, naming the URL and the body', (_description, body) => {
    expect(() => parseReply(body, ID_SCHEMA, URL_UNDER_TEST)).toThrow(`${URL_UNDER_TEST} returned an unexpected response`);
    expect(() => parseReply(body, ID_SCHEMA, URL_UNDER_TEST)).toThrow(body);
  });

  it('says which field was wrong', () => {
    expect(() => parseReply('{"id":1}', ID_SCHEMA, URL_UNDER_TEST)).toThrow('at id');
  });
});
