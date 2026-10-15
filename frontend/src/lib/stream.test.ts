// P01-TEST08: frontend handles a constructed ReadableStream in the
// selected test runtime; no network/browser automation package needed.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { api } from '@/lib/api';
import { encodeSSE, mockFetchStream, splitBytes, toByteStream } from '@/test/sse';

const URL = 'http://localhost:8000/api/meetings/m1/turn/stream';

afterEach(() => {
  vi.unstubAllGlobals();
});

async function collect(url = URL): Promise<Array<Record<string, unknown>>> {
  const events: Array<Record<string, unknown>> = [];
  for await (const e of api.streamTurn('m1', 'p1')) events.push(e as unknown as Record<string, unknown>);
  expect(fetch).toHaveBeenCalledWith(
    url,
    expect.objectContaining({ method: 'POST' }),
  );
  return events;
}

describe('P01-TEST08 stream parser', () => {
  it('reassembles events split across byte chunks incl. multi-byte UTF-8 and CRLF', async () => {
    const payload =
      encodeSSE([
        { type: 'text', content: 'héllo wörld ✓' },
        { type: 'thinking', content: 'line1' },
      ]).replaceAll('\n', '\r\n');
    const bytes = new TextEncoder().encode(payload);
    // Cut inside the multi-byte 'é' (bytes 9-10 of 'héllo') and inside '\r\n'.
    const chunks = [bytes.slice(0, 9), bytes.slice(9, 11), bytes.slice(11)];
    vi.stubGlobal('fetch', vi.fn(async () => mockFetchStream(toByteStream(chunks))));

    const events = await collect();
    expect(events.map((e) => e['type'])).toEqual(['text', 'thinking']);
    expect(events[0]['content']).toBe('héllo wörld ✓');
  });

  it('skips malformed JSON and keeps parsing; EOF without terminal just ends', async () => {
    const raw = `data: {"type":"text","content":"ok"}\n\ndata: {broken\n\ndata: {"type":"done"}\n\n`;
    const chunks = splitBytes(raw, [10, 25]);
    vi.stubGlobal('fetch', vi.fn(async () => mockFetchStream(toByteStream(chunks))));

    const events = await collect();
    expect(events.map((e) => e['type'])).toEqual(['text', 'done']);
  });

  it('throws a useful error when the response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ detail: 'boom' }) }) as Response),
    );
    await expect((async () => {
      for await (const _ of api.streamTurn('m1', 'p1')) void _;
    })()).rejects.toThrow('boom');
  });
});
