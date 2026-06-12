/**
 * Workspace-level case activity side panel. One instance per case layout:
 * the topbar's Activity button toggles it open/closed. The panel itself
 * lives in the case workspace, so toggling it doesn't tear down or rebuild
 * any UI when the user navigates between case sub-pages.
 *
 * Unlike the comments panel, activity is scoped to the whole case rather
 * than to a specific entity, so there's no `entity` state to manage —
 * the panel pulls activity for the current case id directly.
 */

export const ACTIVITY_PANEL_CTX = Symbol('activity-panel');

export const createActivityPanelContext = () => {
	const state = $state<{ open: boolean }>({ open: false });

	const open = () => {
		state.open = true;
	};

	const close = () => {
		state.open = false;
	};

	const toggle = () => {
		state.open = !state.open;
	};

	return {
		get state() {
			return state;
		},
		open,
		close,
		toggle
	};
};

export type ActivityPanelContext = ReturnType<typeof createActivityPanelContext>;
