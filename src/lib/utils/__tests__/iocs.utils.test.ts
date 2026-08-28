import { describe, it, expect } from 'vitest';
import { deduplicateIocs, escapeCSVValue, convertIocsToCSV } from '../iocs.utils';
import type { Ioc, IocType, Tlp } from '$lib/types/resources/ioc';
import type { IocExportColumn } from '../iocs.utils';

// ── helpers ───────────────────────────────────────────────────────────────────

const mockIocType: IocType = {
	type_name: 'ip-dst',
	type_description: 'Destination IP',
	type_taxonomy: null,
	type_validation_regex: null,
	type_validation_expect: null,
	type_id: 1
};

const mockTlp: Tlp = {
	tlp_id: 1,
	tlp_name: 'WHITE',
	tlp_bscolor: 'light'
};

const makeIoc = (id: number, value = `192.168.0.${id}`): Ioc => ({
	ioc_id: id,
	ioc_uuid: `uuid-${id}`,
	ioc_value: value,
	ioc_type_id: 1,
	ioc_type: mockIocType,
	ioc_tlp_id: 1,
	tlp: mockTlp,
	ioc_description: null,
	ioc_tags: null,
	user_id: 1,
	ioc_misp: null,
	ioc_enrichment: null,
	link: null,
	custom_attributes: null,
	modification_history: null
});

// ── deduplicateIocs ───────────────────────────────────────────────────────────

describe('deduplicateIocs', () => {
	it('returns the same list when there are no duplicates', () => {
		const iocs = [makeIoc(1), makeIoc(2), makeIoc(3)];
		expect(deduplicateIocs(iocs)).toHaveLength(3);
	});

	it('removes duplicate entries keeping only the first occurrence', () => {
		const iocs = [makeIoc(1), makeIoc(2), makeIoc(1)];
		const result = deduplicateIocs(iocs);
		expect(result).toHaveLength(2);
		expect(result.map((i) => i.ioc_id)).toEqual([1, 2]);
	});

	it('deduplicates by ioc_id using string coercion (numeric id matches)', () => {
		// ioc_id is typed as number; deduplication coerces to string via String()
		const ioc = makeIoc(42);
		expect(deduplicateIocs([ioc, ioc])).toHaveLength(1);
	});

	it('handles three consecutive duplicates of the same id', () => {
		const iocs = [makeIoc(5), makeIoc(5), makeIoc(5)];
		expect(deduplicateIocs(iocs)).toHaveLength(1);
	});

	it('returns an empty array when given an empty array', () => {
		expect(deduplicateIocs([])).toEqual([]);
	});

	it('does not mutate the original list', () => {
		const original = [makeIoc(1), makeIoc(1)];
		deduplicateIocs(original);
		expect(original).toHaveLength(2);
	});

	it('preserves order — first seen wins', () => {
		const first = { ...makeIoc(7), ioc_value: 'first' };
		const second = { ...makeIoc(7), ioc_value: 'second' };
		const result = deduplicateIocs([first, second]);
		expect(result[0].ioc_value).toBe('first');
	});
});

// ── escapeCSVValue ────────────────────────────────────────────────────────────

describe('escapeCSVValue', () => {
	it('returns the value unchanged when no special characters are present', () => {
		expect(escapeCSVValue('simple')).toBe('simple');
	});

	it('wraps in double-quotes when the value contains a comma', () => {
		expect(escapeCSVValue('a,b')).toBe('"a,b"');
	});

	it('wraps in double-quotes when the value contains a double-quote and escapes it', () => {
		expect(escapeCSVValue('say "hello"')).toBe('"say ""hello"""');
	});

	it('doubles every internal double-quote per RFC 4180', () => {
		expect(escapeCSVValue('"')).toBe('""""');
	});

	it('wraps in double-quotes when the value contains a newline', () => {
		expect(escapeCSVValue('line1\nline2')).toBe('"line1\nline2"');
	});

	it('returns an empty string for null', () => {
		expect(escapeCSVValue(null)).toBe('');
	});

	it('returns an empty string for undefined', () => {
		expect(escapeCSVValue(undefined)).toBe('');
	});

	it('returns an empty string for an empty string', () => {
		expect(escapeCSVValue('')).toBe('');
	});

	it('handles a value that is entirely commas', () => {
		expect(escapeCSVValue(',,')).toBe('",,"');
	});
});

// ── convertIocsToCSV ──────────────────────────────────────────────────────────

const valueColumn: IocExportColumn = {
	key: 'ioc_value',
	label: 'IOC Value',
	header: 'IOC Value',
	getter: (ioc) => ioc.ioc_value
};

const idColumn: IocExportColumn = {
	key: 'ioc_id',
	label: 'IOC ID',
	header: 'IOC ID',
	getter: (ioc) => ioc.ioc_id.toString()
};

describe('convertIocsToCSV', () => {
	it('returns an empty string when the ioc list is empty', () => {
		expect(convertIocsToCSV([], [valueColumn])).toBe('');
	});

	it('returns an empty string when the column list is empty', () => {
		expect(convertIocsToCSV([makeIoc(1)], [])).toBe('');
	});

	it('produces a header row from column labels', () => {
		const csv = convertIocsToCSV([makeIoc(1)], [idColumn, valueColumn]);
		const [header] = csv.split('\n');
		expect(header).toBe('IOC ID,IOC Value');
	});

	it('produces one data row per IOC after the header', () => {
		const iocs = [makeIoc(1), makeIoc(2)];
		const lines = convertIocsToCSV(iocs, [valueColumn]).split('\n');
		// header + 2 data rows
		expect(lines).toHaveLength(3);
	});

	it('uses the column getter to populate each cell', () => {
		const csv = convertIocsToCSV([makeIoc(99)], [idColumn]);
		const [, dataRow] = csv.split('\n');
		expect(dataRow).toBe('99');
	});

	it('escapes cell values that contain commas', () => {
		const commaColumn: IocExportColumn = {
			key: 'test',
			label: 'Test',
			header: 'Test',
			getter: () => 'a,b'
		};
		const csv = convertIocsToCSV([makeIoc(1)], [commaColumn]);
		const [, dataRow] = csv.split('\n');
		expect(dataRow).toBe('"a,b"');
	});

	it('calls escapeCSVValue on column labels too (label with comma is quoted)', () => {
		const oddLabelColumn: IocExportColumn = {
			key: 'x',
			label: 'Label,With,Commas',
			header: 'Label,With,Commas',
			getter: () => 'val'
		};
		const csv = convertIocsToCSV([makeIoc(1)], [oddLabelColumn]);
		const [header] = csv.split('\n');
		expect(header).toBe('"Label,With,Commas"');
	});

	it('uses newline as the row separator', () => {
		const csv = convertIocsToCSV([makeIoc(1), makeIoc(2)], [idColumn]);
		// Should contain exactly 2 newlines for 3 lines total
		expect((csv.match(/\n/g) || []).length).toBe(2);
	});
});
