import type { Ioc } from '$lib/types/resources/ioc';

export function deduplicateIocs(iocList: Ioc[]): Ioc[] {
  const seen = new Set<string>();
  return iocList.filter(ioc => {
    // Ensure asset_id is treated as a string for the Set
    const id = String(ioc.ioc_id);
    if (seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
}

export interface IocExportColumn {
  key: string;
  label: string;
  header: string;
  getter: (ioc: Ioc) => string;
}

export const AVAILABLE_IOC_EXPORT_COLUMNS: IocExportColumn[] = [
  { 
    key: 'ioc_id', 
    label: 'IOC ID', 
    header: 'IOC ID',
    getter: (ioc: Ioc) => ioc.ioc_id?.toString() || ''
  },
  { 
    key: 'ioc_value', 
    label: 'IOC Value', 
    header: 'IOC Value',
    getter: (ioc: Ioc) => ioc.ioc_value || ''
  },
  { 
    key: 'ioc_description', 
    label: 'Description', 
    header: 'Description',
    getter: (ioc: Ioc) => ioc.ioc_description || ''
  },
  { 
    key: 'ioc_type', 
    label: 'Type', 
    header: 'Type',
    getter: (ioc: Ioc) => ioc.ioc_type?.type_name || ''
  },
  { 
    key: 'ioc_tags', 
    label: 'Tags', 
    header: 'Tags',
    getter: (ioc: Ioc) => ioc.ioc_tags || ''
  },
  { 
    key: 'tlp', 
    label: 'TLP', 
    header: 'TLP',
    getter: (ioc: Ioc) => ioc.tlp?.tlp_name || ''
  },
  { 
    key: 'ioc_misp', 
    label: 'MISP', 
    header: 'MISP',
    getter: (ioc: Ioc) => JSON.stringify(ioc.ioc_misp || {})
  },
  { 
    key: 'user_id', 
    label: 'User ID', 
    header: 'User ID',
    getter: (ioc: Ioc) => ioc.user_id?.toString() || ''
  },
  { 
    key: 'custom_attributes', 
    label: 'Custom Attributes', 
    header: 'Custom Attributes',
    getter: (ioc: Ioc) => JSON.stringify(ioc.custom_attributes || {})
  }
];

export function escapeCSVValue(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  // If the value contains commas, quotes, or newlines, wrap it in quotes and escape internal quotes
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

export function convertIocsToCSV(iocs: Ioc[], columns: IocExportColumn[]): string {
  if (iocs.length === 0 || columns.length === 0) return '';
  
  // Create header row
  const headers = columns.map(col => escapeCSVValue(col.label)).join(',');
  
  // Create data rows
  const dataRows = iocs.map(ioc => {
    return columns.map(col => {
      const value = col.getter(ioc);
      return escapeCSVValue(value);
    }).join(',');
  });
  
  return [headers, ...dataRows].join('\n');
}
