/**
 * Guided tutorials are plain data: a list of steps the overlay walks the
 * user through on the real UI. A step is done either when the user clicks
 * Next (no `waitFor`) or when what it waits for happens.
 *
 * Strings may reference values captured by earlier steps as `{name}`
 * (`/case/{caseId}/assets`), so a later step can point at the very case
 * the user created a minute ago.
 */

export type TutorialVars = Record<string, string | number>;

/** Done when an API call succeeds. Paths have no `/api/v2` prefix. */
export type ApiWait = {
	kind: 'api';
	method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
	/** Template matched exactly (`/cases/{caseId}/assets`) or a regexp. */
	path: string | RegExp;
	/** `{ varName: 'dotted.path' }` read off the response body. */
	capture?: Record<string, string>;
};

/** Done when the browser is on this path (query string ignored). */
export type RouteWait = { kind: 'route'; path: string | RegExp };

/** Done when the anchor is on screen, e.g. a dialog that opened. */
export type ElementWait = { kind: 'element'; anchor: string };

export type StepWait = ApiWait | RouteWait | ElementWait;

/** A value the user can type themselves or have filled in for them. */
export type TutorialFill = {
	anchor: string;
	label: string;
	value: string | boolean;
};

export type TutorialStep = {
	title: string;
	/** Inline `**bold**` and `` `code` `` are rendered; no HTML. */
	body: string;
	/**
	 * `data-tour` name, or any CSS selector, to spotlight. With a list the
	 * first one on screen wins: `['finding-form', 'asset-vuln-add']`
	 * follows the user into the dialog once they open it.
	 */
	anchor?: string | string[];
	/** Offered as a "Take me there" button when not already there. */
	goTo?: string;
	fills?: TutorialFill[];
	waitFor?: StepWait;
};

export type Tutorial = {
	id: string;
	title: string;
	summary: string;
	/** Rough duration shown in the catalogue: `~10 min`. */
	duration: string;
	steps: TutorialStep[];
};

export type TutorialRun = {
	tutorialId: string;
	step: number;
	vars: TutorialVars;
};
