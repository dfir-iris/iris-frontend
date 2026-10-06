import { describe, expect, it } from 'vitest';
import type { CaseFinding, VulnerabilityShort } from '$lib/services/vulnerabilities.service';
import {
	buildCaseCreatePayload,
	buildFindingPayload,
	buildManagedCreatePayload,
	choiceIdentifier,
	choicePayload,
	countOpenByAsset,
	emptyFindingForm,
	findingToForm,
	hasErrors,
	normalizeIdentifierInput,
	toDateInput,
	toDateTimeInput,
	validateChoice,
	validateFindingForm,
	vulnerabilityHref
} from './finding-form';

const vuln = { vulnerability_id: 7, identifier: 'CVE-2024-1234' } as VulnerabilityShort;

describe('validateFindingForm', () => {
	it('accepts the empty form', () => {
		expect(hasErrors(validateFindingForm(emptyFindingForm()))).toBe(false);
	});

	it.each(['risk-accepted', 'false-positive'] as const)('requires a reason for %s', (status) => {
		const errors = validateFindingForm(emptyFindingForm({ remediation_status: status }));
		expect(errors.status_reason).toBe('A reason is required for this status.');
		const ok = validateFindingForm(
			emptyFindingForm({ remediation_status: status, status_reason: '  accepted by CISO ' })
		);
		expect(hasErrors(ok)).toBe(false);
	});

	it('treats a blank reason as missing', () => {
		const errors = validateFindingForm(
			emptyFindingForm({ remediation_status: 'risk-accepted', status_reason: '   ' })
		);
		expect(errors.status_reason).toBeDefined();
	});

	it('requires a justification or a reason for not-affected', () => {
		const bare = validateFindingForm(emptyFindingForm({ remediation_status: 'not-affected' }));
		expect(bare.not_affected_justification).toBe('Pick a justification or give a reason.');
		expect(bare.status_reason).toBeUndefined();

		const justified = validateFindingForm(
			emptyFindingForm({
				remediation_status: 'not-affected',
				not_affected_justification: 'component_not_present'
			})
		);
		expect(hasErrors(justified)).toBe(false);

		const reasoned = validateFindingForm(
			emptyFindingForm({ remediation_status: 'not-affected', status_reason: 'not deployed' })
		);
		expect(hasErrors(reasoned)).toBe(false);
	});

	it('enforces the backend text limits', () => {
		const errors = validateFindingForm(
			emptyFindingForm({
				detection_source: 'x'.repeat(129),
				installed_version: 'x'.repeat(256),
				notes: 'x'.repeat(20001)
			})
		);
		expect(errors.detection_source).toBe('At most 128 characters.');
		expect(errors.installed_version).toBeUndefined();
		expect(errors.notes).toBe('At most 20000 characters.');
	});

	it('checks date formats', () => {
		const errors = validateFindingForm(
			emptyFindingForm({ due_date: '06/10/2026', detected_at: '2026-10-06', exploited_at: 'x' })
		);
		expect(errors.due_date).toBe('Use a YYYY-MM-DD date.');
		expect(errors.detected_at).toBe('Use a valid date and time.');
		expect(errors.exploited_at).toBe('Use a valid date and time.');

		const ok = validateFindingForm(
			emptyFindingForm({ due_date: '2026-10-06', detected_at: '2026-10-06T08:30' })
		);
		expect(hasErrors(ok)).toBe(false);
	});
});

describe('date conversions', () => {
	it('maps backend date-times to input values', () => {
		expect(toDateTimeInput('2026-10-06T08:30:12.123')).toBe('2026-10-06T08:30');
		expect(toDateTimeInput('2026-10-06 08:30:12')).toBe('2026-10-06T08:30');
		expect(toDateTimeInput('2026-10-06')).toBe('2026-10-06T00:00');
		expect(toDateTimeInput(null)).toBe('');
		expect(toDateInput('2026-10-06T00:00:00')).toBe('2026-10-06');
		expect(toDateInput('garbage')).toBe('');
	});
});

