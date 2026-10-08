import {
	BellIcon,
	BotIcon,
	CircleIcon,
	GitBranchIcon,
	GlobeIcon,
	LightbulbIcon,
	ListChecksIcon,
	MessageCircleQuestionIcon,
	OctagonXIcon,
	PlayIcon,
	SearchIcon,
	TimerIcon,
	VariableIcon,
	ZapIcon
} from 'lucide-svelte';
import type { Icon } from 'lucide-svelte';
import type {
	AiEntityType,
	AiExecutionMode,
	AiRunStatus,
	AiStepStatus,
	AiTriggerType,
	AiUserRef,
	AiValidationError,
	AiWaitStatus
} from '$lib/services/ai-workflows.service';

export const NODE_ICONS: Record<string, typeof Icon> = {
	trigger: ZapIcon,
	ai_agent: BotIcon,
	condition: GitBranchIcon,
	http_request: GlobeIcon,
	ask_analyst: MessageCircleQuestionIcon,
	find_related: SearchIcon,
	find_war_room_tasks: ListChecksIcon,
	suggest: LightbulbIcon,
	action: PlayIcon,
	notify: BellIcon,
	delay: TimerIcon,
	set_variables: VariableIcon,
	stop: OctagonXIcon
};

export const nodeIcon = (type: string): typeof Icon => NODE_ICONS[type] ?? CircleIcon;

/** Accent per node type, for the icon chip on the canvas. */
export const NODE_TONES: Record<string, string> = {
	trigger: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
	ai_agent: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
	condition: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
	http_request: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
	ask_analyst: 'bg-pink-500/15 text-pink-700 dark:text-pink-300',
	suggest: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
	action: 'bg-red-500/15 text-red-700 dark:text-red-300',
	stop: 'bg-muted text-muted-foreground'
};

export const nodeTone = (type: string): string => NODE_TONES[type] ?? 'bg-muted text-foreground/80';

export const TRIGGER_LABELS: Record<AiTriggerType, string> = {
	event: 'Event',
	cron: 'Schedule',
	manual: 'Manual',
	webhook: 'Inbound webhook'
};

export const ENTITY_LABELS: Record<AiEntityType, string> = {
	alert: 'Alert',
	alert_cluster: 'Alert cluster',
	case: 'Case',
	war_room: 'War room'
};

export const ENTITY_TYPES: AiEntityType[] = ['alert', 'alert_cluster', 'case', 'war_room'];

export const entityLabel = (type: string | null | undefined): string =>
	type ? (ENTITY_LABELS[type as AiEntityType] ?? type) : '';

