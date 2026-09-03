import { describe, it, expect } from 'vitest';
import { buildAlertPivotHref } from '../alert-pivot';

const CLUSTER = 'https://iris.local/alert-clusters/7';

describe('buildAlertPivotHref', () => {
	// The reported bug: "Pivot alerts by IOC/Asset" sent the IOC/asset primary
	// key, but the alerts list matches `alert_iocs` / `alert_assets` against
	// `Ioc.ioc_value` / `CaseAssets.asset_name`. `ioc_value IN ('42')` matches
	// nothing, so the pivot always landed on an empty list.
	describe('pivots on the value, never on an id', () => {
		it('filters IOCs by their value', () => {
			expect(buildAlertPivotHref('ioc', '8.8.8.8', CLUSTER)).toBe('/alerts/?alert_iocs=8.8.8.8');
		});

		it('filters assets by their name', () => {
			expect(buildAlertPivotHref('asset', 'WIN-DC01', CLUSTER)).toBe(
				'/alerts/?alert_assets=WIN-DC01'
			);
		});

		it('does not emit anything id-shaped for a numeric-looking label', () => {
			// A label that happens to look like a key must still be passed through
			// as the value it is — the guard here is that nothing upstream is
			// re-deriving the param from `node.id`.
			const href = buildAlertPivotHref('ioc', '8.8.8.8', CLUSTER);
			expect(href).not.toMatch(/alert_iocs=\d+$/);
		});
	});

	// The sibling defect in the alert-detail related graph: its node ids embed
	// the value (`ioc_<ioc_value>`), and the caller split them on the first
	// underscore — so any value containing one was truncated. Sourcing the label
	// keeps it whole.
	describe('keeps values containing underscores intact', () => {
		it('does not truncate an IOC value at its first underscore', () => {
			expect(buildAlertPivotHref('ioc', 'evil_domain.com', CLUSTER)).toBe(
				'/alerts/?alert_iocs=evil_domain.com'
			);
		});

		it('does not truncate an asset name at its first underscore', () => {
			expect(buildAlertPivotHref('asset', 'WIN_DC_01', CLUSTER)).toBe(
				'/alerts/?alert_assets=WIN_DC_01'
			);
		});
	});

	describe('encoding', () => {
		it('percent-encodes a value with spaces and reserved characters exactly once', () => {
			const href = buildAlertPivotHref('asset', 'DESKTOP 01 & 02', CLUSTER);

			expect(href).toBe('/alerts/?alert_assets=DESKTOP+01+%26+02');
			// Round-trips back to the original: a double-encode would decode to
			// `DESKTOP+01+%26+02` instead.
			expect(new URL(href!, CLUSTER).searchParams.get('alert_assets')).toBe('DESKTOP 01 & 02');
		});

		it('round-trips a URL-shaped IOC value', () => {
			const value = 'http://evil.example/a?b=c';
			const href = buildAlertPivotHref('ioc', value, CLUSTER);

			expect(new URL(href!, CLUSTER).searchParams.get('alert_iocs')).toBe(value);
		});
	});

	describe('starting point', () => {
		it('drops the originating page filters when pivoting from outside the alerts list', () => {
			const href = buildAlertPivotHref('ioc', '8.8.8.8', `${CLUSTER}?tab=correlation&page=3`);

			expect(href).toBe('/alerts/?alert_iocs=8.8.8.8');
		});

		it('keeps the other filters when pivoting from within the alerts list', () => {
			const href = buildAlertPivotHref(
				'asset',
				'WIN-DC01',
				'https://iris.local/alerts?alert_status_id=3'
			);

			const params = new URL(href!, CLUSTER).searchParams;
			expect(params.get('alert_status_id')).toBe('3');
			expect(params.get('alert_assets')).toBe('WIN-DC01');
		});

		it('replaces a pivot term already in the URL rather than appending a second one', () => {
			const href = buildAlertPivotHref('ioc', '1.1.1.1', 'https://iris.local/alerts?alert_iocs=8.8.8.8');

			const params = new URL(href!, CLUSTER).searchParams;
			expect(params.getAll('alert_iocs')).toEqual(['1.1.1.1']);
		});
	});

	describe('nothing to pivot on', () => {
		// Returning null keeps the caller where it is. Navigating instead would
		// dump the user on an unfiltered alerts list, which reads as "the pivot
		// found everything" rather than "there was no value".
		it.each([
			['undefined', undefined],
			['null', null],
			['empty', ''],
			['whitespace', '   ']
		])('returns null for a %s label', (_name, label) => {
			expect(buildAlertPivotHref('ioc', label, CLUSTER)).toBeNull();
		});

		it('trims surrounding whitespace off a real value', () => {
			expect(buildAlertPivotHref('ioc', '  8.8.8.8  ', CLUSTER)).toBe('/alerts/?alert_iocs=8.8.8.8');
		});
	});
});
