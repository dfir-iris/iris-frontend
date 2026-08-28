import { describe, it, expect } from 'vitest';
import {
	deduplicateAssets,
	escapeCSVValue,
	convertToCSV,
	AVAILABLE_EXPORT_COLUMNS
} from '../asset.utils';
import type { Asset } from '$lib/types/resources/asset';

function makeAsset(overrides: Partial<Asset> & { asset_id: number; asset_name: string }): Asset {
	return {
		asset_description: null,
		asset_ip: null,
		asset_domain: null,
		asset_tags: null,
		asset_compromise_status_id: null,
		asset_type: null,
		analysis_status: null,
		...overrides
	} as unknown as Asset;
}

describe('deduplicateAssets', () => {
	it('returns empty array for empty input', () => {
		expect(deduplicateAssets([])).toEqual([]);
	});

	it('returns the same items when all ids are unique', () => {
		const assets = [
			makeAsset({ asset_id: 1, asset_name: 'A' }),
			makeAsset({ asset_id: 2, asset_name: 'B' }),
			makeAsset({ asset_id: 3, asset_name: 'C' })
		];
		expect(deduplicateAssets(assets)).toHaveLength(3);
	});

	it('removes duplicate asset_ids, keeping the first occurrence', () => {
		const assets = [
			makeAsset({ asset_id: 1, asset_name: 'First' }),
			makeAsset({ asset_id: 2, asset_name: 'Other' }),
			makeAsset({ asset_id: 1, asset_name: 'Duplicate' })
		];
		const result = deduplicateAssets(assets);
		expect(result).toHaveLength(2);
		expect(result[0].asset_name).toBe('First');
		expect(result[1].asset_name).toBe('Other');
	});

	it('coerces asset_id to string for comparison (numeric equality)', () => {
		const assets = [
			makeAsset({ asset_id: 42, asset_name: 'First' }),
			makeAsset({ asset_id: 42, asset_name: 'Dup' })
		];
		expect(deduplicateAssets(assets)).toHaveLength(1);
	});

	it('handles a single-item list', () => {
		const assets = [makeAsset({ asset_id: 99, asset_name: 'Solo' })];
		expect(deduplicateAssets(assets)).toHaveLength(1);
		expect(deduplicateAssets(assets)[0].asset_name).toBe('Solo');
	});
});

describe('escapeCSVValue', () => {
	it('returns empty string for null', () => {
		expect(escapeCSVValue(null)).toBe('');
	});

	it('returns empty string for undefined', () => {
		expect(escapeCSVValue(undefined)).toBe('');
	});

	it('returns plain string unchanged when it has no special characters', () => {
		expect(escapeCSVValue('hello world')).toBe('hello world');
	});

	it('wraps in quotes when the value contains a comma', () => {
		expect(escapeCSVValue('a,b')).toBe('"a,b"');
	});

	it('wraps in quotes when the value contains a newline', () => {
		expect(escapeCSVValue('line1\nline2')).toBe('"line1\nline2"');
	});

	it('wraps in quotes when the value contains a double quote and doubles it', () => {
		expect(escapeCSVValue('say "hi"')).toBe('"say ""hi"""');
	});

	it('handles a carriage-return + newline (CRLF)', () => {
		expect(escapeCSVValue('a\r\nb')).toBe('"a\r\nb"');
	});

	it('converts numbers to string', () => {
		// asset.utils.ts calls String(value) first
		expect(escapeCSVValue(42 as unknown as string)).toBe('42');
	});
});

describe('convertToCSV', () => {
	const nameCol = AVAILABLE_EXPORT_COLUMNS.find((c) => c.key === 'asset_name')!;
	const typeNameCol = AVAILABLE_EXPORT_COLUMNS.find((c) => c.key === 'asset_type_name')!;
	const tagsCol = AVAILABLE_EXPORT_COLUMNS.find((c) => c.key === 'asset_tags')!;

	it('returns empty string for empty asset list', () => {
		expect(convertToCSV([], [nameCol])).toBe('');
	});

	it('returns empty string for empty column selection', () => {
		const asset = makeAsset({ asset_id: 1, asset_name: 'A' });
		expect(convertToCSV([asset], [])).toBe('');
	});

	it('produces a header row followed by data rows', () => {
		const asset = makeAsset({ asset_id: 1, asset_name: 'Workstation01' });
		const csv = convertToCSV([asset], [nameCol]);
		const lines = csv.split('\r\n');
		expect(lines[0]).toBe('Asset Name');
		expect(lines[1]).toBe('Workstation01');
	});

	it('handles multiple columns', () => {
		const asset = makeAsset({
			asset_id: 1,
			asset_name: 'Server',
			asset_type: { asset_id: 5, asset_name: 'Windows Server' } as Asset['asset_type']
		});
		const csv = convertToCSV([asset], [nameCol, typeNameCol]);
		const [header, row] = csv.split('\r\n');
		expect(header).toBe('Asset Name,Asset Type Name');
		expect(row).toBe('Server,Windows Server');
	});

	it('handles multiple asset rows', () => {
		const assets = [
			makeAsset({ asset_id: 1, asset_name: 'A' }),
			makeAsset({ asset_id: 2, asset_name: 'B' }),
			makeAsset({ asset_id: 3, asset_name: 'C' })
		];
		const csv = convertToCSV(assets, [nameCol]);
		const lines = csv.split('\r\n');
		expect(lines).toHaveLength(4); // header + 3 rows
		expect(lines[1]).toBe('A');
		expect(lines[3]).toBe('C');
	});

	it('converts comma-separated asset_tags string to pipe-separated in CSV', () => {
		const asset = makeAsset({
			asset_id: 1,
			asset_name: 'X',
			asset_tags: 'infra,critical,dc' as Asset['asset_tags']
		});
		const csv = convertToCSV([asset], [tagsCol]);
		const [, row] = csv.split('\r\n');
		expect(row).toBe('infra|critical|dc');
	});

	it('escapes values containing commas', () => {
		const asset = makeAsset({ asset_id: 1, asset_name: 'Smith, John PC' });
		const csv = convertToCSV([asset], [nameCol]);
		const [, row] = csv.split('\r\n');
		expect(row).toBe('"Smith, John PC"');
	});
});
