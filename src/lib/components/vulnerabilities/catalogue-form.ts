/**
 * Catalogue entry form state <-> API payload.
 *
 * The form keeps every field as the string the input holds; this module
 * is the one place that turns those strings into a `VulnerabilityInput`
 * (and back), so the dialog stays a dumb view and the parsing is tested.
 *
 * Array fields are free text: CWEs, aliases and tags split on commas or
 * whitespace, references on whitespace, affected products one per line
 * as `vendor | product | versions`. EPSS is typed as a percentage and
 * sent as the [0, 1] probability the API stores.
 */
import type {
	AffectedProduct,
	CveLookupFields,
	ExploitMaturity,
	PatchAvailability,
	Vulnerability,
	VulnerabilityInput,
	VulnerabilityKind,
	VulnerabilitySeverity
} from '$lib/services/vulnerabilities.service';

export const CVSS_VERSIONS = ['2.0', '3.0', '3.1', '4.0'] as const;

export interface CatalogueForm {
	isPrivate: boolean;
	identifier: string;
	title: string;
	kind: VulnerabilityKind | '';
	description: string;
	cvssVector: string;
	cvssVersion: string;
	cvssScore: string;
	/** `''` lets the server derive it from the CVSS score. */
	severity: VulnerabilitySeverity | '';
	/** Percent, 0–100. */
	epssScore: string;
	/** Percent, 0–100. */
	epssPercentile: string;
	epssDate: string;
	kev: boolean;
	kevDateAdded: string;
	kevDueDate: string;
	kevRansomware: boolean;
	exploitMaturity: ExploitMaturity;
	patchAvailability: PatchAvailability;
	cwes: string;
	affectedProducts: string;
	referenceUrls: string;
	publishedAt: string;
	modifiedAt: string;
	tags: string;
	aliases: string;
}

export type FormResult = { ok: true; payload: VulnerabilityInput } | { ok: false; error: string };

export function emptyCatalogueForm(): CatalogueForm {
	return {
		isPrivate: false,
		identifier: '',
		title: '',
		kind: '',
		description: '',
		cvssVector: '',
		cvssVersion: '',
		cvssScore: '',
		severity: '',
		epssScore: '',
		epssPercentile: '',
		epssDate: '',
		kev: false,
		kevDateAdded: '',
		kevDueDate: '',
		kevRansomware: false,
		exploitMaturity: 'unknown',
		patchAvailability: 'unknown',
		cwes: '',
		affectedProducts: '',
		referenceUrls: '',
		publishedAt: '',
		modifiedAt: '',
		tags: '',
		aliases: ''
	};
}

const dateOnly = (value: string | null | undefined) => (value ? value.slice(0, 10) : '');

/** Strip float noise (`0.97` * 100 = `97.00000000000001`). */
const toPercent = (value: number | null | undefined) =>
	value === null || value === undefined ? '' : String(Number((value * 100).toFixed(4)));

