/**
 * v2 service for custom dashboards.
 *
 * Wraps `/api/v2/custom-dashboards` — CRUD for user-owned/shared dashboards
 * plus render/schema/presets helpers. System dashboards (currently only the
 * seeded "Statistics" board) are read-only via this API; the editor checks
 * `is_system` and switches to view-mode.
 */
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export interface DashboardWidgetField {
	table: string;
	column: string;
	aggregation?: string | null;
	alias?: string | null;
	filter?: DashboardFilter | null;
}

export interface DashboardFilter {
	table: string;
	column: string;
	operator: string;
	value: unknown;
}

export interface DashboardWidget {
	name: string;
	chart_type: string;
	fields: DashboardWidgetField[];
	filters?: DashboardFilter[];
	group_by?: string[];
	time_bucket?: string | null;
	options?: Record<string, unknown>;
	layout?: Record<string, unknown>;
}

export interface DashboardSection {
	id?: string;
	title?: string | null;
	description?: string | null;
	show_divider?: boolean;
	widgets: DashboardWidget[];
}

export interface DashboardDefinition {
	name: string;
	description?: string | null;
	is_shared?: boolean;
	widgets?: DashboardWidget[];
	sections?: DashboardSection[];
	filters_schema?: unknown[];
}

export interface CustomDashboard {
	dashboard_uuid: string;
	name: string;
	description: string | null;
	owner_id: number | null;
	is_shared: boolean;
	is_system: boolean;
	definition: DashboardDefinition;
	created_at: string | null;
	updated_at: string | null;
}

export interface DashboardRenderRequest {
	definition: DashboardDefinition;
	timeframe?: { start?: string; end?: string };
	filters?: {
		customer_id?: number;
		severity_id?: number;
		case_status_id?: number;
		window?: '2h' | '24h' | '48h';
	};
}

export interface RenderedTableCell {
	key: string;
	value: unknown;
	formatted_value: string;
	percentage: number | null;
	formatted_percentage: string;
}

export interface RenderedTableRow {
	group_values: unknown[];
	formatted_group_values: string[];
	value_cells: RenderedTableCell[];
}

export interface RenderedWidget {
	name?: string;
	chart_type?: string;
	value?: number | null;
	computed?: string;
	labels?: string[];
	datasets?: Array<{ label: string; data: number[]; total?: number | null }>;
	display_labels?: string[];
	error?: string;
	formatted_value?: string;
	options?: Record<string, unknown>;
	layout?: Record<string, unknown>;
	// Table-shape payload (chart_type === 'table').
	group_headers?: string[];
	value_headers?: string[];
	group_keys?: string[];
	value_keys?: string[];
	rows?: RenderedTableRow[] | Array<Record<string, unknown>>;
	totals?: RenderedTableCell[];
	total_label?: string;
}

export interface RenderedSection {
	id?: string | null;
	title?: string | null;
	description?: string | null;
	show_divider?: boolean;
	widgets: RenderedWidget[];
}

export interface DashboardRenderResponse {
	widgets: RenderedWidget[];
	sections?: RenderedSection[];
}

export interface DashboardSchema {
	tables: string[];
	columns: Record<string, string[]>;
	named_aggregations: Array<{ name: string; label: string; value_format?: string }>;
	aggregations: string[];
	operators: string[];
	chart_types: string[];
	time_buckets: string[];
}

// Strict CSS color validator. Used wherever a widget-supplied color flows
// into a `style` attribute or a Chart wrapper prop, so a malicious /
// fat-fingered string can't escape the property and inject extra CSS.
// Accepts #rgb / #rgba / #rrggbb / #rrggbbaa plus a small allowlist of
// named colors. Anything else returns undefined; callers fall back to
// the default palette.
const _NAMED_COLORS = new Set([
	'transparent',
	'currentcolor',
	'red',
	'orange',
	'yellow',
	'green',
	'blue',
	'purple',
	'pink',
	'gray',
	'grey',
	'black',
	'white'
]);

export function safeCssColor(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) {
		const hex = trimmed.length;
		if (hex === 4 || hex === 5 || hex === 7 || hex === 9) return trimmed;
		return undefined;
	}
	if (_NAMED_COLORS.has(trimmed.toLowerCase())) return trimmed.toLowerCase();
	return undefined;
}

export function safeCssPalette(value: unknown): string[] | undefined {
	const arr: unknown[] = Array.isArray(value)
		? value
		: typeof value === 'string'
			? value.split(',')
			: [];
	const out: string[] = [];
	for (const raw of arr) {
		const c = safeCssColor(raw);
		if (c) out.push(c);
	}
	return out.length > 0 ? out : undefined;
}

export class CustomDashboardsService {
	static list(options?: ApiOptions): Promise<RequestResponse<CustomDashboard[]>> {
		return ApiService.get<CustomDashboard[]>('/custom-dashboards', options);
	}

	static get(uuid: string, options?: ApiOptions): Promise<RequestResponse<CustomDashboard>> {
		return ApiService.get<CustomDashboard>(`/custom-dashboards/${uuid}`, options);
	}

	static create(
		definition: DashboardDefinition,
		options?: ApiOptions
	): Promise<RequestResponse<CustomDashboard>> {
		return ApiService.post<CustomDashboard, DashboardDefinition>(
			'/custom-dashboards',
			definition,
			options
		);
	}

	static update(
		uuid: string,
		definition: Partial<DashboardDefinition>,
		options?: ApiOptions
	): Promise<RequestResponse<CustomDashboard>> {
		return ApiService.put<CustomDashboard, Partial<DashboardDefinition>>(
			`/custom-dashboards/${uuid}`,
			definition,
			options
		);
	}

	static delete(uuid: string, options?: ApiOptions): Promise<RequestResponse<unknown>> {
		return ApiService.delete<unknown>(`/custom-dashboards/${uuid}`, options);
	}

	static render(
		uuid: string,
		body: DashboardRenderRequest,
		options?: ApiOptions
	): Promise<RequestResponse<DashboardRenderResponse>> {
		return ApiService.post<DashboardRenderResponse, DashboardRenderRequest>(
			`/custom-dashboards/${uuid}/render`,
			body,
			options
		);
	}

	static getSchema(options?: ApiOptions): Promise<RequestResponse<DashboardSchema>> {
		return ApiService.get<DashboardSchema>('/custom-dashboards/schema', options);
	}

	static getPresets(options?: ApiOptions): Promise<RequestResponse<DashboardWidget[]>> {
		return ApiService.get<DashboardWidget[]>('/custom-dashboards/presets', options);
	}
}