/** In-app link to an entity, or null for an unknown type. */
export function entityHref(type: string | null | undefined, id: number | null | undefined) {
	// Only a positive safe integer goes into a URL path.
	if (!type || typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return null;
	switch (type) {
		case 'alert':
			return `/alerts/${id}`;
		case 'alert_cluster':
			return `/alert-clusters/${id}`;
		case 'case':
			return `/case/${id}`;
		case 'war_room':
			return `/war-rooms/${id}`;
		default:
			return null;
	}
}

export const RUN_STATUS_TONES: Record<AiRunStatus, string> = {
	running: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
	waiting: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
	succeeded: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
	failed: 'bg-red-500/15 text-red-700 dark:text-red-300',
	cancelled: 'bg-muted text-muted-foreground',
	skipped: 'bg-muted text-muted-foreground'
};

export const RUN_STATUSES: AiRunStatus[] = [
	'running',
	'waiting',
	'succeeded',
	'failed',
	'cancelled',
	'skipped'
];

export const runTone = (status: string): string =>
	RUN_STATUS_TONES[status as AiRunStatus] ?? 'bg-muted text-muted-foreground';

export const STEP_STATUS_TONES: Record<AiStepStatus, string> = {
	succeeded: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
	failed: 'bg-red-500/15 text-red-700 dark:text-red-300',
	waiting: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
	resumed: 'bg-blue-500/15 text-blue-700 dark:text-blue-300'
};

export const stepTone = (status: string): string =>
	STEP_STATUS_TONES[status as AiStepStatus] ?? 'bg-muted text-muted-foreground';

export const WAIT_STATUS_TONES: Record<AiWaitStatus, string> = {
	pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
	resolved: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
	expired: 'bg-red-500/15 text-red-700 dark:text-red-300',
	cancelled: 'bg-muted text-muted-foreground'
};

export const EXEC_MODE_LABELS: Record<AiExecutionMode, string> = {
	auto_read: 'auto read',
	allowlisted_write: 'allowlisted write',
	suggested: 'suggested',
	accepted_by_user: 'accepted by user',
	denied: 'denied'
};

export const EXEC_MODE_TONES: Record<AiExecutionMode, string> = {
	auto_read: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
	allowlisted_write: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
	suggested: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
	accepted_by_user: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
	denied: 'bg-red-500/15 text-red-700 dark:text-red-300'
};

export const CLASSIFICATION_TONES: Record<string, string> = {
	read: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
	write: 'bg-orange-500/15 text-orange-700 dark:text-orange-300'
};

/** `{id, login, name}` (or a bare string from older payloads) → label. */
export function userLabel(user: AiUserRef | string | null | undefined): string {
	if (!user) return '—';
	if (typeof user === 'string') return user;
	return user.name || user.login || `#${user.id}`;
}

/** Duration between two ISO dates, `end` defaulting to now. */
export function formatDuration(start: string | null | undefined, end?: string | null): string {
	if (!start) return '—';
	const a = Date.parse(start);
	const b = end ? Date.parse(end) : Date.now();
	if (Number.isNaN(a) || Number.isNaN(b)) return '—';
	const ms = Math.max(0, b - a);
	if (ms < 1000) return `${ms} ms`;
	const s = Math.round(ms / 1000);
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ${s % 60}s`;
	return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Offer `data` as a JSON file download. */
export function downloadJson(filename: string, data: unknown): void {
	const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}

/** 400 body `{message, data: {field: [msgs]}}` → one line. */
export function describeApiError(data: unknown, fallback: string): string {
	if (!data || typeof data !== 'object') return fallback;
	const body = data as { message?: string; data?: unknown };
	const parts: string[] = [];
	const structured = workflowErrorsFrom(data);
	if (structured.length) {
		return structured
			.map((e) => [e.node_id, e.field, e.message].filter((p) => p).join(' · '))
			.join(' | ');
	}
	if (body.data && typeof body.data === 'object' && !Array.isArray(body.data)) {
		for (const [field, msgs] of Object.entries(body.data as Record<string, unknown>)) {
			parts.push(`${field}: ${Array.isArray(msgs) ? msgs.join(', ') : String(msgs)}`);
		}
	}
	if (parts.length) return parts.join(' · ');
	return body.message || fallback;
}

/** A save rejected by validation: `{message, data: {errors: [{node_id, field, message}]}}`. */
export function workflowErrorsFrom(data: unknown): AiValidationError[] {
	const errors = (data as { data?: { errors?: unknown } } | null)?.data?.errors;
	if (!Array.isArray(errors)) return [];
	return errors.filter(
		(e): e is AiValidationError => !!e && typeof e === 'object' && 'message' in e
	);
}

export const WORKFLOW_EDITOR_CTX = Symbol('ai-workflow-editor');

/** Shared form styling (native selects, like the other settings pages). */
export const SELECT_CLASS = 'h-8 w-full rounded-md border bg-background px-2 text-xs';
export const LABEL_CLASS = 'text-2xs font-medium text-muted-foreground';
export const TEXTAREA_CLASS =
	'min-h-[72px] w-full rounded-md border bg-background px-2 py-1.5 font-mono text-xs outline-none focus:ring-1 focus:ring-ring';
