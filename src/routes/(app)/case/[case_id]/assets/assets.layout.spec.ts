import { describe, it, expect } from 'vitest';
import type { Asset } from '$lib/types/resources/asset';
import { deduplicateAssets, escapeCSVValue, convertToCSV } from '$lib/utils/asset.utils'; // Added

describe('Asset Utility Functions', () => {
	describe('deduplicateAssets', () => {
		it('should return an empty array if input is empty', () => {
			expect(deduplicateAssets([])).toEqual([]);
		});

		it('should return the same array if no duplicates', () => {
			const assets = [{ asset_id: '1' }, { asset_id: '2' }] as Asset[];
			expect(deduplicateAssets(assets)).toEqual(assets);
		});

		it('should remove duplicate assets by asset_id', () => {
			const assets = [
				{ asset_id: '1', asset_name: 'Asset 1' },
				{ asset_id: '2', asset_name: 'Asset 2' },
				{ asset_id: '1', asset_name: 'Asset 1 Duplicate' },
			] as Asset[];
			const expected = [
				{ asset_id: '1', asset_name: 'Asset 1' },
				{ asset_id: '2', asset_name: 'Asset 2' },
			];
			expect(deduplicateAssets(assets)).toEqual(expected);
		});
	});

	describe('escapeCSVValue', () => {
		it('should return empty string for null or undefined', () => {
			expect(escapeCSVValue(null)).toBe('');
			expect(escapeCSVValue(undefined)).toBe('');
		});

		it('should return string representation for numbers', () => {
			expect(escapeCSVValue(123)).toBe('123');
		});

		it('should not change simple strings', () => {
			expect(escapeCSVValue('simple')).toBe('simple');
		});

		it('should enclose strings with commas in double quotes', () => {
			expect(escapeCSVValue('value,with,comma')).toBe('"value,with,comma"');
		});

		it('should enclose strings with newlines in double quotes', () => {
			expect(escapeCSVValue('value\nwith\nnewline')).toBe('"value\nwith\nnewline"');
		});

		it('should enclose strings with double quotes in double quotes and escape inner quotes', () => {
			expect(escapeCSVValue('value "with" quotes')).toBe('"value ""with"" quotes"');
		});

		it('should handle complex strings', () => {
			expect(escapeCSVValue('complex,"value"\nNext Line')).toBe('"complex,""value""\nNext Line"');
		});
	});

	describe('convertToCSV', () => {
		it('should return empty string for empty data', () => {
			expect(convertToCSV([])).toBe('');
		});

		it('should convert asset data to CSV format', () => {
			const assets: Asset[] = [
				{
					asset_id: 1,
					asset_uuid: 'uuid-1',
					asset_name: 'Test Asset 1',
					asset_type: { asset_name: 'Server', asset_id: 1, asset_description: '', asset_icon_compromised: '', asset_icon_not_compromised: '' },
					asset_description: 'Description with, comma',
					asset_domain: 'example.com',
					asset_ip: '192.168.1.1',
					asset_info: 'Some "info"',
					asset_compromise_status_id: 1, // Compromised
					asset_tags: 'tag1,tag2',
					analysis_status: { id: 2, name: 'To be done' },
					date_added: '2023-01-01T00:00:00Z',
					date_update: '2023-01-01T01:00:00Z',
				},
			];
			const csv = convertToCSV(assets);
			const rows = csv.split('\n');
			expect(rows.length).toBe(2); // Header + 1 data row
			expect(rows[0]).toBe('Asset ID,Asset UUID,Name,Type,Description,Domain,IP,Info,Compromise Status,Tags,Analysis Status,Date Added,Date Updated');
			expect(rows[1]).toBe('1,uuid-1,Test Asset 1,Server,"Description with, comma",example.com,192.168.1.1,"Some ""info""",Compromised,"tag1,tag2",To be done,2023-01-01T00:00:00Z,2023-01-01T01:00:00Z');
		});
	});
});
