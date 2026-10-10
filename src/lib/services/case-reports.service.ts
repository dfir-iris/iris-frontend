/**
 * Case reports: the templates a report can be generated from and the
 * generation itself, backed by `/api/v2/cases/{id}/reports`. Any reader
 * of the case may generate one (unlike the admin-only render preview of
 * `report-templates.service.ts`, whose binary fetch helpers it reuses).
 */
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';
import { downloadBlob, filenameFromHeaders, setupBinaryRequest } from './report-templates.service';

export type CaseReportType = 'Investigation' | 'Activities';

export interface CaseReportTemplate {
	id: number;
	name: string;
	description: string | null;
	report_type: CaseReportType | null;
	language: string | null;
	format: string | null;
}

export class CaseReportsService {
	static async templates(
		caseId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseReportTemplate[]>> {
		return ApiService.get<CaseReportTemplate[]>(`/cases/${caseId}/reports/templates`, options);
	}

	/**
	 * Generate the report and hand it to the browser as a download.
	 * `safeMode` leaves the images out, for templates that fail on them.
	 */
	static async generateAndSave(
		caseId: number,
		templateId: number,
		safeMode = false
	): Promise<{ ok: boolean; error?: string }> {
		const { headers, baseUrl } = await setupBinaryRequest();
		const response = await (typeof window !== 'undefined' ? window.fetch : globalThis.fetch)(
			`${baseUrl}/api/v2/cases/${caseId}/reports`,
			{
				method: 'POST',
				headers: { ...headers, 'Content-Type': 'application/json' },
				body: JSON.stringify({ template_id: templateId, safe_mode: safeMode })
			}
		);
		if (!response.ok) {
			let message = `Report generation failed (${response.status})`;
			try {
				const payload = await response.json();
				if (payload?.message) message = String(payload.message);
				if (payload?.data && typeof payload.data === 'string')
					message = `${message}: ${payload.data}`;
			} catch {
				/* keep the status message */
			}
			return { ok: false, error: message };
		}
		const blob = await response.blob();
		downloadBlob(blob, filenameFromHeaders(response.headers, `case-${caseId}-report`));
		return { ok: true };
	}
}
