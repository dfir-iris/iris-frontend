import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/services/case.service', () => ({
	CaseService: {
		list: vi.fn(),
		filter: vi.fn(),
		get: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
		remove: vi.fn()
	}
}));

vi.mock('$lib/services/case-states.service', async () => {
	// `findStateIdByName` is a pure helper covered by its own service test —
	// keep the real one so this suite exercises the actual name→id lookup.
	const actual = await vi.importActual<typeof import('$lib/services/case-states.service')>(
		'$lib/services/case-states.service'
	);

	return {
		...actual,
		CaseStatesService: { list: vi.fn() }
	};
});

vi.mock('$lib/services/cases-filters.service', () => ({
	CasesFiltersService: {
		list: vi.fn(),
		get: vi.fn(),
		create: vi.fn(),
		remove: vi.fn()
	}
}));

const { CaseService } = await import('$lib/services/case.service');
const { CaseStatesService } = await import('$lib/services/case-states.service');
const { createCasesContext } = await import('../cases.context.svelte');

const update = vi.mocked(CaseService.update);
const listStates = vi.mocked(CaseStatesService.list);

const CLOSED_STATE_ID = 4;
const OPEN_STATE_ID = 1;

const caseFixture = (id: number) => ({ case_id: id, case_name: `Case ${id}` });

// `createCasesContext` only reads `app.state.currentCaseID`.
const appStub = { state: { currentCaseID: 73 } } as never;

const makeContext = () => createCasesContext((c) => (c as { case_id: number }).case_id, appStub);

beforeEach(() => {
	vi.clearAllMocks();

	listStates.mockResolvedValue({
		ok: true,
		error: undefined,
		data: [
			{ state_id: OPEN_STATE_ID, state_name: 'Open' },
			{ state_id: CLOSED_STATE_ID, state_name: 'Closed' }
		]
	} as never);

	update.mockResolvedValue({
		ok: true,
		error: undefined,
		data: caseFixture(73)
	} as never);
});

describe('cases context — closing notes', () => {
	it('close() sends state_id and closing_note in a single PUT', async () => {
		// The whole point of routing the note through the state-change PUT:
		// the case is never closed without the note that explains it.
		const cases = makeContext();

		await cases.close(73, 'Confirmed false positive — vendor scanner.');

		expect(update).toHaveBeenCalledTimes(1);
		expect(update).toHaveBeenCalledWith(
			73,
			{
				state_id: CLOSED_STATE_ID,
				closing_note: 'Confirmed false positive — vendor scanner.'
			},
			{}
		);
	});

	it('close() with no note omits closing_note entirely', async () => {
		// Existing callers (and the API-driven e2e suite) must keep sending
		// exactly what they sent before closing notes existed.
		const cases = makeContext();

		await cases.close(73);

		expect(update).toHaveBeenCalledTimes(1);
		expect(update).toHaveBeenCalledWith(73, { state_id: CLOSED_STATE_ID }, {});

		const [, body] = update.mock.calls[0];
		expect(body).not.toHaveProperty('closing_note');
	});

	it('close() maps an empty or whitespace-only note to null', async () => {
		// `''` would persist and keep every "has a closing note?" check
		// truthy, rendering a blank Closing note section forever.
		const cases = makeContext();

		await cases.close(73, '   ');

		expect(update).toHaveBeenCalledWith(73, { state_id: CLOSED_STATE_ID, closing_note: null }, {});
	});

	it('reopen() leaves closing_note untouched', async () => {
		// Reopening is reversible and the note is a record of why the case
		// was closed at the time — clearing it would destroy data.
		const cases = makeContext();

		await cases.reopen(73);

		expect(update).toHaveBeenCalledTimes(1);
		expect(update).toHaveBeenCalledWith(73, { state_id: OPEN_STATE_ID }, {});

		const [, body] = update.mock.calls[0];
		expect(body).not.toHaveProperty('closing_note');
	});
});
