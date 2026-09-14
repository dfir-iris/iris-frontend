/**
 * Tests for the Sentry `beforeSend` hook.
 *
 * Two jobs, and the second one is newer: redact anything case-sensitive out of
 * an outgoing event, and drop events that carry no information at all. The drop
 * rules exist because a tracker full of a developer's stale-chunk errors is a
 * tracker nobody reads — but the same rules, drawn one notch too wide, silence
 * real deployments. Most of what follows pins down the second kind of mistake.
 */
import { describe, expect, it } from 'vitest';
import type { ErrorEvent } from '@sentry/sveltekit';
import { beforeSend, shouldDropEvent } from '../before-send';

const hint = {} as never;

/** Minimal event shaped the way the browser SDK actually emits one. */
const makeEvent = (over: Partial<ErrorEvent> = {}): ErrorEvent =>
	({
		request: { url: 'https://iris.example.org/case/1/notes' },
		...over
	}) as ErrorEvent;

const withException = (value: string, filenames: string[] = [], url?: string): ErrorEvent =>
	makeEvent({
		...(url === undefined ? {} : { request: { url } }),
		exception: {
			values: [
				{
					type: 'TypeError',
					value,
					stacktrace: { frames: filenames.map((filename) => ({ filename })) }
				}
			]
		}
	});

describe('shouldDropEvent — developer machines', () => {
	it.each([
		'https://localhost/case/1',
		'https://127.0.0.1/(app)/case/1/evidence/2',
		'http://127.1.2.3:5173/alerts',
		'http://0.0.0.0:5173/',
		'https://iris.localhost/dashboards'
	])('drops %s', (url) => {
		expect(shouldDropEvent(makeEvent({ request: { url } }))).toBe(true);
	});

	it('keeps private-range hosts, which are real on-prem deployments', () => {
		// IRIS is frequently installed on an air-gapped or internal network.
		// Treating 10.x / 192.168.x as "somebody's laptop" would blind the
		// tracker to exactly the deployments least able to report a bug by hand.
		for (const url of ['https://10.4.0.9/case/1', 'https://192.168.1.20/alerts']) {
			expect(shouldDropEvent(makeEvent({ request: { url } }))).toBe(false);
		}
	});

	it('keeps an event whose URL is missing or unparseable', () => {
		// Fail open. An event we cannot attribute is not evidence that it came
		// from a dev box, and a false drop is invisible.
		expect(shouldDropEvent(makeEvent({ request: {} }))).toBe(false);
		expect(shouldDropEvent(makeEvent({ request: { url: 'not a url' } }))).toBe(false);
		expect(shouldDropEvent(makeEvent({ request: undefined }))).toBe(false);
	});
});

describe('shouldDropEvent — uninformative browser noise', () => {
	it('drops cross-origin errors the browser has already stripped', () => {
		// GlitchTip iris-saas-frontend#126. The sole frame is our own global
		// onerror handler: the browser withheld the file, line and stack, so
		// there is nothing left that could be acted on.
		expect(shouldDropEvent(withException('Permission denied to access property "apply"'))).toBe(
			true
		);
		expect(shouldDropEvent(makeEvent({ message: 'Script error.' }))).toBe(true);
	});

	it('drops the ResizeObserver layout quirk', () => {
		expect(
			shouldDropEvent(
				withException('ResizeObserver loop completed with undelivered notifications.')
			)
		).toBe(true);
	});

	it('drops an error raised entirely inside a browser extension', () => {
		expect(
			shouldDropEvent(
				withException('x is not a function', [
					'chrome-extension://abcdef/content.js',
					'moz-extension://abcdef/inject.js'
				])
			)
		).toBe(true);
	});

	it('keeps an error that merely passes through an extension frame', () => {
		// One extension frame on the stack does not make it the extension's
		// fault — our own frame is right there and is what needs fixing.
		expect(
			shouldDropEvent(
				withException('x is not a function', [
					'chrome-extension://abcdef/content.js',
					'https://iris.example.org/_app/immutable/nodes/19.js'
				])
			)
		).toBe(false);
	});

	it('does not match the noise patterns mid-message', () => {
		// Anchored on purpose: a real failure that happens to quote one of these
		// strings must still be reported.
		expect(shouldDropEvent(withException('Uncaught in promise: Script error.'))).toBe(false);
	});
});

describe('shouldDropEvent — what stays', () => {
	it('keeps a stale-chunk error from a real deployment', () => {
		// GlitchTip iris-saas-frontend#133. Same message as the two dozen
		// localhost ones, different meaning: a user held a tab open across a
		// deploy. A steady trickle would point at a rollout or caching problem,
		// so this is signal. Filtering on the message would have discarded it
		// along with the noise — which is why the dev filter keys on the host.
		expect(
			shouldDropEvent(
				withException(
					'error loading dynamically imported module: https://preview.dfir-iris.org/_app/immutable/nodes/19.DTHQmsTk.js',
					[],
					'https://preview.dfir-iris.org/alerts'
				)
			)
		).toBe(false);
	});

	it('keeps user-submitted bug reports', () => {
		// The bug-report dialog reports through the same pipe. Dropping
		// `level: info` events would silently delete the feature.
		expect(shouldDropEvent(makeEvent({ level: 'info', message: 'User bug report' }))).toBe(false);
	});

	it('keeps an ordinary application error', () => {
		expect(
			shouldDropEvent(
				withException("Cannot read properties of null (reading 'case_name')", [
					'https://iris.example.org/_app/immutable/nodes/12.js'
				])
			)
		).toBe(false);
	});
});

describe('beforeSend', () => {
	it('returns null for a dropped event', () => {
		expect(
			beforeSend(makeEvent({ request: { url: 'https://127.0.0.1/case/1' } }), hint)
		).toBeNull();
	});

	it('still redacts the events it keeps', () => {
		const event = makeEvent({
			request: {
				url: 'https://iris.example.org/search',
				headers: { Authorization: 'Bearer abc', 'Content-Type': 'application/json' },
				cookies: { iris_rt: 'secret' },
				query_string: '?q=hello&api_key=abc',
				data: { ioc_value: '8.8.8.8', page: 2 }
			}
		});

		const out = beforeSend(event, hint);

		expect(out).not.toBeNull();
		expect(out?.request?.headers).toEqual({
			Authorization: '[Filtered]',
			'Content-Type': 'application/json'
		});
		expect(out?.request?.cookies).toBeUndefined();
		// The leading `?` is preserved as it was given.
		expect(out?.request?.query_string).toBe('?q=hello&api_key=%5BFiltered%5D');
		expect(out?.request?.data).toEqual({ ioc_value: '[Filtered]', page: 2 });
	});

	it('does not redact a dropped event before discarding it', () => {
		// Ordering check, not a behaviour anyone observes: the drop has to come
		// first or every filtered event pays for a redaction pass.
		const request = { url: 'https://localhost/search', headers: { Authorization: 'Bearer abc' } };

		expect(beforeSend(makeEvent({ request }), hint)).toBeNull();
		expect(request.headers.Authorization).toBe('Bearer abc');
	});
});
