import { describe, it, expect } from 'vitest';
import type { CveLookupFields, Vulnerability } from '$lib/services/vulnerabilities.service';
import {
	applyCveLookup,
	catalogueFormFrom,
	catalogueFormToPayload,
	emptyCatalogueForm,
	formatProducts,
	parseCwes,
	parseProducts,
	splitList,
	type CatalogueForm
} from './catalogue-form';
import { formatCvss, formatEpss, labelOf, KIND_LABELS } from './labels';

const form = (patch: Partial<CatalogueForm>): CatalogueForm => ({
	...emptyCatalogueForm(),
	...patch
});

const entry = (patch: Partial<Vulnerability> = {}): Vulnerability => ({
	vulnerability_id: 1,
	vulnerability_uuid: 'u',
	identifier: 'CVE-2024-3400',
	is_private: false,
	kind: 'cve',
	title: 'PAN-OS command injection',
	description: null,
	cvss_version: '3.1',
	cvss_vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H',
	cvss_score: 10,
	severity: 'critical',
	epss_score: 0.97,
	epss_percentile: 0.999,
	epss_date: '2024-05-01',
	kev: true,
	kev_date_added: '2024-04-12',
	kev_due_date: '2024-04-19',
	kev_ransomware: false,
	exploit_maturity: 'in-the-wild',
	patch_availability: 'patch',
	cwes: ['CWE-77'],
	affected_products: [{ vendor: 'Palo Alto', product: 'PAN-OS', versions: '< 11.1.2-h3' }],
	reference_urls: ['https://security.paloaltonetworks.com/CVE-2024-3400'],
	published_at: '2024-04-12',
	modified_at: null,
	tlp_id: null,
	tags: 'edge,firewall',
	source: 'manual',
	enrichment: null,
	aliases: [],
	created_at: null,
	updated_at: null,
	created_by_id: 1,
	created_by_name: 'admin',
	updated_by_id: null,
	updated_by_name: null,
	...patch
});

describe('list parsing', () => {
	it('splits, trims and dedupes', () => {
		expect(splitList(' a, b\nc ,, a ')).toEqual(['a', 'b', 'c']);
		expect(splitList('https://a https://b\nhttps://a', /\s+/)).toEqual(['https://a', 'https://b']);
	});

	it('normalises CWEs', () => {
		expect(parseCwes('79, cwe-89 CWE-79')).toEqual(['CWE-79', 'CWE-89']);
	});

	it('parses products one per line', () => {
		expect(parseProducts('openssl\nApache | httpd | 2.4.0 - 2.4.49\n\nMS | Exchange')).toEqual([
			{ vendor: null, product: 'openssl', versions: null },
			{ vendor: 'Apache', product: 'httpd', versions: '2.4.0 - 2.4.49' },
			{ vendor: 'MS', product: 'Exchange', versions: null }
		]);
	});

	it('round-trips products', () => {
		const products = [
			{ vendor: 'Apache', product: 'httpd', versions: '2.4.49' },
			{ vendor: 'MS', product: 'Exchange', versions: null }
		];
		expect(parseProducts(formatProducts(products))).toEqual(products);
	});
});

