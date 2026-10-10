import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../report-templates.service', () => ({
	setupBinaryRequest: vi.fn(async () => ({ headers: { Accept: '*/*' }, baseUrl: 'https://iris' })),
	downloadBlob: vi.fn(),
	filenameFromHeaders: vi.fn((_headers: Headers, fallback: string) => fallback)
}));

import { ApiService } from '../api.service';
import { CaseReportsService } from '../case-reports.service';
import { downloadBlob } from '../report-templates.service';

describe('CaseReportsService', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it('should list the templates of the case', async () => {
		const get = vi.spyOn(ApiService, 'get').mockResolvedValue({ status: 200, data: [], ok: true });
		await CaseReportsService.templates(4);
		expect(get).toHaveBeenCalledWith('/cases/4/reports/templates', {});
	});

	it('should post the template and download the file', async () => {
		const fetch = vi.fn(async () => new Response('report', { status: 200 }));
		vi.stubGlobal('fetch', fetch);
		const result = await CaseReportsService.generateAndSave(4, 7, true);
		expect(result).toEqual({ ok: true });
		expect(fetch).toHaveBeenCalledWith(
			'https://iris/api/v2/cases/4/reports',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({ template_id: 7, safe_mode: true })
			})
		);
		expect(downloadBlob).toHaveBeenCalledWith(expect.anything(), 'case-4-report');
	});

	it('should surface the backend error', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({ message: 'Report error', data: 'Unknown report format.' }),
						{
							status: 400
						}
					)
			)
		);
		const result = await CaseReportsService.generateAndSave(4, 7);
		expect(result).toEqual({ ok: false, error: 'Report error: Unknown report format.' });
	});
});
