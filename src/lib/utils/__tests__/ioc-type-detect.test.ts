import { describe, it, expect } from 'vitest';
import { detectIocType, detectIocTypeCandidates } from '../ioc-type-detect';

const types = [
	'ip-dst',
	'ip-src',
	'ip-dst|port',
	'domain',
	'hostname',
	'url',
	'email',
	'md5',
	'sha1',
	'sha256',
	'sha512',
	'mac-address',
	'vulnerability',
	'regkey',
	'btc',
	'AS'
].map((type_name, i) => ({ type_id: i + 1, type_name }));

const detected = (value: string) => detectIocType(value, types)?.type_name ?? null;

describe('detectIocTypeCandidates', () => {
	it.each([
		['8.8.8.8', 'ip-any'],
		['2001:db8::1', 'ip-any'],
		['10.0.0.1:443', 'ip-dst|port'],
		['https://evil.example/payload.exe', 'url'],
		['bob@evil.example', 'email'],
		['00:1A:2b:3c:4D:5e', 'mac-address'],
		['CVE-2024-3400', 'vulnerability'],
		['HKLM\\Software\\Run', 'regkey'],
		['d41d8cd98f00b204e9800998ecf8427e', 'md5'],
		['da39a3ee5e6b4b0d3255bfef95601890afd80709', 'sha1'],
		['e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'sha256'],
		['bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', 'btc'],
		['AS13335', 'AS'],
		['evil.example.com', 'domain']
	])('%s → %s first', (value, first) => {
		expect(detectIocTypeCandidates(value)[0]).toBe(first);
	});

	it.each(['', '   ', 'not an ioc', 'hello', '999.1.1.1', 'abc123'])(
		'%j is not recognised',
		(value) => {
			expect(detectIocTypeCandidates(value)).toEqual([]);
		}
	);

	it('ignores surrounding whitespace', () => {
		expect(detectIocTypeCandidates('  8.8.4.4 \n')[0]).toBe('ip-any');
	});
});

describe('detectIocType', () => {
	it('falls back to the next candidate the instance has', () => {
		// No ip-any on this instance.
		expect(detected('8.8.8.8')).toBe('ip-dst');
	});

	it('matches type names case-insensitively', () => {
		expect(detected('as64500')).toBe('AS');
	});

	it('returns null when no candidate exists on the instance', () => {
		expect(detectIocType('8.8.8.8', [{ type_id: 1, type_name: 'md5' }])).toBeNull();
		expect(detected('free text')).toBeNull();
	});
});