describe('catalogueFormToPayload — create', () => {
	it('requires a title', () => {
		const result = catalogueFormToPayload(form({ identifier: 'CVE-2024-1' }));
		expect(result.ok).toBe(false);
	});

	it('requires an identifier for a public entry', () => {
		const result = catalogueFormToPayload(form({ title: 'x' }));
		expect(result.ok).toBe(false);
	});

	it('drops the identifier of a private entry', () => {
		const result = catalogueFormToPayload(
			form({ title: 'Weak admin password', isPrivate: true, identifier: 'CVE-2024-1' })
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.payload.is_private).toBe(true);
		expect(result.payload).not.toHaveProperty('identifier');
		expect(result.payload).not.toHaveProperty('severity');
	});

	it('converts every field', () => {
		const result = catalogueFormToPayload(
			form({
				identifier: ' CVE-2021-41773 ',
				title: ' Path traversal ',
				kind: 'cve',
				description: '  ',
				cvssVersion: '3.1',
				cvssScore: '7,5',
				severity: 'high',
				epssScore: '97.5',
				epssPercentile: '99.9',
				kev: true,
				kevDateAdded: '2021-11-03',
				kevRansomware: true,
				exploitMaturity: 'weaponized',
				patchAvailability: 'patch',
				cwes: '22',
				affectedProducts: 'Apache | httpd | 2.4.49',
				referenceUrls: 'https://a\nhttps://b',
				aliases: 'GHSA-xxxx-yyyy-zzzz',
				tags: 'web, apache',
				publishedAt: '2021-10-05'
			})
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.payload).toMatchObject({
			identifier: 'CVE-2021-41773',
			is_private: false,
			title: 'Path traversal',
			kind: 'cve',
			description: null,
			cvss_vector: null,
			cvss_version: '3.1',
			cvss_score: 7.5,
			severity: 'high',
			epss_score: 0.975,
			epss_percentile: 0.999,
			kev: true,
			kev_date_added: '2021-11-03',
			kev_due_date: null,
			kev_ransomware: true,
			exploit_maturity: 'weaponized',
			patch_availability: 'patch',
			cwes: ['CWE-22'],
			affected_products: [{ vendor: 'Apache', product: 'httpd', versions: '2.4.49' }],
			reference_urls: ['https://a', 'https://b'],
			aliases: ['GHSA-xxxx-yyyy-zzzz'],
			tags: 'web,apache',
			published_at: '2021-10-05',
			modified_at: null
		});
	});

	it('lets the server score a vector', () => {
		const result = catalogueFormToPayload(
			form({
				identifier: 'CVE-2024-1',
				title: 'x',
				cvssVector: 'CVSS:3.1/AV:N',
				cvssVersion: '3.1'
			})
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.payload.cvss_vector).toBe('CVSS:3.1/AV:N');
		expect(result.payload).not.toHaveProperty('cvss_score');
		expect(result.payload).not.toHaveProperty('cvss_version');
	});

	it('rejects out of range numbers', () => {
		expect(catalogueFormToPayload(form({ identifier: 'C', title: 'x', cvssScore: '11' })).ok).toBe(
			false
		);
		expect(catalogueFormToPayload(form({ identifier: 'C', title: 'x', epssScore: 'abc' })).ok).toBe(
			false
		);
	});

	it('clears KEV details when KEV is off', () => {
		const result = catalogueFormToPayload(
			form({
				identifier: 'C',
				title: 'x',
				kev: false,
				kevDueDate: '2024-01-01',
				kevRansomware: true
			})
		);
		if (!result.ok) throw new Error(result.error);
		expect(result.payload.kev_due_date).toBeNull();
		expect(result.payload.kev_ransomware).toBe(false);
	});

	it('needs a product name on every product line', () => {
		const result = catalogueFormToPayload(
			form({ identifier: 'C', title: 'x', affectedProducts: 'Vendor |  | 1.0' })
		);
		expect(result.ok).toBe(false);
	});
});

describe('catalogueFormToPayload — update', () => {
	it('round-trips an unchanged entry', () => {
		const initial = entry();
		const result = catalogueFormToPayload(catalogueFormFrom(initial), initial);
		if (!result.ok) throw new Error(result.error);
		expect(result.payload).not.toHaveProperty('is_private');
		expect(result.payload.identifier).toBe('CVE-2024-3400');
		expect(result.payload.cvss_score).toBe(10);
		expect(result.payload.severity).toBe('critical');
		expect(result.payload.epss_score).toBe(0.97);
		expect(result.payload.epss_percentile).toBe(0.999);
		expect(result.payload.affected_products).toEqual(initial.affected_products);
		expect(result.payload.tags).toBe('edge,firewall');
	});

	it('never sends the identifier of a private entry', () => {
		const initial = entry({ identifier: 'IRIS-VULN-2026-0001', is_private: true });
		const result = catalogueFormToPayload(catalogueFormFrom(initial), initial);
		if (!result.ok) throw new Error(result.error);
		expect(result.payload).not.toHaveProperty('identifier');
		expect(result.payload).not.toHaveProperty('is_private');
	});

	it('rescores a changed vector and re-derives an untouched severity', () => {
		const initial = entry();
		const result = catalogueFormToPayload(
			{ ...catalogueFormFrom(initial), cvssVector: 'CVSS:3.1/AV:L/AC:H/PR:H/UI:R/S:U/C:L/I:N/A:N' },
			initial
		);
		if (!result.ok) throw new Error(result.error);
		expect(result.payload).not.toHaveProperty('cvss_score');
		expect(result.payload).toHaveProperty('severity', null);
	});

	it('keeps an explicit severity change', () => {
		const initial = entry();
		const result = catalogueFormToPayload(
			{ ...catalogueFormFrom(initial), severity: 'medium' },
			initial
		);
		if (!result.ok) throw new Error(result.error);
		expect(result.payload.severity).toBe('medium');
	});

	it('sends null severity for auto', () => {
		const initial = entry();
		const result = catalogueFormToPayload({ ...catalogueFormFrom(initial), severity: '' }, initial);
		if (!result.ok) throw new Error(result.error);
		expect(result.payload).toHaveProperty('severity', null);
	});
});

