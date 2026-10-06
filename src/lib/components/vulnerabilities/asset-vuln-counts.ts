import type { CaseFinding, VulnerabilitySeverity } from '$lib/services/vulnerabilities.service';

export interface AssetVulnCounts {
	open: number;
	exploitedOpen: number;
	/** Worst severity among the open findings. */
	severity: VulnerabilitySeverity;
}

const SEVERITY_RANK: Record<VulnerabilitySeverity, number> = {
	critical: 5,
	high: 4,
	medium: 3,
	low: 2,
	none: 1,
	unknown: 0
};

/** Per-asset totals of the open findings of a case (other groups are skipped). */
export function assetVulnCountsFromFindings(findings: CaseFinding[]): Map<number, AssetVulnCounts> {
	const counts = new Map<number, AssetVulnCounts>();
	for (const finding of findings) {
		if (finding.status_group !== 'open') continue;
		const severity = finding.vulnerability.severity;
		const entry = counts.get(finding.asset_id);
		if (!entry) {
			counts.set(finding.asset_id, {
				open: 1,
				exploitedOpen: finding.exploitation_status === 'exploited' ? 1 : 0,
				severity
			});
			continue;
		}
		entry.open += 1;
		if (finding.exploitation_status === 'exploited') entry.exploitedOpen += 1;
		if ((SEVERITY_RANK[severity] ?? 0) > (SEVERITY_RANK[entry.severity] ?? 0)) {
			entry.severity = severity;
		}
	}
	return counts;
}