describe('buildFindingPayload (create)', () => {
	it('drops empty values', () => {
		expect(buildFindingPayload(emptyFindingForm())).toEqual({
			remediation_status: 'under-analysis',
			exploitation_status: 'unknown'
		});
	});

	it('trims text, completes date-times and keeps dates', () => {
		const payload = buildFindingPayload(
			emptyFindingForm({
				component: '  openssl ',
				detected_at: '2026-10-06T08:30',
				due_date: '2026-11-01',
				owner_id: 3
			})
		);
		expect(payload.component).toBe('openssl');
		expect(payload.detected_at).toBe('2026-10-06T08:30:00');
		expect(payload.due_date).toBe('2026-11-01');
		expect(payload.owner_id).toBe(3);
	});

	it('only sends a justification with not-affected', () => {
		const form = emptyFindingForm({
			remediation_status: 'affected',
			not_affected_justification: 'component_not_present'
		});
		expect(buildFindingPayload(form)).not.toHaveProperty('not_affected_justification');
		form.remediation_status = 'not-affected';
		expect(buildFindingPayload(form).not_affected_justification).toBe('component_not_present');
	});

	it('only sends exploited_at with an exploitation status that carries it', () => {
		const form = emptyFindingForm({
			exploitation_status: 'not-exploited',
			exploited_at: '2026-10-01T10:00'
		});
		expect(buildFindingPayload(form)).not.toHaveProperty('exploited_at');
		form.exploitation_status = 'exploited';
		expect(buildFindingPayload(form).exploited_at).toBe('2026-10-01T10:00:00');
	});

	it('sends sorted evidence ids only when asked', () => {
		const form = emptyFindingForm({ event_ids: [5, 2], ioc_ids: [9] });
		expect(buildFindingPayload(form)).not.toHaveProperty('event_ids');
		const payload = buildFindingPayload(form, { evidence: true });
		expect(payload.event_ids).toEqual([2, 5]);
		expect(payload.ioc_ids).toEqual([9]);
	});
});

describe('buildFindingPayload (update)', () => {
	const initial = emptyFindingForm({
		remediation_status: 'affected',
		detected_at: '2026-10-06T08:30',
		component: 'openssl',
		status_reason: 'seen on scan',
		event_ids: [1, 2]
	});

	it('sends nothing when nothing changed', () => {
		expect(buildFindingPayload(structuredClone(initial), { initial, evidence: true })).toEqual({});
	});

	it('sends only the changed fields', () => {
		const form = structuredClone(initial);
		form.component = '';
		form.owner_id = 4;
		expect(buildFindingPayload(form, { initial })).toEqual({ component: null, owner_id: 4 });
	});

	it('sends the reason along with a status change', () => {
		const form = structuredClone(initial);
		form.remediation_status = 'patched';
		expect(buildFindingPayload(form, { initial })).toEqual({
			remediation_status: 'patched',
			status_reason: 'seen on scan'
		});
	});

	it('compares evidence ids regardless of order', () => {
		const form = structuredClone(initial);
		form.event_ids = [2, 1];
		expect(buildFindingPayload(form, { initial, evidence: true })).toEqual({});
		form.event_ids = [2];
		expect(buildFindingPayload(form, { initial, evidence: true })).toEqual({ event_ids: [2] });
	});
});

describe('findingToForm', () => {
	it('maps a finding with its evidence', () => {
		const form = findingToForm({
			remediation_status: 'not-affected',
			not_affected_justification: null,
			status_reason: 'no',
			exploitation_status: 'unknown',
			exploited_at: null,
			detection_source: null,
			detected_at: '2026-10-06T08:30:45',
			component: null,
			installed_version: '1.0',
			fixed_version: null,
			notes: null,
			due_date: '2026-11-01',
			verification_method: null,
			owner_id: null,
			events: [{ event_id: 3, event_title: 'e', event_date: null }],
			iocs: [{ ioc_id: 8, ioc_value: 'x', ioc_type_name: null }]
		} as unknown as CaseFinding);
		expect(form.not_affected_justification).toBe('');
		expect(form.detected_at).toBe('2026-10-06T08:30');
		expect(form.installed_version).toBe('1.0');
		expect(form.event_ids).toEqual([3]);
		expect(form.ioc_ids).toEqual([8]);
	});
});