export function formatProducts(products: AffectedProduct[] | null | undefined): string {
	return (products ?? [])
		.map((p) => {
			const parts = [p.vendor ?? '', p.product ?? '', p.versions ?? ''];
			while (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
			return parts.join(' | ');
		})
		.join('\n');
}

export function catalogueFormFrom(v: Vulnerability): CatalogueForm {
	return {
		isPrivate: v.is_private,
		identifier: v.identifier,
		title: v.title ?? '',
		kind: v.kind,
		description: v.description ?? '',
		cvssVector: v.cvss_vector ?? '',
		cvssVersion: v.cvss_version ?? '',
		cvssScore: v.cvss_score === null || v.cvss_score === undefined ? '' : String(v.cvss_score),
		severity: v.severity,
		epssScore: toPercent(v.epss_score),
		epssPercentile: toPercent(v.epss_percentile),
		epssDate: dateOnly(v.epss_date),
		kev: v.kev,
		kevDateAdded: dateOnly(v.kev_date_added),
		kevDueDate: dateOnly(v.kev_due_date),
		kevRansomware: v.kev_ransomware,
		exploitMaturity: v.exploit_maturity,
		patchAvailability: v.patch_availability,
		cwes: (v.cwes ?? []).join(', '),
		affectedProducts: formatProducts(v.affected_products),
		referenceUrls: (v.reference_urls ?? []).join('\n'),
		publishedAt: dateOnly(v.published_at),
		modifiedAt: dateOnly(v.modified_at),
		tags: v.tags ?? '',
		aliases: (v.aliases ?? []).join(', ')
	};
}

/**
 * Fill the form from a cve.org lookup. Only the fields cve.org is the
 * source of are overwritten; EPSS, patch availability, KEV due date and
 * ransomware use, tags, aliases and privacy are left as they were. A
 * missing severity becomes `''` so the server derives it from the score.
 */
export function applyCveLookup(
	form: CatalogueForm,
	lookup: { identifier: string; fields: CveLookupFields }
): CatalogueForm {
	const f = lookup.fields;
	return {
		...form,
		identifier: lookup.identifier || form.identifier,
		title: f.title ?? '',
		kind: f.kind ?? '',
		description: f.description ?? '',
		cvssVector: f.cvss_vector ?? '',
		cvssVersion: f.cvss_version ?? '',
		cvssScore: f.cvss_score === null || f.cvss_score === undefined ? '' : String(f.cvss_score),
		severity: f.severity ?? '',
		cwes: (f.cwes ?? []).join(', '),
		affectedProducts: formatProducts(f.affected_products),
		referenceUrls: (f.reference_urls ?? []).join('\n'),
		publishedAt: dateOnly(f.published_at),
		modifiedAt: dateOnly(f.modified_at),
		kev: !!f.kev,
		kevDateAdded: f.kev ? dateOnly(f.kev_date_added) : '',
		exploitMaturity: f.exploit_maturity ?? 'unknown'
	};
}

/** Split on commas / whitespace, trim, drop blanks and duplicates. */
export function splitList(value: string, separators: RegExp = /[,\s]+/): string[] {
	const seen = new Set<string>();
	for (const raw of value.split(separators)) {
		const item = raw.trim();
		if (item) seen.add(item);
	}
	return [...seen];
}

/** `79`, `cwe-79` and `CWE-79` all mean `CWE-79`. */
export function parseCwes(value: string): string[] {
	return [
		...new Set(
			splitList(value).map((item) => {
				const upper = item.toUpperCase();
				return /^\d+$/.test(upper) ? `CWE-${upper}` : upper;
			})
		)
	];
}

/**
 * One product per line, `vendor | product | versions`. A single segment
 * is the product alone; two are vendor and product.
 */
export function parseProducts(value: string): AffectedProduct[] {
	const products: AffectedProduct[] = [];
	for (const line of value.split(/\r?\n/)) {
		if (!line.trim()) continue;
		const parts = line.split('|').map((part) => part.trim());
		let vendor: string | null = null;
		let product: string | null;
		let versions: string | null = null;
		if (parts.length === 1) {
			product = parts[0];
		} else {
			vendor = parts[0] || null;
			product = parts[1] || null;
			versions = parts.slice(2).join(' | ').trim() || null;
		}
		products.push({ vendor, product, versions });
	}
	return products;
}

const blankToNull = (value: string) => {
	const trimmed = value.trim();
	return trimmed === '' ? null : trimmed;
};

function parseNumber(
	value: string,
	label: string,
	min: number,
	max: number
): { ok: true; value: number | null } | { ok: false; error: string } {
	const trimmed = value.trim().replace(',', '.');
	if (trimmed === '') return { ok: true, value: null };
	const parsed = Number(trimmed);
	if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
		return { ok: false, error: `${label} must be a number between ${min} and ${max}.` };
	}
	return { ok: true, value: parsed };
}