describe('applyCveLookup', () => {
	const fields = (patch: Partial<CveLookupFields> = {}): CveLookupFields => ({
		kind: 'cve',
		title: 'PAN-OS: OS command injection in GlobalProtect',
		description: 'A command injection vulnerability…',
		cvss_vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H',
		cvss_version: '3.1',
		cvss_score: 10,
		severity: 'critical',
		cwes: ['CWE-77'],
		affected_products: [
			{ vendor: 'Palo Alto Networks', product: 'PAN-OS', versions: '10.2.0 to < 10.2.9-h1' }
		],
		reference_urls: ['https://a.example/1', 'https://a.example/2'],
		published_at: '2024-04-12',
		modified_at: '2025-10-21',
		kev: true,
		kev_date_added: '2024-04-12',
		exploit_maturity: 'in-the-wild',
		...patch
	});

	it('overwrites the cve.org fields and keeps the local ones', () => {
		const before = form({
			identifier: 'cve-2024-3400',
			title: 'old',
			cwes: 'CWE-1',
			tags: 'edge',
			aliases: 'GHSA-aaaa-bbbb-cccc',
			epssScore: '97',
			epssPercentile: '99.9',
			epssDate: '2024-05-01',
			patchAvailability: 'patch',
			kevDueDate: '2024-04-19',
			kevRansomware: true
		});
		const after = applyCveLookup(before, { identifier: 'CVE-2024-3400', fields: fields() });
		expect(after).toEqual({
			...before,
			identifier: 'CVE-2024-3400',
			title: 'PAN-OS: OS command injection in GlobalProtect',
			kind: 'cve',
			description: 'A command injection vulnerability…',
			cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H',
			cvssVersion: '3.1',
			cvssScore: '10',
			severity: 'critical',
			cwes: 'CWE-77',
			affectedProducts: 'Palo Alto Networks | PAN-OS | 10.2.0 to < 10.2.9-h1',
			referenceUrls: 'https://a.example/1\nhttps://a.example/2',
			publishedAt: '2024-04-12',
			modifiedAt: '2025-10-21',
			kev: true,
			kevDateAdded: '2024-04-12',
			exploitMaturity: 'in-the-wild'
		});
		// The input is not mutated.
		expect(before.title).toBe('old');
	});

	it('clears what cve.org does not provide and lets the server derive severity', () => {
		const before = form({
			description: 'mine',
			cvssVector: 'CVSS:3.1/AV:L/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
			cvssScore: '8.4',
			severity: 'high',
			kev: true,
			kevDateAdded: '2023-01-01',
			publishedAt: '2023-01-01'
		});
		const after = applyCveLookup(before, {
			identifier: 'CVE-2024-1',
			fields: fields({
				description: null,
				cvss_vector: null,
				cvss_version: null,
				cvss_score: null,
				severity: null,
				cwes: [],
				affected_products: [],
				reference_urls: [],
				published_at: null,
				modified_at: null,
				kev: false,
				kev_date_added: null,
				exploit_maturity: 'unknown'
			})
		});
		expect(after.description).toBe('');
		expect(after.cvssVector).toBe('');
		expect(after.cvssVersion).toBe('');
		expect(after.cvssScore).toBe('');
		expect(after.severity).toBe('');
		expect(after.cwes).toBe('');
		expect(after.affectedProducts).toBe('');
		expect(after.referenceUrls).toBe('');
		expect(after.publishedAt).toBe('');
		expect(after.kev).toBe(false);
		expect(after.kevDateAdded).toBe('');
		expect(after.exploitMaturity).toBe('unknown');
	});

	it('produces a create payload the server accepts', () => {
		const filled = applyCveLookup(form({ identifier: 'CVE-2024-3400' }), {
			identifier: 'CVE-2024-3400',
			fields: fields({ severity: null })
		});
		const result = catalogueFormToPayload(filled);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.payload.identifier).toBe('CVE-2024-3400');
		expect(result.payload.cvss_vector).toBe('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H');
		expect(result.payload.cvss_score).toBe(10);
		expect('severity' in result.payload).toBe(false);
		expect(result.payload.cwes).toEqual(['CWE-77']);
		expect(result.payload.affected_products).toEqual([
			{ vendor: 'Palo Alto Networks', product: 'PAN-OS', versions: '10.2.0 to < 10.2.9-h1' }
		]);
		expect(result.payload.kev_date_added).toBe('2024-04-12');
	});
});

describe('labels', () => {
	it('formats scores', () => {
		expect(formatCvss(9.81)).toBe('9.8');
		expect(formatCvss(null)).toBe('—');
		expect(formatEpss(0.975)).toBe('97.5%');
		expect(formatEpss(0.00042)).toBe('0.04%');
		expect(formatEpss(undefined)).toBe('—');
	});

	it('falls back on unknown values', () => {
		expect(labelOf(KIND_LABELS, 'zero-day')).toBe('Zero-day');
		expect(labelOf(KIND_LABELS, 'new-kind')).toBe('new-kind');
		expect(labelOf(KIND_LABELS, null)).toBe('—');
	});
});
