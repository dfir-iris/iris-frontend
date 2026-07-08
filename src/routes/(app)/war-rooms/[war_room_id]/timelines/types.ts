/** Filter panel state for the war-room timeline view.
 *
 * Mirrors the case-timeline `TimelineFilterData` field-for-field so the
 * filter component ports across with only naming changes. `flag` is a
 * tri-state string (`''` = any, `'true'` = flagged only, `'false'` =
 * unflagged only) to match the select-based UI the case timeline uses.
 */
export type TimelineFilterData = {
	title: string;
	description: string;
	source: string;
	tag: string;
	asset: string;
	ioc: string;
	category: string;
	startDate: string;
	endDate: string;
	flag: string;
};

export type TimelineFilterFieldValue = TimelineFilterData[keyof TimelineFilterData];

/** List renders events as flat vertical cards grouped by date; tree
 *  renders them along a spine with parent/child branches. Toggle sits
 *  on the topbar next to the filter button. */
export type ViewMode = 'list' | 'tree';
