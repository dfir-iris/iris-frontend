import type { AlertRelationshipsFiltersValue } from './AlertRelationshipsFilters.svelte';

export { default as AlertRelatedGraph } from './AlertRelatedGraph.svelte';
export { default as AlertRelationshipsFilters } from './AlertRelationshipsFilters.svelte';

export const defaultAlertRelationshipsFilters = (): AlertRelationshipsFiltersValue => ({
	openAlerts: true,
	closedAlerts: true,
	openCases: true,
	closedCases: true,
	numberOfNodes: 100,
	daysBack: 180
});
