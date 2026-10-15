// Phase 01 (P01-T05) SSE byte builders for stream parser tests.
// Feed split UTF-8 characters, SSE boundaries, CRLF and malformed data
// through a constructed ReadableStream with no network or browser package.

export function encodeSSE(events: Array<Record<string, unknown>>): string {
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
}

export function toByteStream(chunks: Array<string | Uint8Array>): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = chunks.map((c) => (typeof c === 'string' ? enc.encode(c) : c));
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const p of parts) controller.enqueue(p);
      controller.close();
    },
  });
}

/** Split a payload into byte chunks at the given offsets (may cut UTF-8/CRLF/SSE boundaries). */
export function splitBytes(payload: string, at: number[]): Uint8Array[] {
  const bytes = new TextEncoder().encode(payload);
  const cuts = [0, ...at.filter((n) => n > 0 && n < bytes.length), bytes.length];
  const out: Uint8Array[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) out.push(bytes.slice(cuts[i], cuts[i + 1]));
  return out;
}

export function mockFetchStream(stream: ReadableStream<Uint8Array>, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    // Minimal Response surface used by api.streamTurn.
    body: stream,
    json: async () => ({ detail: 'error' }),
  } as unknown as Response;
}
