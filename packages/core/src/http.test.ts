import { afterEach, describe, expect, it, vi } from 'vitest';
import * as zod from 'zod/v4';

import { assertSuccess, parseReply, sendRequest } from './http';

const URL_UNDER_TEST = 'https://api.test/thing';
const ID_SCHEMA = zod.object({ id: zod.string() });

describe('sendRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the method, headers, body, a User-Agent and a timeout', async () => {
    const fetchStub = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => new Response('ok'));
    vi.stubGlobal('fetch', fetchStub);

    const { text } = await sendRequest(URL_UNDER_TEST, { method: 'POST', headers: { Authorization: 'token' }, body: 'data' });

    expect(text).toBe('ok');
    const init = fetchStub.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('data');
    expect(init?.headers).toEqual({ Authorization: 'token', 'User-Agent': 'sparten11740/mod-publish-actions' });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('names the request when the response cannot be read', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error('terminated'));
            },
          }),
        ),
    );

    await expect(sendRequest(URL_UNDER_TEST, { method: 'POST' })).rejects.toThrow(`POST ${URL_UNDER_TEST} failed: Error: terminated`);
  });

  it('names the request when the network fails', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND') });
    });

    await expect(sendRequest(URL_UNDER_TEST, { method: 'GET' })).rejects.toThrow(
      `GET ${URL_UNDER_TEST} failed: Error: getaddrinfo ENOTFOUND`,
    );
  });

  it('keeps the error code when a network failure has no message of its own', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed', { cause: Object.assign(new AggregateError([]), { code: 'ECONNREFUSED' }) });
    });

    await expect(sendRequest(URL_UNDER_TEST, { method: 'GET' })).rejects.toThrow('ECONNREFUSED');
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
