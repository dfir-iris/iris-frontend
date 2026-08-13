/**
 * v2 service for the Settings Report Templates page.
 *
 * Backed by `/api/v2/manage/report-templates/*` (see
 * `app/blueprints/rest/v2/manage_routes/report_templates.py`).
 *
 * Two non-JSON request shapes:
 *   • `create()` uses multipart/form-data (file + metadata fields).
 *   • `download()` and `render()` return a binary `Blob` that the
 *     page hands off to a download anchor.
 *
 * Both bypass `ApiService` (which forces JSON request/response) via
 * a small inline fetch helper that still picks up the configured
 * base URL + the auth header — same pattern as
 * `case-objects.service.ts::uploadAssetTypeIcon`.
 */
import { ApiService } from './api.service';
import type { ApiOptions, Paginated, RequestResponse } from './api.service';

export interface ReportTemplate {
	id: number;
	name: string;
	description: string | null;
	naming_format: string | null;
	internal_reference: string;
	date_created: string | null;
	created_by_user_id: number;
	created_by: string | null;
	language_id: number;
	language_code: string | null;
	language_name: string | null;
	report_type_id: number;
	report_type_name: string | null;
}

export interface ReportTemplateCreateBody {
	name: string;
	description?: string;
	naming_format?: string;
	language_id: number;
	report_type_id: number;
	file: File;
}

export interface ReportTemplateUpdateBody {
	name?: string;
	description?: string;
	naming_format?: string;
	language_id?: number;
	report_type_id?: number;
}

export interface SearchReportTemplatesParams {
	page?: number;
	per_page?: number;
	order_by?: string;
	sort_dir?: 'asc' | 'desc';
	search?: string;
}

export interface ReportTemplateField {
	name: string;
	label: string;
	help: string;
	kind: 'string' | 'text' | 'select';
	required: boolean;
	options_ref?: 'languages' | 'report_types';
}

export interface ReportTemplateLanguage {
	id: number;
	name: string;
	code: string;
}

export interface ReportTemplateReportType {
	id: number;
	name: string;
}

export interface ReportTemplateSchemaInfo {
	fields: ReportTemplateField[];
	lookups: {
		languages: ReportTemplateLanguage[];
		report_types: ReportTemplateReportType[];
	};
	allowed_extensions: string[];
	naming_format_tags: string[];
}

export interface AccessibleCaseSummary {
	case_id: number;
	name: string;
	soc_id: string | null;
}

export interface RenderReportBody {
	case_id: number;
	/**
	 * Mirrors the legacy `?safe-mode=true` query param. When set, the
	 * DocxGenerator runs without an image handler (no template images
	 * embedded) — useful for spot-checking a template without paying
	 * the cost of fetching/resizing every asset image.
	 */
	safe_mode?: boolean;
}

/** Helper: shared base-URL + auth setup for non-JSON fetches. */
async function setupBinaryRequest(): Promise<{ headers: Record<string, string>; baseUrl: string }> {
	const { auth } = await import('$lib/stores/auth.store');
	const { AuthService } = await import('./auth.service');
	const { browser } = await import('$app/environment');
	const { apiOrigin } = await import('$lib/config/api.config');

	if (auth.isTokenExpired() && !auth.isRefreshTokenExpired()) {
		await AuthService.refreshToken();
	}

	const baseUrl = apiOrigin();

	const headers: Record<string, string> = { Accept: '*/*' };
	const token = auth.getAccessToken();
	if (token) headers.Authorization = `Bearer ${token}`;
	return { headers, baseUrl };
}

/**
 * Trigger a browser download of a `Blob`. Used by `downloadAndSave`
 * and `renderAndSave` so the page side stays declarative.
 */
function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

/**
 * Pull the suggested filename from a Content-Disposition header.
 * Flask's `send_file(..., as_attachment=True, download_name=X)`
 * always emits `attachment; filename="X"`, so the regex below is
 * adequate without an RFC-5987 parser.
 */
