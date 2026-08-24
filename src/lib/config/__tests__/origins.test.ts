import { describe, expect, it } from 'vitest';
import { forwardedOrigin, isServedOrigin, normaliseOrigin, parseAllowedOrigins } from '../origins';

describe('normaliseOrigin', () => {
	it('reduces a full URL to scheme + host', () => {
		expect(normaliseOrigin('https://iris.acme.corp/app/cases?x=1')).toBe('https://iris.acme.corp');
	});

	it('keeps a non-default port', () => {
		expect(normaliseOrigin('https://iris.acme.corp:8443')).toBe('https://iris.acme.corp:8443');
	});

	it('drops the default port for the scheme', () => {
		expect(normaliseOrigin('https://iris.acme.corp:443')).toBe('https://iris.acme.corp');
	});

	it('lowercases scheme and host', () => {
		expect(normaliseOrigin('HTTPS://Iris.Acme.Corp')).toBe('https://iris.acme.corp');
	});

	it('rejects a bare hostname — the scheme cannot be guessed safely', () => {
		expect(normaliseOrigin('iris.acme.corp')).toBeNull();
	});

	it('rejects the wildcard, empty and nullish values', () => {
		expect(normaliseOrigin('*')).toBeNull();
		expect(normaliseOrigin('   ')).toBeNull();
		expect(normaliseOrigin(undefined)).toBeNull();
		expect(normaliseOrigin(null)).toBeNull();
	});
});

describe('parseAllowedOrigins', () => {
	it('splits on commas and whitespace and preserves order', () => {
		expect(
			parseAllowedOrigins(
				'https://slug.cloud.seito.io, https://iris.acme.corp\nhttps://soc.acme.corp'
			)
		).toEqual(['https://slug.cloud.seito.io', 'https://iris.acme.corp', 'https://soc.acme.corp']);
	});

	it('collapses duplicates, including ones that differ only in case or path', () => {
		expect(parseAllowedOrigins('https://a.example, https://A.example/, https://a.example')).toEqual(
			['https://a.example']
		);
	});

	it('yields an empty list for unset — the same-origin rule stands alone', () => {
		expect(parseAllowedOrigins(undefined)).toEqual([]);
		expect(parseAllowedOrigins('')).toEqual([]);
	});

	it('does not honour the wildcard: it would switch the CSRF guard off', () => {
		expect(parseAllowedOrigins('*')).toEqual([]);
		expect(parseAllowedOrigins('*, https://iris.acme.corp')).toEqual(['https://iris.acme.corp']);
	});

	it('skips entries that are not usable origins', () => {
		expect(parseAllowedOrigins('iris.acme.corp, https://ok.example, ::::')).toEqual([
			'https://ok.example'
		]);
	});
});

describe('forwardedOrigin', () => {
	const headers = (init: Record<string, string>) => new Headers(init);

	it('builds the origin from x-forwarded-host and -proto', () => {
		expect(
			forwardedOrigin(
				headers({ 'x-forwarded-host': 'iris.acme.corp', 'x-forwarded-proto': 'https' })
			)
		).toBe('https://iris.acme.corp');
	});

	it('takes only the first entry of a proxy chain', () => {
		expect(
			forwardedOrigin(
				headers({
					'x-forwarded-host': 'iris.acme.corp, internal.lb',
					'x-forwarded-proto': 'https, http'
				})
			)
		).toBe('https://iris.acme.corp');
	});

	it('keeps a non-default port the browser used', () => {
		expect(forwardedOrigin(headers({ 'x-forwarded-host': 'iris.acme.corp:8443' }))).toBe(
			'https://iris.acme.corp:8443'
		);
	});

	it('defaults to https — the inbound hop is plaintext inside the compose network', () => {
		expect(forwardedOrigin(headers({ 'x-forwarded-host': 'iris.acme.corp' }))).toBe(
			'https://iris.acme.corp'
		);
	});

	it('returns null without x-forwarded-host (vite dev, direct container hit)', () => {
		expect(forwardedOrigin(headers({}))).toBeNull();
		expect(forwardedOrigin(headers({ 'x-forwarded-host': '  ' }))).toBeNull();
	});
});

describe('isServedOrigin', () => {
	const allowed = ['https://slug.cloud.seito.io', 'https://iris.acme.corp'];

	it('accepts a configured hostname', () => {
		expect(isServedOrigin('https://iris.acme.corp', allowed)).toBe(true);
	});

	it('accepts it regardless of trailing slash or case', () => {
		expect(isServedOrigin('https://IRIS.acme.corp/', allowed)).toBe(true);
	});

	it('rejects an unlisted hostname', () => {
		expect(isServedOrigin('https://evil.example', allowed)).toBe(false);
	});

	it('rejects a subdomain of a configured hostname — matching is exact', () => {
		expect(isServedOrigin('https://sub.iris.acme.corp', allowed)).toBe(false);
	});

	it('rejects the plaintext variant of a configured https origin', () => {
		expect(isServedOrigin('http://iris.acme.corp', allowed)).toBe(false);
	});

	it('rejects everything when nothing is configured', () => {
		expect(isServedOrigin('https://iris.acme.corp', [])).toBe(false);
	});
});