describe('vulnerability choice', () => {
	it('normalises CVE identifiers', () => {
		expect(normalizeIdentifierInput(' cve-2024-1234 ')).toBe('CVE-2024-1234');
		expect(normalizeIdentifierInput(' GHSA-abcd-efgh-ijkl ')).toBe('GHSA-abcd-efgh-ijkl');
	});

	it('validates the choice', () => {
		expect(validateChoice(null)).toBe('Choose a catalogue entry or type an identifier.');
		expect(validateChoice({ type: 'existing', vulnerability: vuln })).toBeNull();
		expect(validateChoice({ type: 'quick', identifier: '  ', title: '' })).toBe(
			'Type an identifier.'
		);
		expect(validateChoice({ type: 'quick', identifier: 'iris-vuln-12', title: '' })).toBe(
			'Private entries cannot be quick-added; pick them from the catalogue.'
		);
		expect(validateChoice({ type: 'quick', identifier: 'X'.repeat(129), title: '' })).toBe(
			'The identifier is too long.'
		);
		expect(validateChoice({ type: 'quick', identifier: 'cve-2024-1', title: '' })).toBeNull();
	});

	it('builds the choice payload', () => {
		expect(choicePayload({ type: 'existing', vulnerability: vuln })).toEqual({
			vulnerability_id: 7
		});
		expect(choicePayload({ type: 'quick', identifier: 'cve-2024-1', title: ' ' })).toEqual({
			identifier: 'CVE-2024-1'
		});
		expect(choicePayload({ type: 'quick', identifier: 'cve-2024-1', title: ' Bug ' })).toEqual({
			identifier: 'CVE-2024-1',
			title: 'Bug'
		});
		expect(choiceIdentifier({ type: 'existing', vulnerability: vuln })).toBe('CVE-2024-1234');
	});

	it('builds the case create payload with deduplicated assets and evidence', () => {
		const payload = buildCaseCreatePayload(
			{ type: 'existing', vulnerability: vuln },
			emptyFindingForm({ ioc_ids: [4] }),
			[3, 1, 3]
		);
		expect(payload).toEqual({
			vulnerability_id: 7,
			remediation_status: 'under-analysis',
			exploitation_status: 'unknown',
			ioc_ids: [4],
			asset_ids: [3, 1]
		});
	});

	it('builds the registry create payload without evidence', () => {
		const payload = buildManagedCreatePayload(
			{ type: 'quick', identifier: 'cve-2024-9', title: '' },
			emptyFindingForm({ ioc_ids: [4] })
		);
		expect(payload).toEqual({
			identifier: 'CVE-2024-9',
			remediation_status: 'under-analysis',
			exploitation_status: 'unknown'
		});
	});
});

describe('misc', () => {
	it('counts open findings per asset', () => {
		const counts = countOpenByAsset([
			{ asset_id: 1, status_group: 'open', exploitation_status: 'exploited' },
			{ asset_id: 1, status_group: 'open', exploitation_status: 'unknown' },
			{ asset_id: 1, status_group: 'fixed', exploitation_status: 'exploited' },
			{ asset_id: 2, status_group: 'dismissed', exploitation_status: 'unknown' }
		]);
		expect(counts.get(1)).toEqual({ open: 2, exploited: 1, total: 3 });
		expect(counts.get(2)).toEqual({ open: 0, exploited: 0, total: 1 });
	});

	it('links to the catalogue entry', () => {
		expect(vulnerabilityHref(12)).toBe('/manage/vulnerabilities/12');
	});
});
