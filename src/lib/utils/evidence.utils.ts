import type { Evidence } from '$lib/types/resources/evidence';

export interface EvidenceExportColumn {
	key: string;
	header: string;
	getter: (e: Evidence) => string;
	defaultSelected?: boolean;
}

export const AVAILABLE_EVIDENCE_EXPORT_COLUMNS: EvidenceExportColumn[] = [
	{
		key: 'id',
		header: 'Evidence ID',
		getter: (e) => String(e.id),
		defaultSelected: false
	},
	{
		key: 'filename',
		header: 'Filename',
		getter: (e) => e.filename,
		defaultSelected: true
	},
	{
		key: 'type',
		header: 'Type',
		getter: (e) => e.type?.name ?? '',
		defaultSelected: true
	},
	{
		key: 'file_description',
		header: 'Description',
		getter: (e) => e.file_description ?? '',
		defaultSelected: true
	},
	{
		key: 'file_hash',
		header: 'Hash',
		getter: (e) => e.file_hash ?? '',
		defaultSelected: true
	},
	{
		key: 'file_size',
		header: 'Size (bytes)',
		getter: (e) => (e.file_size !== null && e.file_size !== undefined ? String(e.file_size) : ''),
		defaultSelected: false
	},
	{
		key: 'date_added',
		header: 'Date Added',
		getter: (e) => e.date_added ?? '',
		defaultSelected: true
	},
	{
		key: 'acquisition_date',
		header: 'Acquisition Date',
		getter: (e) => e.acquisition_date ?? '',
		defaultSelected: false
	},
	{
		key: 'start_date',
		header: 'Start Date',
		getter: (e) => e.start_date ?? '',
		defaultSelected: false
	},
	{
		key: 'end_date',
		header: 'End Date',
		getter: (e) => e.end_date ?? '',
		defaultSelected: false
	},
	{
		key: 'user',
		header: 'Added By',
		getter: (e) => e.user?.user_name ?? '',
		defaultSelected: false
	}
];

export function escapeCSVValue(value: string | null | undefined): string {
	if (value === null || value === undefined) return '';
	const s = String(value);
	if (s.includes(',') || s.includes('"') || s.includes('\n')) {
		return `"${s.replace(/"/g, '""')}"`;
	}
	return s;
}

export function convertEvidencesToCSV(evidences: Evidence[], columns: EvidenceExportColumn[]): string {
	if (!evidences.length || !columns.length) return '';
	const header = columns.map((c) => escapeCSVValue(c.header)).join(',');
	const rows = evidences.map((e) => columns.map((c) => escapeCSVValue(c.getter(e))).join(','));
	return [header, ...rows].join('\r\n');
}