/**
 * Build the create (no `initial`) or update payload.
 *
 * On update the privacy flag is left out (the server refuses to change
 * it) and so is the identifier of a private entry. The CVSS score is
 * left out whenever a vector is set and the score was not touched, so a
 * new vector gets its score recomputed server-side instead of keeping a
 * stale one.
 */
export function catalogueFormToPayload(form: CatalogueForm, initial?: Vulnerability): FormResult {
	const creating = !initial;
	const title = form.title.trim();
	if (!title) return { ok: false, error: 'A title is required.' };

	const payload: VulnerabilityInput = { title };

	if (creating) {
		payload.is_private = form.isPrivate;
		if (!form.isPrivate) {
			const identifier = form.identifier.trim();
			if (!identifier) {
				return {
					ok: false,
					error: 'A public entry needs an identifier (e.g. CVE-2024-3400), or mark it private.'
				};
			}
			payload.identifier = identifier;
		}
	} else if (!initial.is_private) {
		const identifier = form.identifier.trim();
		if (!identifier) return { ok: false, error: 'The identifier cannot be empty.' };
		payload.identifier = identifier;
	}

	if (form.kind) payload.kind = form.kind;
	payload.description = blankToNull(form.description);

	// --- Scoring -------------------------------------------------------
	const vector = form.cvssVector.trim();
	const score = parseNumber(form.cvssScore, 'The CVSS score', 0, 10);
	if (!score.ok) return score;

	const vectorChanged = !initial || (initial.cvss_vector ?? '') !== vector;
	const scoreChanged = !initial || score.value !== (initial.cvss_score ?? null);
	const versionChanged = !initial || (initial.cvss_version ?? '') !== form.cvssVersion;
	if (vector) {
		payload.cvss_vector = vector;
		if (score.value !== null && (!vectorChanged || scoreChanged)) {
			payload.cvss_score = score.value;
		}
	} else {
		payload.cvss_vector = null;
		payload.cvss_version = form.cvssVersion || null;
		payload.cvss_score = score.value;
	}

	// Severity left on "auto", or left as it was while the scoring moved,
	// is re-derived from the score server-side. On create, leaving the key
	// out does that; on update the key must be present and null.
	const scoringChanged = vectorChanged || scoreChanged || versionChanged;
	const severityAuto =
		form.severity === '' || (!!initial && form.severity === initial.severity && scoringChanged);
	if (!severityAuto) {
		payload.severity = form.severity as VulnerabilitySeverity;
	} else if (!creating) {
		payload.severity = null;
	}

	const epss = parseNumber(form.epssScore, 'EPSS', 0, 100);
	if (!epss.ok) return epss;
	const percentile = parseNumber(form.epssPercentile, 'The EPSS percentile', 0, 100);
	if (!percentile.ok) return percentile;
	payload.epss_score = epss.value === null ? null : Number((epss.value / 100).toFixed(6));
	payload.epss_percentile =
		percentile.value === null ? null : Number((percentile.value / 100).toFixed(6));
	payload.epss_date = form.epssDate || null;

	payload.kev = form.kev;
	payload.kev_date_added = form.kev ? form.kevDateAdded || null : null;
	payload.kev_due_date = form.kev ? form.kevDueDate || null : null;
	payload.kev_ransomware = form.kev ? form.kevRansomware : false;

	payload.exploit_maturity = form.exploitMaturity;
	payload.patch_availability = form.patchAvailability;

	// --- Lists ---------------------------------------------------------
	payload.cwes = parseCwes(form.cwes);
	payload.affected_products = parseProducts(form.affectedProducts);
	if (payload.affected_products.some((p) => !p.product)) {
		return {
			ok: false,
			error: 'Every affected product needs a product name (`vendor | product | versions`).'
		};
	}
	payload.reference_urls = splitList(form.referenceUrls, /\s+/);
	payload.aliases = splitList(form.aliases);

	payload.published_at = form.publishedAt || null;
	payload.modified_at = form.modifiedAt || null;
	payload.tags = blankToNull(splitList(form.tags, /,/).join(','));

	return { ok: true, payload };
}
