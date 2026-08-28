import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		withQuery: vi.fn(),
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn()
	}
}));

import { InvestigationFlowsService } from '../investigation-flows.service';
import { ApiService } from '../api.service';
import type { ApiOptions } from '../api.service';

describe('InvestigationFlowsService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('list()', () => {
		it('calls withQuery with no customer_id when omitted', async () => {
			const builtPath = '/api/v2/investigation-flows';
			(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(builtPath);
			(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				data: []
			});

			await InvestigationFlowsService.list();

			expect(ApiService.withQuery).toHaveBeenCalledWith('/api/v2/investigation-flows', {
				customer_id: undefined
			});
			expect(ApiService.get).toHaveBeenCalledWith(builtPath, {});
		});

		it('passes customer_id when provided', async () => {
			const builtPath = '/api/v2/investigation-flows?customer_id=5';
			(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(builtPath);
			(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				data: []
			});

			await InvestigationFlowsService.list(5);

			expect(ApiService.withQuery).toHaveBeenCalledWith('/api/v2/investigation-flows', {
				customer_id: 5
			});
		});
	});

	describe('get()', () => {
		it('calls ApiService.get with the flow id in the path', async () => {
			const mock = { ok: true, data: { id: 7 } };
			(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const result = await InvestigationFlowsService.get(7);

			expect(ApiService.get).toHaveBeenCalledWith('/api/v2/investigation-flows/7', {});
			expect(result).toBe(mock);
		});
	});

	describe('create()', () => {
		it('posts the body to /api/v2/investigation-flows', async () => {
			const body = { flow_name: 'Triage', flow_is_active: true };
			const mock = { ok: true, data: { id: 1, ...body } };
			(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const result = await InvestigationFlowsService.create(body);

			expect(ApiService.post).toHaveBeenCalledWith('/api/v2/investigation-flows', body, {});
			expect(result).toBe(mock);
		});
	});

	describe('update()', () => {
		it('puts the body to /api/v2/investigation-flows/:id', async () => {
			const body = { flow_name: 'Updated' };
			const mock = { ok: true, data: { id: 3 } };
			(ApiService.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const result = await InvestigationFlowsService.update(3, body);

			expect(ApiService.put).toHaveBeenCalledWith('/api/v2/investigation-flows/3', body, {});
			expect(result).toBe(mock);
		});
	});

	describe('remove()', () => {
		it('calls ApiService.delete with the flow id in the path', async () => {
			const mock = { ok: true, data: null };
			(ApiService.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			await InvestigationFlowsService.remove(9);

			expect(ApiService.delete).toHaveBeenCalledWith('/api/v2/investigation-flows/9', {});
		});
	});

	describe('createStep()', () => {
		it('posts to /api/v2/investigation-flows/:flowId/steps', async () => {
			const body = { step_order: 1, step_title: 'Containment', step_is_required: true };
			const mock = { ok: true, data: { id: 1, ...body } };
			(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const result = await InvestigationFlowsService.createStep(10, body);

			expect(ApiService.post).toHaveBeenCalledWith(
				'/api/v2/investigation-flows/10/steps',
				body,
				{}
			);
			expect(result).toBe(mock);
		});
	});

	describe('updateStep()', () => {
		it('puts to /api/v2/investigation-flows/:flowId/steps/:stepId', async () => {
			const body = { step_title: 'Updated step' };
			const mock = { ok: true, data: {} };
			(ApiService.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			await InvestigationFlowsService.updateStep(10, 3, body);

			expect(ApiService.put).toHaveBeenCalledWith(
				'/api/v2/investigation-flows/10/steps/3',
				body,
				{}
			);
		});
	});

	describe('deleteStep()', () => {
		it('deletes /api/v2/investigation-flows/:flowId/steps/:stepId', async () => {
			(ApiService.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				data: null
			});

			await InvestigationFlowsService.deleteStep(10, 3);

			expect(ApiService.delete).toHaveBeenCalledWith('/api/v2/investigation-flows/10/steps/3', {});
		});
	});

	describe('deploy()', () => {
		it('posts an empty body to /api/v2/investigation-flows/:id/deploy', async () => {
			const mock = { ok: true, data: { deployed: true } };
			(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const result = await InvestigationFlowsService.deploy(4);

			expect(ApiService.post).toHaveBeenCalledWith('/api/v2/investigation-flows/4/deploy', {}, {});
			expect(result).toBe(mock);
		});
	});

	it('forwards ApiOptions to every method', async () => {
		const opts: ApiOptions = { skipTokenRefresh: true };

		(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
			'/api/v2/investigation-flows'
		);
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			data: []
		});
		await InvestigationFlowsService.list(undefined, opts);
		expect(ApiService.get).toHaveBeenCalledWith('/api/v2/investigation-flows', opts);

		vi.clearAllMocks();
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });
		await InvestigationFlowsService.get(1, opts);
		expect(ApiService.get).toHaveBeenCalledWith('/api/v2/investigation-flows/1', opts);
	});
});
