/**
 * Form state, client-side validation and payload building for a
 * vulnerability finding — shared by the case tab, the case asset detail
 * and the registry asset detail.
 *
 * The rules mirror `_apply_finding_fields` in the backend
 * (`business/vulnerability_findings.py`) so the analyst is told before
 * the round trip; the backend stays the authority.
 */
import {
	PRIVATE_IDENTIFIER_PREFIX,
	remediationNeedsReason,
	type CaseFinding,
	type CaseFindingCreateInput,
	type ExploitationStatus,
	type FindingBase,
	type FindingInput,
	type NotAffectedJustification,
	type RemediationStatus,
	type Vulnerability,
	type VulnerabilityShort
} from '$lib/services/vulnerabilities.service';

/** Exploitation statuses that carry an `exploited_at` date. */
export const EXPLOITED_AT_STATUSES: readonly ExploitationStatus[] = [
	'attempted',
	'suspected',
	'exploited'
];

/** Backend length limits (`_TEXT_FIELDS`). */
export const FINDING_TEXT_LIMITS = {
	status_reason: 4000,
	detection_source: 128,
	component: 512,
	installed_version: 256,
	fixed_version: 256,
	notes: 20000,
	verification_method: 2000
} as const;

type TextField = keyof typeof FINDING_TEXT_LIMITS;

export interface FindingFormState {
	remediation_status: RemediationStatus;
	not_affected_justification: NotAffectedJustification | '';
	status_reason: string;
	exploitation_status: ExploitationStatus;
	/** `datetime-local` value (`YYYY-MM-DDTHH:mm`, UTC) or `''`. */
	exploited_at: string;
	detection_source: string;
	/** `datetime-local` value (`YYYY-MM-DDTHH:mm`, UTC) or `''`. */
	detected_at: string;
	component: string;
	installed_version: string;
	fixed_version: string;
	notes: string;
	/** `YYYY-MM-DD` or `''`. */
	due_date: string;
	verification_method: string;
	owner_id: number | null;
	event_ids: number[];
	ioc_ids: number[];
}

export type FindingFormField = keyof FindingFormState;
export type FindingFormErrors = Partial<Record<FindingFormField, string>>;

export function emptyFindingForm(overrides: Partial<FindingFormState> = {}): FindingFormState {
	return {
		remediation_status: 'under-analysis',
		not_affected_justification: '',
		status_reason: '',
		exploitation_status: 'unknown',
		exploited_at: '',
		detection_source: '',
		detected_at: '',
		component: '',
		installed_version: '',
		fixed_version: '',
		notes: '',
		due_date: '',
		verification_method: '',
		owner_id: null,
		event_ids: [],
		ioc_ids: [],
		...overrides
	};
}

