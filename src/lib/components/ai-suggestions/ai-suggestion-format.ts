import {
	FolderPlusIcon,
	GitMergeIcon,
	HelpCircleIcon,
	Link2Icon,
	MessageSquareTextIcon,
	SparklesIcon
} from 'lucide-svelte';
import type {
	AiSuggestion,
	AiSuggestionFormField,
	AiSuggestionKind
} from '$lib/services/ai-suggestions.service';

export const AI_SUGGESTION_KINDS: Record<string, { label: string; icon: typeof SparklesIcon }> = {
	create_case: { label: 'Create case', icon: FolderPlusIcon },
	merge_into_case: { label: 'Merge into case', icon: GitMergeIcon },
	related_alerts: { label: 'Related alerts', icon: Link2Icon },
	draft_reply: { label: 'Draft reply', icon: MessageSquareTextIcon },
	info_request: { label: 'Question for you', icon: HelpCircleIcon },
	generic_action: { label: 'Suggested action', icon: SparklesIcon }
};

export function aiSuggestionKind(kind: AiSuggestionKind): {
	label: string;
	icon: typeof SparklesIcon;
} {
	return AI_SUGGESTION_KINDS[kind] ?? { label: kind, icon: SparklesIcon };
}

/** Confidence as a percentage; accepts 0..1 or 0..100. */
export function aiSuggestionConfidence(confidence: number | null | undefined): string | null {
	if (confidence == null || !Number.isFinite(confidence)) return null;
	const pct = confidence <= 1 ? confidence * 100 : confidence;
	return `${Math.round(Math.max(0, Math.min(100, pct)))}%`;
}

export function aiSuggestionSeverityClass(severity: string | null | undefined): string {
	switch (severity) {
		case 'critical':
			return 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300';
		case 'high':
			return 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300';
		case 'medium':
			return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300';
		default:
			return 'border-border bg-muted/40 text-muted-foreground';
	}
}

export const AI_SUGGESTION_STATUS_LABELS: Record<string, string> = {
	open: 'Open',
	accepted: 'Accepted',
	dismissed: 'Dismissed',
	expired: 'Expired',
	dry_run: 'Dry run'
};

export function aiSuggestionPretty(value: unknown): string {
	if (value == null) return '';
	if (typeof value === 'string') return value;
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

export function aiSuggestionFieldOptions(
	field: AiSuggestionFormField
): Array<{ value: string; label: string }> {
	return (field.options ?? []).map((o) =>
		typeof o === 'string' ? { value: o, label: o } : { value: o.value, label: o.label ?? o.value }
	);
}

export type AiSuggestionAnswerValue = string | number | boolean | null;

/** Starting values of an answer form. */
export function aiSuggestionAnswerDefaults(
	fields: AiSuggestionFormField[]
): Record<string, AiSuggestionAnswerValue> {
	const out: Record<string, AiSuggestionAnswerValue> = {};
	for (const f of fields) {
		out[f.name] = f.type === 'boolean' ? false : f.type === 'number' ? null : '';
	}
	return out;
}

/**
 * Normalises raw form values into the answer body and collects the
 * missing required fields / bad numbers by field name.
 */
export function aiSuggestionAnswerBuild(
	fields: AiSuggestionFormField[],
	values: Record<string, unknown>
): { answer: Record<string, AiSuggestionAnswerValue>; errors: Record<string, string> } {
	const answer: Record<string, AiSuggestionAnswerValue> = {};
	const errors: Record<string, string> = {};
	for (const f of fields) {
		const raw = values[f.name];
		if (f.type === 'boolean') {
			answer[f.name] = raw === true;
			continue;
		}
		if (f.type === 'number') {
			if (raw === '' || raw == null) {
				answer[f.name] = null;
			} else {
				const n = typeof raw === 'number' ? raw : Number(raw);
				if (Number.isNaN(n)) {
					errors[f.name] = 'Must be a number';
					continue;
				}
				answer[f.name] = n;
			}
		} else {
			const text = raw == null ? '' : String(raw);
			answer[f.name] = text.trim() === '' ? null : text;
		}
		if (f.required && answer[f.name] == null) errors[f.name] = 'Required';
	}
	return { answer, errors };
}

export function aiSuggestionIsActionable(s: AiSuggestion): boolean {
	return s.status === 'open';
}
