// Case outcomes are a fixed backend enum stored in `cases.status_id` (no
// lookup endpoint). The order here is the display order, not the id order.
export type CaseOutcome = {
	id: number;
	label: string;
};

export const CASE_OUTCOME_UNKNOWN = 0;

export const CASE_OUTCOMES: CaseOutcome[] = [
	{ id: CASE_OUTCOME_UNKNOWN, label: 'Unknown' },
	{ id: 1, label: 'False Positive' },
	{ id: 2, label: 'True Positive with impact' },
	{ id: 4, label: 'True Positive without impact' },
	{ id: 5, label: 'Legitimate' },
	{ id: 3, label: 'Not applicable' }
];

export const caseOutcomeById = (id: number | null | undefined): CaseOutcome | null =>
	CASE_OUTCOMES.find((o) => o.id === id) ?? null;