/** Backend ISO date-time (naive UTC) → `datetime-local` value. */
export function toDateTimeInput(iso: string | null | undefined): string {
	if (!iso) return '';
	const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(iso);
	if (match) return `${match[1]}T${match[2]}`;
	return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00` : '';
}

/** Backend ISO date (or date-time) → `date` input value. */
export function toDateInput(iso: string | null | undefined): string {
	if (!iso) return '';
	const match = /^\d{4}-\d{2}-\d{2}/.exec(iso);
	return match ? match[0] : '';
}

export function findingToForm(finding: FindingBase | CaseFinding): FindingFormState {
	const caseFinding = finding as Partial<CaseFinding>;
	return emptyFindingForm({
		remediation_status: finding.remediation_status,
		not_affected_justification: finding.not_affected_justification ?? '',
		status_reason: finding.status_reason ?? '',
		exploitation_status: finding.exploitation_status,
		exploited_at: toDateTimeInput(finding.exploited_at),
		detection_source: finding.detection_source ?? '',
		detected_at: toDateTimeInput(finding.detected_at),
		component: finding.component ?? '',
		installed_version: finding.installed_version ?? '',
		fixed_version: finding.fixed_version ?? '',
		notes: finding.notes ?? '',
		due_date: toDateInput(finding.due_date),
		verification_method: finding.verification_method ?? '',
		owner_id: finding.owner_id ?? null,
		event_ids: (caseFinding.events ?? []).map((e) => e.event_id),
		ioc_ids: (caseFinding.iocs ?? []).map((i) => i.ioc_id)
	});
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

export function validateFindingForm(form: FindingFormState): FindingFormErrors {
	const errors: FindingFormErrors = {};
	const reason = form.status_reason.trim();

	if (remediationNeedsReason(form.remediation_status) && !reason) {
		errors.status_reason = 'A reason is required for this status.';
	}
	if (form.remediation_status === 'not-affected' && !form.not_affected_justification && !reason) {
		errors.not_affected_justification = 'Pick a justification or give a reason.';
	}

	for (const [field, limit] of Object.entries(FINDING_TEXT_LIMITS) as [TextField, number][]) {
		if (form[field].trim().length > limit) {
			errors[field] = `At most ${limit} characters.`;
		}
	}

	if (form.due_date && !DATE_RE.test(form.due_date)) {
		errors.due_date = 'Use a YYYY-MM-DD date.';
	}
	for (const field of ['detected_at', 'exploited_at'] as const) {
		if (form[field] && !DATE_TIME_RE.test(form[field])) {
			errors[field] = 'Use a valid date and time.';
		}
	}
	return errors;
}

export function hasErrors(errors: FindingFormErrors): boolean {
	return Object.values(errors).some(Boolean);
}

const textOrNull = (value: string): string | null => {
	const trimmed = value.trim();
	return trimmed ? trimmed : null;
};

const dateTimeOrNull = (value: string): string | null => {
	if (!value) return null;
	return /T\d{2}:\d{2}$/.test(value) ? `${value}:00` : value;
};

/** Every field of the form, as the backend expects it. */
function fullPayload(form: FindingFormState, evidence: boolean): FindingInput {
	const payload: FindingInput = {
		remediation_status: form.remediation_status,
		not_affected_justification:
			form.remediation_status === 'not-affected' && form.not_affected_justification
				? form.not_affected_justification
				: null,
		status_reason: textOrNull(form.status_reason),
		exploitation_status: form.exploitation_status,
		exploited_at: EXPLOITED_AT_STATUSES.includes(form.exploitation_status)
			? dateTimeOrNull(form.exploited_at)
			: null,
		detection_source: textOrNull(form.detection_source),
		detected_at: dateTimeOrNull(form.detected_at),
		component: textOrNull(form.component),
		installed_version: textOrNull(form.installed_version),
		fixed_version: textOrNull(form.fixed_version),
		notes: textOrNull(form.notes),
		due_date: form.due_date ? form.due_date : null,
		verification_method: textOrNull(form.verification_method),
		owner_id: form.owner_id
	};
	if (evidence) {
		payload.event_ids = [...form.event_ids].sort((a, b) => a - b);
		payload.ioc_ids = [...form.ioc_ids].sort((a, b) => a - b);
	}
	return payload;
}

const sameValue = (a: unknown, b: unknown): boolean => {
	if (Array.isArray(a) && Array.isArray(b)) {
		return a.length === b.length && a.every((v, i) => v === b[i]);
	}
	return a === b;
};

export interface BuildPayloadOptions {
	/** Send `event_ids` / `ioc_ids` (case findings only). */
	evidence?: boolean;
	/**
	 * The form as loaded: only the fields that differ from it are sent,
	 * so an untouched date-time is not rewritten (and logged in the
	 * history) with its seconds truncated.
	 */
	initial?: FindingFormState;
}

/**
 * Form → `FindingInput`. Without `initial` (a creation) empty values are
 * left out; with it, only the changed fields are sent.
 */
export function buildFindingPayload(
	form: FindingFormState,
	options: BuildPayloadOptions = {}
): FindingInput {
	const evidence = options.evidence ?? false;
	const next = fullPayload(form, evidence);

	if (options.initial) {
		const before = fullPayload(options.initial, evidence);
		const changed: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(next)) {
			if (!sameValue(value, before[key as keyof FindingInput])) changed[key] = value;
		}
		// The status rules are checked on the resulting row, but sending the
		// reason alongside a status change keeps the history entry's reason
		// in step with the change it explains.
		if ('remediation_status' in changed && next.status_reason) {
			changed.status_reason = next.status_reason;
		}
		return changed as FindingInput;
	}

	const created: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(next)) {
		if (value === null || value === undefined) continue;
		if (Array.isArray(value) && value.length === 0) continue;
		created[key] = value;
	}
	return created as FindingInput;
}

// ---- Catalogue entry choice -----------------------------------------------

export type VulnerabilityChoice =
	| { type: 'existing'; vulnerability: VulnerabilityShort | Vulnerability }
	| { type: 'quick'; identifier: string; title: string };

/** Trim, and upper-case the CVE prefix form the backend normalises to. */
export function normalizeIdentifierInput(value: string): string {
	const trimmed = value.trim();
	return /^cve-\d{4}-\d+$/i.test(trimmed) ? trimmed.toUpperCase() : trimmed;
}

export function isPrivateIdentifier(value: string): boolean {
	return value.trim().toUpperCase().startsWith(PRIVATE_IDENTIFIER_PREFIX);
}

/** Why the choice cannot be submitted, `null` when it can. */
export function validateChoice(choice: VulnerabilityChoice | null): string | null {
	if (!choice) return 'Choose a catalogue entry or type an identifier.';
	if (choice.type === 'existing') return null;
	const identifier = normalizeIdentifierInput(choice.identifier);
	if (!identifier) return 'Type an identifier.';
	if (isPrivateIdentifier(identifier)) {
		return 'Private entries cannot be quick-added; pick them from the catalogue.';
	}
	if (identifier.length > 128) return 'The identifier is too long.';
	return null;
}

export function choicePayload(
	choice: VulnerabilityChoice
): Pick<FindingInput, 'vulnerability_id' | 'identifier' | 'title'> {
	if (choice.type === 'existing')
		return { vulnerability_id: choice.vulnerability.vulnerability_id };
	const title = choice.title.trim();
	return {
		identifier: normalizeIdentifierInput(choice.identifier),
		...(title ? { title } : {})
	};
}

export function choiceIdentifier(choice: VulnerabilityChoice): string {
	return choice.type === 'existing'
		? choice.vulnerability.identifier
		: normalizeIdentifierInput(choice.identifier);
}

export function buildCaseCreatePayload(
	choice: VulnerabilityChoice,
	form: FindingFormState,
	assetIds: number[]
): CaseFindingCreateInput {
	return {
		...choicePayload(choice),
		...buildFindingPayload(form, { evidence: true }),
		asset_ids: [...new Set(assetIds)]
	};
}

export function buildManagedCreatePayload(
	choice: VulnerabilityChoice,
	form: FindingFormState
): FindingInput {
	return { ...choicePayload(choice), ...buildFindingPayload(form) };
}

// ---- Misc ------------------------------------------------------------------

/** Open findings per asset id, for counts next to an asset. */
export function countOpenByAsset(
	findings: Pick<CaseFinding, 'asset_id' | 'status_group' | 'exploitation_status'>[]
): Map<number, { open: number; exploited: number; total: number }> {
	const counts = new Map<number, { open: number; exploited: number; total: number }>();
	for (const finding of findings) {
		const entry = counts.get(finding.asset_id) ?? { open: 0, exploited: 0, total: 0 };
		entry.total += 1;
		if (finding.status_group === 'open') {
			entry.open += 1;
			if (finding.exploitation_status === 'exploited') entry.exploited += 1;
		}
		counts.set(finding.asset_id, entry);
	}
	return counts;
}

/** Catalogue detail page of an entry. */
export const vulnerabilityHref = (vulnerabilityId: number): string =>
	`/manage/vulnerabilities/${vulnerabilityId}`;
