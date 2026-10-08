import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tutorial } from '$lib/tutorials/types';

vi.mock('$app/environment', () => ({ browser: true }));

const toast = vi.fn();
vi.mock('$lib/components/ui/toast', () => ({ toast }));

const getMyPreference = vi.fn();
const setMyPreference = vi.fn();
vi.mock('$lib/services/users.service', () => ({
	UsersService: { getMyPreference, setMyPreference }
}));

const demo: Tutorial = {
	id: 'demo',
	title: 'Demo',
	summary: '',
	duration: '1 min',
	steps: [
		{ title: 'Intro', body: '' },
		{
			title: 'Create',
			body: '',
			waitFor: {
				kind: 'api',
				method: 'POST',
				path: '/cases',
				capture: { caseId: 'case_id' }
			}
		},
		{ title: 'Go', body: '', waitFor: { kind: 'route', path: '/case/{caseId}/assets' } },
		{ title: 'Open', body: '', waitFor: { kind: 'element', anchor: 'form-{caseId}' } },
		{ title: 'Done', body: '' }
	]
};
vi.mock('$lib/tutorials', () => ({
	tutorialById: (id: string) => (id === 'demo' ? demo : undefined)
}));

const STORAGE_KEY = 'iris_tutorial_run';

const load = async () => {
	vi.resetModules();
	const [store, events] = await Promise.all([
		import('../tutorial.store.svelte'),
		import('$lib/services/api-events')
	]);
	return { tutorial: store.tutorial, emit: events.emitApiEvent };
};

beforeEach(() => {
	localStorage.clear();
	toast.mockReset();
	getMyPreference.mockReset().mockResolvedValue({ ok: true, data: { value: {} } });
	setMyPreference.mockReset().mockResolvedValue({ ok: true });
});

describe('tutorial store', () => {
	it('walks manual, api, route and element steps, then records completion', async () => {
		const { tutorial, emit } = await load();
		tutorial.start('demo');
		expect(tutorial.step?.title).toBe('Intro');

		tutorial.next();
		expect(tutorial.step?.title).toBe('Create');

		// A failed call or another endpoint does not count.
		emit({ method: 'POST', path: '/cases', status: 400, ok: false, data: null });
		emit({ method: 'POST', path: '/war-rooms', status: 201, ok: true, data: {} });
		expect(tutorial.step?.title).toBe('Create');

		emit({
			method: 'POST',
			path: '/cases',
			status: 201,
			ok: true,
			data: { status: 'success', data: { case_id: 42 } }
		});
		expect(tutorial.step?.title).toBe('Go');
		expect(tutorial.vars).toEqual({ caseId: 42 });

		tutorial.observe('/case/41/assets');
		expect(tutorial.step?.title).toBe('Go');
		tutorial.observe('/case/42/assets');
		expect(tutorial.step?.title).toBe('Open');

		const isOnScreen = vi.fn((anchor: string) => anchor === 'form-42');
		tutorial.observe('/case/42/assets', isOnScreen);
		expect(isOnScreen).toHaveBeenCalledWith('form-42');
		expect(tutorial.step?.title).toBe('Done');

		tutorial.next();
		expect(tutorial.run).toBeNull();
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
		expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' }));
		await vi.waitFor(() => expect(setMyPreference).toHaveBeenCalled());
		expect(setMyPreference.mock.calls[0][0]).toBe('tutorials');
		expect(Object.keys(setMyPreference.mock.calls[0][1].completed)).toEqual(['demo']);
	});

	it('keeps completions already stored on the server', async () => {
		getMyPreference.mockResolvedValue({
			ok: true,
			data: { value: { completed: { other: '2026-01-01T00:00:00Z' } } }
		});
		const { tutorial } = await load();
		tutorial.start('demo');
		tutorial.next();
		tutorial.exit();
		expect(setMyPreference).not.toHaveBeenCalled();

		tutorial.start('demo');
		const run = tutorial.run!;
		// Jump to the last step through storage, as a resumed run would.
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...run, step: 4 }));
		const resumed = await load();
		resumed.tutorial.hydrate();
		resumed.tutorial.next();
		await vi.waitFor(() => expect(setMyPreference).toHaveBeenCalled());
		expect(Object.keys(setMyPreference.mock.calls[0][1].completed).sort()).toEqual([
			'demo',
			'other'
		]);
	});

	it('resumes a saved run and drops invalid ones', async () => {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ tutorialId: 'demo', step: 2, vars: { caseId: 7 } })
		);
		let { tutorial } = await load();
		tutorial.hydrate();
		expect(tutorial.step?.title).toBe('Go');
		expect(tutorial.vars).toEqual({ caseId: 7 });

		localStorage.setItem(STORAGE_KEY, JSON.stringify({ tutorialId: 'demo', step: 99, vars: {} }));
		({ tutorial } = await load());
		tutorial.hydrate();
		expect(tutorial.run).toBeNull();
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

		localStorage.setItem(STORAGE_KEY, '{not json');
		({ tutorial } = await load());
		tutorial.hydrate();
		expect(tutorial.run).toBeNull();
	});

	it('stops listening to the API once the run is exited', async () => {
		const { tutorial, emit } = await load();
		tutorial.start('demo');
		tutorial.next();
		tutorial.exit();
		tutorial.start('demo');
		emit({ method: 'POST', path: '/cases', status: 201, ok: true, data: { case_id: 1 } });
		expect(tutorial.step?.title).toBe('Intro');
	});

	it('ignores unknown tutorials and does not go back past the first step', async () => {
		const { tutorial } = await load();
		tutorial.start('nope');
		expect(tutorial.run).toBeNull();
		tutorial.start('demo');
		tutorial.back();
		expect(tutorial.run?.step).toBe(0);
		tutorial.next();
		tutorial.back();
		expect(tutorial.run?.step).toBe(0);
	});
});
