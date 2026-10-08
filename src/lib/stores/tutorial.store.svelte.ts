import { browser } from '$app/environment';
import { toast } from '$lib/components/ui/toast';
import { onApiEvent, type ApiEvent } from '$lib/services/api-events';
import { UsersService } from '$lib/services/users.service';
import { tutorialById } from '$lib/tutorials';
import { findAnchor } from '$lib/tutorials/dom';
import { captureVars, interpolate, matchesApi, matchesPath } from '$lib/tutorials/logic';
import type { Tutorial, TutorialRun, TutorialStep, TutorialVars } from '$lib/tutorials/types';

/**
 * The running guided tutorial, if any.
 *
 * The run (tutorial, step, values captured so far) lives in
 * `localStorage` so a reload or a full-page navigation resumes where the
 * user was. Finished tutorials are recorded in the user's server-side
 * preferences under `tutorials`, so the catalogue can tick them off on
 * any browser.
 *
 * Steps complete on their own: API steps through the `api-events` feed,
 * route and element steps through `observe()`, which the overlay calls
 * on every animation frame.
 */
const STORAGE_KEY = 'iris_tutorial_run';
const PREFERENCE_KEY = 'tutorials';

type TutorialPreferences = { completed?: Record<string, string> };

const state = $state<{
	run: TutorialRun | null;
	minimised: boolean;
	completed: Record<string, string>;
}>({ run: null, minimised: false, completed: {} });

let hydrated = false;
let unsubscribeApi: (() => void) | null = null;

const persist = () => {
	if (!browser) return;
	if (state.run) localStorage.setItem(STORAGE_KEY, JSON.stringify(state.run));
	else localStorage.removeItem(STORAGE_KEY);
};

const isRun = (value: unknown): value is TutorialRun => {
	if (!value || typeof value !== 'object') return false;
	const run = value as Partial<TutorialRun>;
	return (
		typeof run.tutorialId === 'string' &&
		typeof run.step === 'number' &&
		!!run.vars &&
		typeof run.vars === 'object'
	);
};

const currentTutorial = (): Tutorial | null =>
	state.run ? (tutorialById(state.run.tutorialId) ?? null) : null;

const currentStep = (): TutorialStep | null =>
	currentTutorial()?.steps[state.run?.step ?? 0] ?? null;

const handleApiEvent = (event: ApiEvent) => {
	const run = state.run;
	const wait = currentStep()?.waitFor;
	if (!run || wait?.kind !== 'api' || !matchesApi(wait, event, run.vars)) return;
	advance(captureVars(wait, event.data));
};

const listen = () => {
	if (!unsubscribeApi) unsubscribeApi = onApiEvent(handleApiEvent);
};

const stopListening = () => {
	unsubscribeApi?.();
	unsubscribeApi = null;
};

const recordCompletion = async (tutorialId: string) => {
	state.completed = { ...state.completed, [tutorialId]: new Date().toISOString() };
	const current = await UsersService.getMyPreference<TutorialPreferences>(PREFERENCE_KEY);
	const stored =
		current.ok && current.data && typeof current.data === 'object'
			? (current.data.value?.completed ?? {})
			: {};
	await UsersService.setMyPreference<TutorialPreferences>(PREFERENCE_KEY, {
		completed: { ...stored, ...state.completed }
	});
};

const finish = () => {
	const tutorial = currentTutorial();
	state.run = null;
	stopListening();
	persist();
	if (!tutorial) return;
	toast({ title: `Tutorial complete: ${tutorial.title}`, variant: 'success' });
	void recordCompletion(tutorial.id);
};

function advance(captured: TutorialVars = {}) {
	const run = state.run;
	const tutorial = currentTutorial();
	if (!run || !tutorial) return;
	const step = run.step + 1;
	if (step >= tutorial.steps.length) {
		finish();
		return;
	}
	state.run = { ...run, step, vars: { ...run.vars, ...captured } };
	state.minimised = false;
	persist();
}

export const tutorial = {
	get run() {
		return state.run;
	},
	get tutorial() {
		return currentTutorial();
	},
	get step() {
		return currentStep();
	},
	get vars(): TutorialVars {
		return state.run?.vars ?? {};
	},
	get minimised() {
		return state.minimised;
	},
	set minimised(value: boolean) {
		state.minimised = value;
	},
	get completed() {
		return state.completed;
	},

	hydrate() {
		if (!browser || hydrated) return;
		hydrated = true;
		try {
			const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
			const tutorial = isRun(parsed) ? tutorialById(parsed.tutorialId) : undefined;
			// A run saved by an older build may point past the last step.
			if (isRun(parsed) && tutorial && parsed.step < tutorial.steps.length) {
				state.run = parsed;
				listen();
			} else {
				localStorage.removeItem(STORAGE_KEY);
			}
		} catch {
			localStorage.removeItem(STORAGE_KEY);
		}
	},

	async loadCompleted() {
		const res = await UsersService.getMyPreference<TutorialPreferences>(PREFERENCE_KEY);
		if (res.ok && res.data && typeof res.data === 'object') {
			state.completed = res.data.value?.completed ?? {};
		}
	},

	start(tutorialId: string) {
		if (!tutorialById(tutorialId)) return;
		state.run = { tutorialId, step: 0, vars: {} };
		state.minimised = false;
		listen();
		persist();
	},

	exit() {
		state.run = null;
		stopListening();
		persist();
	},

	next() {
		advance();
	},

	back() {
		const run = state.run;
		if (!run || run.step === 0) return;
		state.run = { ...run, step: run.step - 1 };
		persist();
	},

	/**
	 * Completes route and element steps once what they wait for is there.
	 * `isOnScreen` is injectable for tests.
	 */
	observe(
		pathname: string,
		isOnScreen: (anchor: string) => boolean = (anchor) =>
			findAnchor(anchor, { visibleOnly: true }) !== null
	) {
		const run = state.run;
		const wait = currentStep()?.waitFor;
		if (!run || !wait) return;
		if (wait.kind === 'route' && matchesPath(wait.path, pathname, run.vars)) advance();
		else if (wait.kind === 'element' && isOnScreen(interpolate(wait.anchor, run.vars))) advance();
	}
};
