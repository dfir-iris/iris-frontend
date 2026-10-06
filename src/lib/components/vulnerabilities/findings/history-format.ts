/**
 * Turns the `changes` of a finding history entry
 * (`{field: {from, to}}`, see `_diff` in the backend) into display rows.
 */
import {
	EXPLOITATION_STATUS_LABELS,
	NOT_AFFECTED_JUSTIFICATION_LABELS,
	REMEDIATION_STATUS_LABELS,
	labelOf
} from '../labels';

export const HISTORY_FIELD_LABELS: Record<string, string> = {
	remediation_status: 'Remediation',
	not_affected_justification: 'Justification',
	status_reason: 'Reason',
	exploitation_status: 'Exploitation',
	exploited_at: 'Exploited at',
	detection_source: 'Detection source',
	detected_at: 'Detected at',
	component: 'Component',
	installed_version: 'Installed version',
	fixed_version: 'Fixed version',
	notes: 'Notes',
	due_date: 'Due date',
	verified_at: 'Verified at',
	verified_by_id: 'Verified by',
	verification_method: 'Verification method',
	owner_id: 'Owner',
	decision_id: 'Decision'
};

export interface HistoryChangeRow {
	field: string;
	label: string;
	from: string;
	to: string;
}

const MAX_TEXT = 140;

export function formatHistoryValue(field: string, value: unknown): string {
	if (value === null || value === undefined || value === '') return '—';
	if (field === 'remediation_status') return labelOf(REMEDIATION_STATUS_LABELS, String(value));
	if (field === 'exploitation_status') return labelOf(EXPLOITATION_STATUS_LABELS, String(value));
	if (field === 'not_affected_justification') {
		return labelOf(NOT_AFFECTED_JUSTIFICATION_LABELS, String(value));
	}
	if (field.endsWith('_id')) return `#${value}`;
	if (field.endsWith('_at') && typeof value === 'string') {
		return value.replace('T', ' ').slice(0, 16);
	}
	const text = typeof value === 'string' ? value : JSON.stringify(value);
	return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text;
}

export function historyChangeRows(changes: Record<string, unknown> | null): HistoryChangeRow[] {
	if (!changes) return [];
	const rows: HistoryChangeRow[] = [];
	for (const [field, raw] of Object.entries(changes)) {
		const change =
			raw && typeof raw === 'object' && ('from' in raw || 'to' in raw)
				? (raw as { from?: unknown; to?: unknown })
				: { from: undefined, to: raw };
		rows.push({
			field,
			label: HISTORY_FIELD_LABELS[field] ?? field,
			from: formatHistoryValue(field, change.from),
			to: formatHistoryValue(field, change.to)
		});
	}
	return rows;
}
