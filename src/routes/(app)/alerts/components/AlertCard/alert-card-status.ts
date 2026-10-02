import { isSpentStatus, isUntriagedStatus } from '../AlertsSplitView/triage-format';

/**
 * Where an alert stands, as far as the list-view card is concerned.
 *
 * The card used to know two states only — untriaged, and everything else
 * faded to `opacity-60` — so an alert someone was actively working on
 * looked as finished as a closed one, and closing an alert just made it
 * a little greyer in place, hover actions and all. Splitting the "else"
 * lets each state look like what it asks of the analyst: untriaged and
 * in-flight work stays at full strength, an escalated alert reads as
 * handed off, and only a finished one (closed / merged / dismissed —
 * the split view's "spent" set) steps back.
 */
export type AlertCardTone = 'untriaged' | 'active' | 'escalated' | 'spent';

export const alertCardTone = (statusName: string | null | undefined): AlertCardTone => {
	if (isSpentStatus(statusName)) return 'spent';
	if (isUntriagedStatus(statusName)) return 'untriaged';
	if ((statusName ?? '').toLowerCase().trim() === 'escalated') return 'escalated';
	return 'active';
};

/** Left accent of the card — the at-a-glance cue when scanning a long page. */
export const ALERT_CARD_ACCENT: Readonly<Record<AlertCardTone, string>> = {
	untriaged: 'border-l-iris-blue',
	active: 'border-l-amber-500',
	escalated: 'border-l-teal-500',
	spent: 'border-l-border'
};

/** Status pill in the card footer, coloured to match the accent. */
export const ALERT_CARD_STATUS_PILL: Readonly<Record<AlertCardTone, string>> = {
	untriaged: 'bg-iris-blue/10 text-iris-blue',
	active: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
	escalated: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
	spent: 'bg-muted text-muted-foreground'
};
