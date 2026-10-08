/**
 * Size cap for the unauthenticated AI workflow inbound endpoints
 * (`/api/v2/ai-workflows/hooks/<uuid>`, `/api/v2/ai-workflows/callbacks/<uuid>`).
 *
 * Anyone on the network can POST there, and the proxy in hooks.server.ts
 * buffers request bodies in full before forwarding them. Without a cap a
 * single caller could make the SvelteKit process hold an arbitrarily large
 * body in memory before the backend ever sees (and rejects) it. The
 * backend enforces its own limit too; this is the cheap first line.
 */

/** 1 MiB. */
export const INBOUND_BODY_LIMIT = 1024 * 1024;

const CAPPED_PREFIXES = ['/api/v2/ai-workflows/hooks/', '/api/v2/ai-workflows/callbacks/'];

/**
 * Pathname as the backend router will see it: percent-decoded (Flask
 * decodes `%68ooks` to `hooks`) and with repeated slashes collapsed, so
 * neither trick slips a request past the prefix check.
 */
function normalisePath(pathname: string): string {
	let decoded = pathname;
	try {
		decoded = decodeURIComponent(pathname);
	} catch {
		// Malformed escapes: match on the raw path.
	}
	return decoded.replace(/\/{2,}/g, '/');
}

export function isInboundCappedPath(pathname: string): boolean {
	const path = normalisePath(pathname);
	return CAPPED_PREFIXES.some((p) => path.startsWith(p));
}

/** True when the request declares a `content-length` above `limit`. */
export function declaresOversizeBody(headers: Headers, limit = INBOUND_BODY_LIMIT): boolean {
	const raw = headers.get('content-length');
	if (raw === null) return false;
	const trimmed = raw.trim();
	if (!/^\d+$/.test(trimmed)) return false;
	return Number(trimmed) > limit;
}

/**
 * Reads the request body, stopping as soon as more than `limit` bytes
 * have arrived. Returns the bytes, or `null` when the body is too large
 * (the rest of the stream is cancelled, never buffered).
 */
export async function readBodyCapped(
	request: Request,
	limit = INBOUND_BODY_LIMIT
): Promise<ArrayBuffer | null> {
	if (!request.body) return new ArrayBuffer(0);
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (!value) continue;
		total += value.byteLength;
		if (total > limit) {
			await reader.cancel().catch(() => undefined);
			return null;
		}
		chunks.push(value);
	}
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return out.buffer;
}

export function payloadTooLargeResponse(): Response {
	return new Response(JSON.stringify({ message: 'Payload too large' }), {
		status: 413,
		headers: { 'Content-Type': 'application/json' }
	});
}
