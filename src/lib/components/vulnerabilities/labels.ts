/**
 * Human labels and colour classes shared by every vulnerability view
 * (catalogue, case tab, registry asset, war room).
 */
import type {
	ExploitationStatus,
	ExploitMaturity,
	FindingStatusGroup,
	NotAffectedJustification,
	PatchAvailability,
	RemediationStatus,
	VulnerabilityKind,
	VulnerabilitySeverity
} from '$lib/services/vulnerabilities.service';

export const SEVERITY_LABELS: Record<VulnerabilitySeverity, string> = {
	critical: 'Critical',
	high: 'High',
	medium: 'Medium',
	low: 'Low',
	none: 'None',
	unknown: 'Unknown'
};

/** Badge background/text classes per severity (light + dark). */
export const SEVERITY_CLASSES: Record<VulnerabilitySeverity, string> = {
	critical:
		'border-transparent bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-700/30 dark:text-red-300 dark:hover:bg-red-700/40',
	high: 'border-transparent bg-orange-100 text-orange-800 hover:bg-orange-200 dark:bg-orange-700/30 dark:text-orange-300 dark:hover:bg-orange-700/40',
	medium:
		'border-transparent bg-yellow-100 text-yellow-800 hover:bg-yellow-200 dark:bg-yellow-700/30 dark:text-yellow-300 dark:hover:bg-yellow-700/40',
	low: 'border-transparent bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-700/30 dark:text-blue-300 dark:hover:bg-blue-700/40',
	none: 'border-transparent bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700/30 dark:text-gray-300 dark:hover:bg-gray-700/40',
	unknown:
		'border-transparent bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-700/30 dark:text-gray-400 dark:hover:bg-gray-700/40'
};

export const KIND_LABELS: Record<VulnerabilityKind, string> = {
	cve: 'CVE',
	advisory: 'Advisory',
	misconfiguration: 'Misconfiguration',
	'weak-credentials': 'Weak credentials',
	'exposed-service': 'Exposed service',
	'design-flaw': 'Design flaw',
	'zero-day': 'Zero-day',
	other: 'Other'
};

export const EXPLOIT_MATURITY_LABELS: Record<ExploitMaturity, string> = {
	unknown: 'Unknown',
	none: 'None known',
	poc: 'Proof of concept',
	weaponized: 'Weaponized',
	'in-the-wild': 'In the wild'
};

export const PATCH_AVAILABILITY_LABELS: Record<PatchAvailability, string> = {
	unknown: 'Unknown',
	patch: 'Patch available',
	workaround: 'Workaround only',
	none: 'No fix'
};

export const REMEDIATION_STATUS_LABELS: Record<RemediationStatus, string> = {
	'under-analysis': 'Under analysis',
	affected: 'Affected',
	mitigated: 'Mitigated',
	patched: 'Patched',
	verified: 'Verified',
	'not-affected': 'Not affected',
	'risk-accepted': 'Risk accepted',
	'false-positive': 'False positive'
};

export const STATUS_GROUP_LABELS: Record<FindingStatusGroup, string> = {
	open: 'Open',
	fixed: 'Fixed',
	dismissed: 'Dismissed'
};

export const STATUS_GROUP_CLASSES: Record<FindingStatusGroup, string> = {
	open: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-700/30 dark:text-amber-300',
	fixed:
		'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-700/30 dark:text-emerald-300',
	dismissed: 'border-transparent bg-gray-100 text-gray-700 dark:bg-gray-700/30 dark:text-gray-300'
};

export const EXPLOITATION_STATUS_LABELS: Record<ExploitationStatus, string> = {
	unknown: 'Unknown',
	'not-exploited': 'Not exploited',
	attempted: 'Attempted',
	suspected: 'Suspected',
	exploited: 'Exploited'
};

export const EXPLOITATION_STATUS_CLASSES: Record<ExploitationStatus, string> = {
	unknown: 'border-transparent bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400',
	'not-exploited':
		'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-700/30 dark:text-emerald-300',
	attempted:
		'border-transparent bg-yellow-100 text-yellow-800 dark:bg-yellow-700/30 dark:text-yellow-300',
	suspected:
		'border-transparent bg-orange-100 text-orange-800 dark:bg-orange-700/30 dark:text-orange-300',
	exploited: 'border-transparent bg-red-100 text-red-800 dark:bg-red-700/30 dark:text-red-300'
};

export const NOT_AFFECTED_JUSTIFICATION_LABELS: Record<NotAffectedJustification, string> = {
	component_not_present: 'Component not present',
	vulnerable_code_not_present: 'Vulnerable code not present',
	vulnerable_code_not_in_execute_path: 'Vulnerable code not in execute path',
	vulnerable_code_cannot_be_controlled_by_adversary:
		'Vulnerable code cannot be controlled by adversary',
	inline_mitigations_already_exist: 'Inline mitigations already exist'
};

/** Label lookup that tolerates values the backend may add later. */
export function labelOf<K extends string>(
	labels: Record<K, string>,
	value: string | null | undefined
): string {
	if (value === null || value === undefined || value === '') return '—';
	return (labels as Record<string, string>)[value] ?? value;
}

export function formatCvss(score: number | null | undefined): string {
	if (score === null || score === undefined || Number.isNaN(score)) return '—';
	return score.toFixed(1);
}

/** EPSS is a probability in [0, 1]; shown as a percentage. */
export function formatEpss(score: number | null | undefined): string {
	if (score === null || score === undefined || Number.isNaN(score)) return '—';
	const pct = score * 100;
	return `${pct < 1 ? pct.toFixed(2) : pct.toFixed(1)}%`;
}
