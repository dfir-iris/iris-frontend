// Same-origin tunnel for the browser Sentry SDK. GlitchTip is hosted
// on a different origin than the SPA, so client-side `Sentry.init`
// POSTs envelopes here instead of directly to GlitchTip and this
// handler forwards them server-side. Avoids the browser's SOP/CORS
// block on the ingest endpoint without needing to touch the GlitchTip
// CORS config.
//
// Envelope wire format (Sentry SDK):
//   <json header with "dsn">\n<item header>\n<item payload>\n...
// We read the first line to extract the DSN, then forward the whole
// body verbatim to the DSN's ingest URL. The upstream host is pinned
// to the DSN embedded in runtime-config (which the backend controls),
// so this endpoint can't be turned into an open relay to arbitrary
// hosts.

import type { RequestHandler } from './$types';
import { env as privateEnv } from '$env/dynamic/private';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';

interface DsnParts {
	ingestUrl: string;
	host: string;
	publicKey: string;
}

function parseDsn(dsn: string): DsnParts | null {
	try {
		const u = new URL(dsn);
		// Sentry DSN: https://<publicKey>@<host>/<projectId>
		const projectId = u.pathname.replace(/^\//, '');
		const publicKey = u.username;
		if (!projectId || !publicKey) return null;
		return {
			ingestUrl: `${u.protocol}//${u.host}/api/${projectId}/envelope/`,
			host: u.host,
			publicKey
		};
	} catch {
		return null;
	}
}

function allowedHosts(): Set<string> | null {
	// If IRIS_UI_SENTRY_DSN is set, pin the tunnel to that DSN's host.
	// When unset (browser DSN comes from backend runtime-config only),
	// we skip the allowlist — the DSN is still operator-controlled.
	const dsn = privateEnv.IRIS_UI_SENTRY_DSN;
	if (!dsn) return null;
	const parsed = parseDsn(dsn);
	if (!parsed) return null;
	return new Set([parsed.host]);
}

// Escape hatch for GlitchTip installs whose TLS cert isn't trusted by
// Node (self-signed, private CA, or Traefik serving its default cert
// while Let's Encrypt provisioning is pending). Set
// IRIS_UI_ENVELOPE_INSECURE_TLS=1 to skip certificate verification for
// the tunnel forward. Off by default — flip on ONLY when you accept
// that a MITM could see/inject error report payloads (which may
// contain sensitive DFIR case content).
const insecureTls = privateEnv.IRIS_UI_ENVELOPE_INSECURE_TLS === '1';

interface UpstreamResponse {
	status: number;
	contentType: string;
	body: Buffer;
}

function forwardEnvelope(
	ingestUrl: string,
	publicKey: string,
	body: string
): Promise<UpstreamResponse> {
	return new Promise((resolve, reject) => {
		const url = new URL(ingestUrl);
		const isHttps = url.protocol === 'https:';
		const request = isHttps ? httpsRequest : httpRequest;
		// GlitchTip (and modern Sentry) reject envelopes with 403 Denied
		// when the request lacks the sentry auth. The DSN's publicKey
		// inside the envelope's JSON header is not enough — the ingest
		// endpoint expects `X-Sentry-Auth` on the HTTP request itself.
		// The browser SDK sends it directly to the ingest URL; when we
		// tunnel through this endpoint, the browser POSTs the raw
		// envelope to us and we must re-attach the header before
		// forwarding upstream.
		const sentryAuth =
			`Sentry sentry_version=7, ` +
			`sentry_client=iris-envelope-tunnel/1, ` +
			`sentry_key=${publicKey}`;
		const req = request(
			{
				method: 'POST',
				hostname: url.hostname,
				port: url.port || (isHttps ? 443 : 80),
				path: `${url.pathname}${url.search}`,
				headers: {
					'Content-Type': 'application/x-sentry-envelope',
					'Content-Length': Buffer.byteLength(body).toString(),
					'X-Sentry-Auth': sentryAuth
				},
				// Only takes effect on https requests; ignored on http.
				rejectUnauthorized: !insecureTls
			},
			(res) => {
				const chunks: Buffer[] = [];
				res.on('data', (chunk: Buffer) => chunks.push(chunk));
				res.on('end', () =>
					resolve({
						status: res.statusCode ?? 502,
						contentType: res.headers['content-type'] ?? 'application/json',
						body: Buffer.concat(chunks)
					})
				);
				res.on('error', reject);
			}
		);
		req.on('error', reject);
		req.write(body);
		req.end();
	});
}

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.text();
	const newline = body.indexOf('\n');
	if (newline === -1) return new Response('bad envelope', { status: 400 });

	let header: { dsn?: string };
	try {
		header = JSON.parse(body.slice(0, newline)) as { dsn?: string };
	} catch {
		return new Response('bad envelope header', { status: 400 });
	}
	if (!header.dsn) return new Response('missing dsn', { status: 400 });

	const parsed = parseDsn(header.dsn);
	if (!parsed) return new Response('bad dsn', { status: 400 });

	const allow = allowedHosts();
	if (allow && !allow.has(parsed.host)) {
		return new Response('dsn host not allowed', { status: 403 });
	}

	try {
		const upstream = await forwardEnvelope(parsed.ingestUrl, parsed.publicKey, body);
		return new Response(upstream.body, {
			status: upstream.status,
			headers: { 'Content-Type': upstream.contentType }
		});
	} catch (err) {
		return new Response(
			`upstream fetch failed: ${err instanceof Error ? err.message : String(err)}`,
			{ status: 502 }
		);
	}
};
