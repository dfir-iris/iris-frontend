/**
 * Alert-scoped investigation-flow side panel. Modeled on the comments panel:
 * one instance per alerts layout; any descendant (AlertCard footer, alert
 * detail page toolbar) opens the panel against an alert by calling
 * `investigationFlowPanel.open({ id, label })`. The panel itself listens to
 * its own `entity` and re-fetches steps + progress whenever it changes, so
 * callers don't need to manage refresh.
 *
 * Rendered on the LEFT of the alerts layout — comments panel is on the
 * right — so an analyst can consult the checklist while composing a comment
 * without either panel occluding the other.
 */

export const INVESTIGATION_FLOW_PANEL_CTX = Symbol('investigation-flow-panel');

export type InvestigationFlowPanelEntity = {
	id: number;
	label: string;
};

export const createInvestigationFlowPanelContext = () => {
	const state = $state<{
		open: boolean;
		entity: InvestigationFlowPanelEntity | null;
	}>({
		open: false,
		entity: null
	});

	const open = (entity: InvestigationFlowPanelEntity) => {
		state.entity = entity;
		state.open = true;
	};

	const close = () => {
		state.open = false;
	};

	const clearEntity = () => {
		state.entity = null;
	};

	return {
		get state() {
			return state;
		},
		open,
		close,
		clearEntity
	};
};

export type InvestigationFlowPanelContext = ReturnType<
	typeof createInvestigationFlowPanelContext
>;
