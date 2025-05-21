import type { Asset } from '$lib/types/resources/asset';
import { COMPROMISE_STATUS } from '$lib/constants/compromise_status';

export function deduplicateAssets(assetList: Asset[]): Asset[] {
	const seen = new Set<string>();
	return assetList.filter(asset => {
		// Ensure asset_id is treated as a string for the Set
		const id = String(asset.asset_id);
		if (seen.has(id)) {
			return false;
		}
		seen.add(id);
		return true;
	});
}

export function escapeCSVValue(value: any): string {
	if (value === null || typeof value === 'undefined') {
		return '';
	}
	let stringValue = String(value);
	// If the value contains a comma, newline, or double quote, enclose it in double quotes.
	if (/[",\n\r]/.test(stringValue)) {
		// Escape existing double quotes by doubling them.
		stringValue = stringValue.replace(/"/g, '""');
		stringValue = `"${stringValue}"`;
	}
	return stringValue;
}

export interface ExportColumn {
	key: string;
	header: string;
	getter: (asset: Asset) => string | number | undefined;
	defaultSelected?: boolean;
}

export const AVAILABLE_EXPORT_COLUMNS: ExportColumn[] = [
	{ key: 'asset_id', header: 'Asset ID', getter: asset => asset.asset_id, defaultSelected: false },
	{ key: 'asset_name', header: 'Asset Name', getter: asset => asset.asset_name, defaultSelected: true },
	{ key: 'asset_type_name', header: 'Asset Type Name', getter: asset => asset.asset_type?.asset_name, defaultSelected: true },
	{ key: 'asset_type_id', header: 'Asset Type ID', getter: asset => asset.asset_type?.id, defaultSelected: true },
	{ key: 'asset_description', header: 'Description', getter: asset => asset.asset_description, defaultSelected: false },
	{ key: 'asset_ip', header: 'IP Address', getter: asset => asset.asset_ip, defaultSelected: false },
	{ key: 'asset_domain', header: 'Domain', getter: asset => asset.asset_domain, defaultSelected: false },
	{ 
		key: 'asset_tags', 
		header: 'Tags', 
		getter: asset => {
			const tagsArray = asset.tags?.map(t => t.tag_title) || (typeof asset.asset_tags === 'string' ? asset.asset_tags.split(',') : []);
			return tagsArray.join('|'); // Pipe-separated for CSV
		},
		defaultSelected: true 
	},
	{ key: 'analysis_status_name', header: 'Analysis Status Name', getter: asset => asset.analysis_status?.name, defaultSelected: false },
	{ key: 'analysis_status_id', header: 'Analysis Status ID', getter: asset => asset.analysis_status?.id, defaultSelected: false },
	{ 
		key: 'compromise_status_name', 
		header: 'Compromise Status Name', 
		getter: asset => asset.asset_compromise_status_id ? COMPROMISE_STATUS[asset.asset_compromise_status_id as keyof typeof COMPROMISE_STATUS] : undefined,
		defaultSelected: false 
	},
	{ key: 'compromise_status_id', header: 'Compromise Status ID', getter: asset => asset.asset_compromise_status_id, defaultSelected: false },
	// Add other relevant fields like created_at, updated_at if needed
];

export function convertToCSV(assets: Asset[], selectedColumns: ExportColumn[]): string {
	if (!assets.length || !selectedColumns.length) {
		return '';
	}

	const headers = selectedColumns.map(col => escapeCSVValue(col.header)).join(',');
	
	const rows = assets.map(asset => {
		return selectedColumns.map(col => {
			const value = col.getter(asset);
			return escapeCSVValue(value);
		}).join(',');
	});

	return [headers, ...rows].join('\r\n');
}
