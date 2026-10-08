import { describe, expect, it } from 'vitest';
import {
	anchorSelector,
	captureVars,
	interpolate,
	matchesApi,
	matchesPath,
	missingVars,
	normalisePath,
	parseInline,
	readPath,
	unwrapEnvelope
} from '../logic';
import type { ApiEvent } from '$lib/services/api-events';
import type { ApiWait } from '../types';

const event = (overrides: Partial<ApiEvent> = {}): ApiEvent => ({
	method: 'POST',
	path: '/cases/12/assets',
	status: 201,
	ok: true,
	data: null,
	...overrides
});

describe('interpolate / missingVars', () => {
	it('replaces known variables and leaves unknown ones in place', () => {
		expect(interpolate('/case/{caseId}/assets/{assetId}', { caseId: 12 })).toBe(
			'/case/12/assets/{assetId}'
		);
	});

	it('lists the variables a template still needs', () => {
		expect(missingVars('/case/{caseId}/assets/{assetId}', { caseId: 12 })).toEqual(['assetId']);
		expect(missingVars('/war-rooms', {})).toEqual([]);
	});
});

describe('normalisePath', () => {
	it('drops query, hash and trailing slashes but keeps the root', () => {
		expect(normalisePath('/war-rooms/3/scope/?tab=vulnerabilities')).toBe('/war-rooms/3/scope');
		expect(normalisePath('/cases#top')).toBe('/cases');
		expect(normalisePath('/')).toBe('/');
	});
});

describe('matchesPath', () => {
	it('matches an interpolated template exactly', () => {
		expect(matchesPath('/case/{caseId}/assets', '/case/12/assets/', { caseId: 12 })).toBe(true);
		expect(matchesPath('/case/{caseId}/assets', '/case/13/assets', { caseId: 12 })).toBe(false);
		expect(matchesPath('/case/{caseId}/assets', '/case/12/assets/4', { caseId: 12 })).toBe(false);
	});

	it('never matches while a variable is missing', () => {
		expect(matchesPath('/case/{caseId}/assets', '/case/{caseId}/assets', {})).toBe(false);
	});

	it('accepts a regexp', () => {
		expect(matchesPath(/^\/case\/\d+$/, '/case/7?x=1', {})).toBe(true);
	});
});

describe('matchesApi', () => {
	const wait: ApiWait = { kind: 'api', method: 'POST', path: '/cases/{caseId}/assets' };

	it('matches a successful call with the same method and path', () => {
		expect(matchesApi(wait, event(), { caseId: 12 })).toBe(true);
	});

	it('ignores failed calls and other methods', () => {
		expect(matchesApi(wait, event({ ok: false, status: 400 }), { caseId: 12 })).toBe(false);
		expect(matchesApi(wait, event({ method: 'PUT' }), { caseId: 12 })).toBe(false);
	});
});

describe('unwrapEnvelope / readPath / captureVars', () => {
	it('unwraps `{ status, data }` envelopes and leaves bare bodies alone', () => {
		expect(unwrapEnvelope({ status: 'success', data: { case_id: 3 } })).toEqual({ case_id: 3 });
		expect(unwrapEnvelope({ case_id: 3, status: 'open' })).toEqual({ case_id: 3, status: 'open' });
		expect(unwrapEnvelope({ status: 'success', data: null })).toEqual({
			status: 'success',
			data: null
		});
	});

	it('reads dotted paths', () => {
		expect(readPath({ a: { b: { c: 4 } } }, 'a.b.c')).toBe(4);
		expect(readPath({ a: 1 }, 'a.b')).toBeUndefined();
	});

	it('captures string and number values only', () => {
		const wait: ApiWait = {
			kind: 'api',
			method: 'POST',
			path: '/cases',
			capture: { caseId: 'case_id', caseName: 'case_name', owner: 'owner', missing: 'nope' }
		};
		const body = { status: 'success', data: { case_id: 9, case_name: 'X', owner: { id: 1 } } };
		expect(captureVars(wait, body)).toEqual({ caseId: 9, caseName: 'X' });
	});

	it('captures nothing without a capture map', () => {
		expect(captureVars({ kind: 'api', method: 'POST', path: '/x' }, { id: 1 })).toEqual({});
	});
});

describe('anchorSelector', () => {
	it('turns a bare name into a data-tour selector', () => {
		expect(anchorSelector('vuln-new')).toBe('[data-tour="vuln-new"]');
	});

	it('passes CSS selectors through', () => {
		expect(anchorSelector('a[href="/war-rooms"]')).toBe('a[href="/war-rooms"]');
	});
});

describe('parseInline', () => {
	it('splits bold and code out of plain text', () => {
		expect(parseInline('Click **New** then type `vpn-gw-01`.')).toEqual([
			{ kind: 'text', text: 'Click ' },
			{ kind: 'strong', text: 'New' },
			{ kind: 'text', text: ' then type ' },
			{ kind: 'code', text: 'vpn-gw-01' },
			{ kind: 'text', text: '.' }
		]);
	});

	it('returns plain text untouched', () => {
		expect(parseInline('Nothing special')).toEqual([{ kind: 'text', text: 'Nothing special' }]);
	});
});
