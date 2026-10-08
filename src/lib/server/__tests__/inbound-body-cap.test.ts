import { describe, expect, it } from 'vitest';
import {
	declaresOversizeBody,
	INBOUND_BODY_LIMIT,
	isInboundCappedPath,
	readBodyCapped
} from '../inbound-body-cap';

const streamOf = (chunks: Uint8Array[]) =>
	new ReadableStream<Uint8Array>({
		start(controller) {
			for (const c of chunks) controller.enqueue(c);
			controller.close();
		}
	});

const postStream = (chunks: Uint8Array[]) =>
	new Request('https://iris.local/api/v2/ai-workflows/hooks/x', {
		method: 'POST',
		body: streamOf(chunks),
		duplex: 'half'
	} as RequestInit);

describe('isInboundCappedPath', () => {
	it('matches the hooks and callbacks endpoints', () => {
		expect(isInboundCappedPath('/api/v2/ai-workflows/hooks/abc')).toBe(true);
		expect(isInboundCappedPath('/api/v2/ai-workflows/callbacks/abc')).toBe(true);
	});

	it('sees through percent-encoding and repeated slashes', () => {
		expect(isInboundCappedPath('/api/v2/ai-workflows/%68ooks/abc')).toBe(true);
		expect(isInboundCappedPath('/api/v2//ai-workflows///callbacks/abc')).toBe(true);
	});

	it('leaves other API paths alone', () => {
		expect(isInboundCappedPath('/api/v2/ai-workflows')).toBe(false);
		expect(isInboundCappedPath('/api/v2/ai-workflows/12/inbound-token')).toBe(false);
		expect(isInboundCappedPath('/api/v2/datastore/file/add')).toBe(false);
		expect(isInboundCappedPath('/api/v2/ai-workflows/hooks')).toBe(false);
	});
});

describe('declaresOversizeBody', () => {
	it('flags a content-length above the limit only', () => {
		expect(declaresOversizeBody(new Headers({ 'content-length': '1048577' }))).toBe(true);
		expect(declaresOversizeBody(new Headers({ 'content-length': '1048576' }))).toBe(false);
		expect(declaresOversizeBody(new Headers({ 'content-length': '10' }))).toBe(false);
		expect(declaresOversizeBody(new Headers())).toBe(false);
		expect(declaresOversizeBody(new Headers({ 'content-length': 'abc' }))).toBe(false);
	});
});

describe('readBodyCapped', () => {
	it('returns the full body when within the limit', async () => {
		const buf = await readBodyCapped(postStream([new Uint8Array([1, 2]), new Uint8Array([3])]), 3);
		expect(buf).not.toBeNull();
		expect(Array.from(new Uint8Array(buf!))).toEqual([1, 2, 3]);
	});

	it('returns null as soon as the limit is passed', async () => {
		let pulled = 0;
		const stream = new ReadableStream<Uint8Array>({
			pull(controller) {
				pulled += 1;
				controller.enqueue(new Uint8Array(1024));
			}
		});
		const request = new Request('https://iris.local/x', {
			method: 'POST',
			body: stream,
			duplex: 'half'
		} as RequestInit);
		expect(await readBodyCapped(request, 4096)).toBeNull();
		// Stopped right after the chunk that crossed the limit.
		expect(pulled).toBeLessThan(10);
	});

	it('defaults to 1 MiB', async () => {
		const exact = await readBodyCapped(postStream([new Uint8Array(INBOUND_BODY_LIMIT)]));
		expect(exact?.byteLength).toBe(INBOUND_BODY_LIMIT);
		const over = await readBodyCapped(postStream([new Uint8Array(INBOUND_BODY_LIMIT + 1)]));
		expect(over).toBeNull();
	});

	it('handles a request without a body', async () => {
		const buf = await readBodyCapped(new Request('https://iris.local/x', { method: 'POST' }));
		expect(buf?.byteLength).toBe(0);
	});
});
