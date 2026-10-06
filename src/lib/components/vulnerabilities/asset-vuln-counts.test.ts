import { describe, expect, it } from 'vitest';
import type { CaseFinding } from '$lib/services/vulnerabilities.service';
import { assetVulnCountsFromFindings } from './asset-vuln-counts';

const finding = (over: Partial<CaseFinding> & { severity?: string }): CaseFinding =>
	({
		asset_id: 1,
		status_group: 'open',
		exploitation_status: 'unknown',
		...over,
		vulnerability: { severity: over.severity ?? 'low' }
	}) as unknown as CaseFinding;

describe('assetVulnCountsFromFindings', () => {
	it('counts open findings per asset with the worst severity', () => {
		const counts = assetVulnCountsFromFindings([
			finding({ severity: 'low' }),
			finding({ severity: 'critical', exploitation_status: 'exploited' }),
			finding({ severity: 'medium' }),
			finding({ asset_id: 2, severity: 'high' })
		]);
		expect(counts.get(1)).toEqual({ open: 3, exploitedOpen: 1, severity: 'critical' });
		expect(counts.get(2)).toEqual({ open: 1, exploitedOpen: 0, severity: 'high' });
	});

	it('ignores fixed and dismissed findings', () => {
		const counts = assetVulnCountsFromFindings([
			finding({ status_group: 'fixed', exploitation_status: 'exploited' }),
			finding({ asset_id: 3, status_group: 'dismissed' })
		]);
		expect(counts.size).toBe(0);
	});
});