function filenameFromHeaders(headers: Headers, fallback: string): string {
	const cd = headers.get('content-disposition');
	if (!cd) return fallback;
	const match = /filename\*?=(?:UTF-8'')?["']?([^"';]+)/i.exec(cd);
	return match ? decodeURIComponent(match[1]) : fallback;
}

export class ReportTemplatesService {
	static async search(
		params: SearchReportTemplatesParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<Paginated<ReportTemplate>>> {
		return ApiService.get<Paginated<ReportTemplate>>(
			ApiService.withQuery('/manage/report-templates', params as Record<string, unknown>),
			options
		);
	}

	static async get(
		identifier: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<ReportTemplate>> {
		return ApiService.get<ReportTemplate>(`/manage/report-templates/${identifier}`, options);
	}

	static async create(
		body: ReportTemplateCreateBody
	): Promise<RequestResponse<ReportTemplate>> {
		const { headers, baseUrl } = await setupBinaryRequest();
		const url = `${baseUrl}/api/v2/manage/report-templates`;
		const fd = new FormData();
		fd.append('name', body.name);
		if (body.description) fd.append('description', body.description);
		if (body.naming_format) fd.append('naming_format', body.naming_format);
		fd.append('language_id', String(body.language_id));
		fd.append('report_type_id', String(body.report_type_id));
		fd.append('file', body.file, body.file.name);

		const response = await (typeof window !== 'undefined' ? window.fetch : globalThis.fetch)(url, {
			method: 'POST',
			headers,
			body: fd
		});

		let data: ReportTemplate | string | null = null;
		try {
			const ct = response.headers.get('content-type') ?? '';
			data = ct.includes('application/json')
				? ((await response.json()) as ReportTemplate)
				: await response.text();
		} catch {
			data = null;
		}

		return { data, status: response.status, headers: response.headers, ok: response.ok };
	}

	static async update(
		identifier: number,
		body: ReportTemplateUpdateBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<ReportTemplate>> {
		return ApiService.put<ReportTemplate>(
			`/manage/report-templates/${identifier}`,
			body,
			options
		);
	}

	/**
	 * Replace the underlying template file in place. Metadata stays
	 * unchanged — admins use `update()` for renames / language swaps.
	 * The backend writes the new file under a fresh random name,
	 * flips the row to point at it, then best-effort deletes the
	 * previous file so a failed swap leaves the original intact.
	 */
	static async replaceFile(
		identifier: number,
		file: File
	): Promise<RequestResponse<ReportTemplate>> {
		const { headers, baseUrl } = await setupBinaryRequest();
		const url = `${baseUrl}/api/v2/manage/report-templates/${identifier}/file`;
		const fd = new FormData();
		fd.append('file', file, file.name);

		const response = await (typeof window !== 'undefined' ? window.fetch : globalThis.fetch)(url, {
			method: 'PUT',
			headers,
			body: fd
		});

		let data: ReportTemplate | string | null = null;
		try {
			const ct = response.headers.get('content-type') ?? '';
			data = ct.includes('application/json')
				? ((await response.json()) as ReportTemplate)
				: await response.text();
		} catch {
			data = null;
		}

		return { data, status: response.status, headers: response.headers, ok: response.ok };
	}

	static async remove(
		identifier: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/manage/report-templates/${identifier}`, options);
	}

	/**
	 * Download the raw template file (the docx / html / md the
	 * operator originally uploaded). Saves directly via the browser
	 * — no `Blob` returned because the page doesn't need to inspect
	 * the file, only hand it to the user.
	 */
	static async downloadAndSave(
		identifier: number,
		fallbackName = 'report-template'
	): Promise<{ ok: boolean; error?: string }> {
		const { headers, baseUrl } = await setupBinaryRequest();
		const url = `${baseUrl}/api/v2/manage/report-templates/${identifier}/download`;
		const response = await (typeof window !== 'undefined' ? window.fetch : globalThis.fetch)(url, {
			method: 'GET',
			headers
		});
		if (!response.ok) {
			return { ok: false, error: `Download failed: ${response.status}` };
		}
		const blob = await response.blob();
		downloadBlob(blob, filenameFromHeaders(response.headers, fallbackName));
		return { ok: true };
	}

	/**
	 * Render the template against a case and stream the resulting
	 * file straight to a browser download. The backend handles
	 * dispatch between Investigation / Activities based on the
	 * template's `report_type`.
	 */
	static async renderAndSave(
		identifier: number,
		body: RenderReportBody,
		fallbackName = 'rendered-report'
	): Promise<{ ok: boolean; error?: string }> {
		const { headers, baseUrl } = await setupBinaryRequest();
		const url = `${baseUrl}/api/v2/manage/report-templates/${identifier}/render`;
		const response = await (typeof window !== 'undefined' ? window.fetch : globalThis.fetch)(url, {
			method: 'POST',
			headers: { ...headers, 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!response.ok) {
			// Try to surface the backend's structured error message.
			let msg = `Render failed: ${response.status}`;
			try {
				const payload = await response.json();
				if (payload?.message) msg = String(payload.message);
				else if (payload?.data) msg = String(payload.data);
			} catch {
				/* leave fallback */
			}
			return { ok: false, error: msg };
		}
		const blob = await response.blob();
		downloadBlob(blob, filenameFromHeaders(response.headers, fallbackName));
		return { ok: true };
	}

	static async schema(
		options: ApiOptions = {}
	): Promise<RequestResponse<ReportTemplateSchemaInfo>> {
		return ApiService.get<ReportTemplateSchemaInfo>(
			'/manage/report-templates/schema',
			options
		);
	}

	static async accessibleCases(
		search?: string,
		options: ApiOptions = {}
	): Promise<RequestResponse<{ data: AccessibleCaseSummary[] }>> {
		return ApiService.get<{ data: AccessibleCaseSummary[] }>(
			ApiService.withQuery('/manage/report-templates/accessible-cases', { search }),
			options
		);
	}
}
