import { describe, expect, it } from 'vitest';
import { formatHistoryValue, historyChangeRows } from './history-format';

describe('formatHistoryValue', () => {
	it('renders empty values as a dash', () => {
		expect(formatHistoryValue('notes', null)).toBe('—');
		expect(formatHistoryValue('notes', undefined)).toBe('—');
		expect(formatHistoryValue('notes', '')).toBe('—');
	});

	it('labels statuses', () => {
		expect(formatHistoryValue('remediation_status', 'patched')).toBe('Patched');
		expect(formatHistoryValue('exploitation_status', 'exploited')).toBe('Exploited');
	});

	it('formats ids and date-times', () => {
		expect(formatHistoryValue('owner_id', 4)).toBe('#4');
		expect(formatHistoryValue('detected_at', '2026-10-06T08:30:12.5')).toBe('2026-10-06 08:30');
	});

	it('truncates long text', () => {
		const out = formatHistoryValue('notes', 'x'.repeat(200));
		expect(out).toHaveLength(141);
		expect(out.endsWith('…')).toBe(true);
	});
});

describe('historyChangeRows', () => {
	it('handles null', () => {
		expect(historyChangeRows(null)).toEqual([]);
	});

	it('maps from/to changes and raw values', () => {
		expect(
			historyChangeRows({
				remediation_status: { from: 'affected', to: 'patched' },
				component: 'openssl',
				custom_field: { from: null, to: 'x' }
			})
		).toEqual([
			{ field: 'remediation_status', label: 'Remediation', from: 'Affected', to: 'Patched' },
			{ field: 'component', label: 'Component', from: '—', to: 'openssl' },
			{ field: 'custom_field', label: 'custom_field', from: '—', to: 'x' }
		]);
	});
});
