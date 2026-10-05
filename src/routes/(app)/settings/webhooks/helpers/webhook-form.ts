import type {
	Webhook,
	WebhookAuthType,
	WebhookBody,
	WebhookBodyMode,
	WebhookDeliveryStatus,
	WebhookEntry,
	WebhookEvent,
	WebhookMethod
} from '$lib/services/webhooks.service';

/** Every automatic event. Manual triggers are never implied by it. */
export const ALL_EVENTS = '*';

const MANUAL_PREFIX = 'on_manual_trigger_';

/** An object menu entry (`on_manual_trigger_*`), not an automatic event. */
export function isManualEvent(name: string): boolean {
	return name.startsWith(MANUAL_PREFIX);
}

export const METHODS: WebhookMethod[] = ['POST', 'PUT', 'PATCH', 'GET', 'DELETE'];

export const CONTENT_TYPES = [
	'application/json',
	'application/x-www-form-urlencoded',
	'text/plain',
	'application/xml'
];

/**
 * A header / query parameter row. `stored` marks a secret the server
 * already holds: an empty `value` then keeps it.
 */
export interface FormEntry {
	key: number;
	name: string;
	value: string;
	secret: boolean;
	stored: boolean;
}

/**
 * Editor state. Secrets the server holds are never sent back, so each
 * one is a pair: the new value typed (empty keeps the stored one) and
 * whether one is stored. `*_clear` drops the stored value on save.
 */
export interface WebhookForm {
	name: string;
	description: string;
	enabled: boolean;
	/** Every automatic event; `events` then only keeps manual triggers. */
	allEvents: boolean;
	events: string[];
	manual_label: string;
	condition: string;
	method: WebhookMethod;
	url: string;
	query_params: FormEntry[];
	headers: FormEntry[];
	auth_type: WebhookAuthType;
	auth_username: string;
	auth_secret: string;
	auth_secret_stored: boolean;
	body_mode: WebhookBodyMode;
	body_template: string;
	content_type: string;
	signing_secret: string;
	signing_secret_stored: boolean;
	signing_secret_clear: boolean;
	verify_tls: boolean;
	timeout_seconds: number;
	max_retries: number;
	follow_redirects: boolean;
	use_proxy: boolean;
}

let nextKey = 1;

export function newEntry(partial: Partial<Omit<FormEntry, 'key'>> = {}): FormEntry {
	return { key: nextKey++, name: '', value: '', secret: false, stored: false, ...partial };
}

export function emptyForm(): WebhookForm {
	return {
		name: '',
		description: '',
		enabled: true,
		allEvents: false,
		events: [],
		manual_label: '',
		condition: '',
		method: 'POST',
		url: '',
		query_params: [],
		headers: [],
		auth_type: 'none',
		auth_username: '',
		auth_secret: '',
		auth_secret_stored: false,
		body_mode: 'default',
		body_template: '',
		content_type: 'application/json',
		signing_secret: '',
		signing_secret_stored: false,
		signing_secret_clear: false,
		verify_tls: true,
		timeout_seconds: 10,
		max_retries: 3,
		follow_redirects: false,
		use_proxy: true
	};
}

function entriesFromApi(entries: WebhookEntry[] | null | undefined): FormEntry[] {
	return (entries ?? []).map((e) =>
		newEntry({
			name: e.name,
			value: e.secret ? '' : (e.value ?? ''),
			secret: e.secret,
			stored: e.secret && !!e.has_value
		})
	);
}

export function formFromWebhook(webhook: Webhook): WebhookForm {
	const all = webhook.events.includes(ALL_EVENTS);
	return {
		name: webhook.name,
		description: webhook.description ?? '',
		enabled: webhook.enabled,
		allEvents: all,
		events: all ? webhook.events.filter(isManualEvent) : [...webhook.events],
		manual_label: webhook.manual_label ?? '',
		condition: webhook.condition ?? '',
		method: webhook.method,
		url: webhook.url,
		query_params: entriesFromApi(webhook.query_params),
		headers: entriesFromApi(webhook.headers),
		auth_type: webhook.auth_type,
		auth_username: webhook.auth_username ?? '',
		auth_secret: '',
		auth_secret_stored: webhook.has_auth_secret,
		body_mode: webhook.body_mode,
		body_template: webhook.body_template ?? '',
		content_type: webhook.content_type || 'application/json',
		signing_secret: '',
		signing_secret_stored: webhook.has_signing_secret,
		signing_secret_clear: false,
		verify_tls: webhook.verify_tls,
		timeout_seconds: webhook.timeout_seconds,
		max_retries: webhook.max_retries,
		follow_redirects: webhook.follow_redirects,
		use_proxy: webhook.use_proxy ?? true
	};
}

/**
 * A copy of `webhook` to save as a new one. Stored secrets can't be
 * read back, so the copy asks for them again.
 */
export function duplicateForm(webhook: Webhook): WebhookForm {
	const form = formFromWebhook(webhook);
	const unstore = (e: FormEntry) => newEntry({ ...e, stored: false });
	return {
		...form,
		name: `Copy of ${webhook.name}`.slice(0, 255),
		enabled: false,
		query_params: form.query_params.map(unstore),
		headers: form.headers.map(unstore),
		auth_secret_stored: false,
		signing_secret_stored: false
	};
}

function entriesToApi(entries: FormEntry[]): WebhookEntry[] {
	return entries
		.filter((e) => e.name.trim() || e.value)
		.map((e) => ({
			name: e.name.trim(),
			// null keeps the stored secret
			value: e.secret && e.stored && e.value === '' ? null : e.value,
			secret: e.secret
		}));
}

/** The API body for `form`. Stored secrets left blank are kept. */
export function formToBody(form: WebhookForm): WebhookBody {
	const body: WebhookBody = {
		name: form.name.trim(),
		description: form.description.trim() || null,
		enabled: form.enabled,
		events: form.allEvents ? [ALL_EVENTS, ...form.events.filter(isManualEvent)] : [...form.events],
		manual_label: form.manual_label.trim() || null,
		condition: form.condition.trim() || null,
		method: form.method,
		url: form.url.trim(),
		query_params: entriesToApi(form.query_params),
		headers: entriesToApi(form.headers),
		auth_type: form.auth_type,
		auth_username: form.auth_type === 'basic' ? form.auth_username.trim() || null : null,
		body_mode: form.body_mode,
		body_template: form.body_mode === 'template' ? form.body_template : null,
		content_type: form.content_type.trim() || 'application/json',
		verify_tls: form.verify_tls,
		timeout_seconds: Number(form.timeout_seconds),
		max_retries: Number(form.max_retries),
		follow_redirects: form.follow_redirects,
		use_proxy: form.use_proxy
	};
	if (form.auth_type !== 'none') {
		if (form.auth_secret !== '') body.auth_secret = form.auth_secret;
		// No stored secret as far as the form knows (e.g. the auth type
		// changed): make sure an old one isn't silently reused.
		else if (!form.auth_secret_stored) body.auth_secret = null;
	}
	if (form.signing_secret_clear) {
		body.signing_secret = null;
	} else if (form.signing_secret !== '') {
		body.signing_secret = form.signing_secret;
	}
	return body;
}

/** Stable comparison key — tells whether the editor has unsaved changes. */
export function formSignature(form: WebhookForm): string {
	const strip = (entries: FormEntry[]) => entries.map(({ key: _key, ...rest }) => rest);
	return JSON.stringify({
		...form,
		query_params: strip(form.query_params),
		headers: strip(form.headers)
	});
}

// ---- Validation errors -----------------------------------------------------

export type EditorTab = 'general' | 'events' | 'request' | 'body' | 'deliveries';

const FIELD_TABS: Record<string, EditorTab> = {
	name: 'general',
	description: 'general',
	enabled: 'general',
	events: 'events',
	manual_label: 'events',
	condition: 'events',
	body_mode: 'body',
	body_template: 'body',
	content_type: 'body'
};

/** The tab a server-side field error belongs to. */
export function tabOfField(field: string): EditorTab {
	return FIELD_TABS[field.split('.')[0]] ?? 'request';
}

/** Server field errors (`{field: [msgs]}`) out of a 400 response body. */
export function extractFieldErrors(data: unknown): Record<string, string[]> {
	if (!data || typeof data !== 'object') return {};
	const inner = (data as { data?: unknown }).data;
	if (!inner || typeof inner !== 'object' || Array.isArray(inner)) return {};
	const out: Record<string, string[]> = {};
	for (const [field, messages] of Object.entries(inner as Record<string, unknown>)) {
		if (Array.isArray(messages)) out[field] = messages.map(String);
		else if (typeof messages === 'string') out[field] = [messages];
	}
	return out;
}

/** One line per field error, for a toast. */
export function describeFieldErrors(errors: Record<string, string[]>): string {
	return Object.entries(errors)
		.map(([field, messages]) => `${field}: ${messages.join(', ')}`)
		.join('\n');
}

// ---- Events ----------------------------------------------------------------

export interface EventGroup {
	objectType: string;
	label: string;
	events: WebhookEvent[];
}

/** Events grouped by object, filtered by a free-text query. */
export function groupEvents(events: WebhookEvent[], query = ''): EventGroup[] {
	const q = query.trim().toLowerCase();
	const groups = new Map<string, EventGroup>();
	for (const event of events) {
		const haystack =
			`${event.name} ${event.label} ${event.object_label} ${event.description}`.toLowerCase();
		if (q && !haystack.includes(q)) continue;
		let group = groups.get(event.object_type);
		if (!group) {
			group = { objectType: event.object_type, label: event.object_label, events: [] };
			groups.set(event.object_type, group);
		}
		group.events.push(event);
	}
	return [...groups.values()];
}

/**
 * "All events", "Case created +2", "IOC manual trigger",
 * "All events · 3 manual triggers"… for the list view.
 */
export function summarizeEvents(names: string[], catalogue: WebhookEvent[]): string {
	const labelOf = (name: string) => catalogue.find((e) => e.name === name)?.label ?? name;
	const automatic = names.filter((n) => n !== ALL_EVENTS && !isManualEvent(n));
	const manual = names.filter(isManualEvent);
	const parts: string[] = [];
	if (names.includes(ALL_EVENTS)) parts.push('All events');
	else if (automatic.length === 1) parts.push(labelOf(automatic[0]));
	else if (automatic.length > 1) parts.push(`${labelOf(automatic[0])} +${automatic.length - 1}`);
	if (manual.length === 1) parts.push(labelOf(manual[0]));
	else if (manual.length > 1) parts.push(`${manual.length} manual triggers`);
	return parts.length ? parts.join(' · ') : 'No events';
}

// ---- Template variables ----------------------------------------------------

export interface TemplateVariable {
	path: string;
	type: 'string' | 'number' | 'boolean' | 'null' | 'object' | 'list';
	preview: string;
	depth: number;
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function childPath(parent: string, key: string): string {
	if (IDENTIFIER.test(key)) return parent ? `${parent}.${key}` : key;
	return `${parent}[${JSON.stringify(key)}]`;
}

function typeOf(value: unknown): TemplateVariable['type'] {
	if (value === null || value === undefined) return 'null';
	if (Array.isArray(value)) return 'list';
	if (typeof value === 'object') return 'object';
	if (typeof value === 'number') return 'number';
	if (typeof value === 'boolean') return 'boolean';
	return 'string';
}

function previewOf(value: unknown): string {
	const type = typeOf(value);
	if (type === 'list') return `${(value as unknown[]).length} item(s)`;
	if (type === 'object') return `${Object.keys(value as object).length} key(s)`;
	if (type === 'null') return 'null';
	const text = String(value);
	return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

/**
 * Every variable path a template can use, from a preview context.
 * `payload` repeats the top level, so it is listed but not expanded.
 */
export function flattenContext(context: Record<string, unknown>, maxDepth = 4): TemplateVariable[] {
	const out: TemplateVariable[] = [];
	const walk = (value: unknown, path: string, depth: number) => {
		out.push({ path, type: typeOf(value), preview: previewOf(value), depth });
		if (depth >= maxDepth || path === 'payload') return;
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
				walk(child, childPath(path, key), depth + 1);
			}
		}
	};
	for (const [key, value] of Object.entries(context)) {
		walk(value, childPath('', key), 0);
	}
	return out;
}

export type InsertStyle = 'raw' | 'json' | 'escaped';

/** The Jinja expression to insert for a variable. */
export function variableExpression(path: string, style: InsertStyle): string {
	if (style === 'json') return `{{ ${path} | tojson }}`;
	if (style === 'escaped') return `{{ ${path} | json_escape }}`;
	return `{{ ${path} }}`;
}

// ---- Body presets ----------------------------------------------------------

export interface BodyPreset {
	id: string;
	label: string;
	description: string;
	content_type: string;
	template: string;
}

export const BODY_PRESETS: BodyPreset[] = [
	{
		id: 'slack',
		label: 'Slack',
		description: 'Incoming webhook message with a linked title.',
		content_type: 'application/json',
		template: `{
  "text": "{{ title | json_escape }}",
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*{{ (url | link(title, 'slack')) | json_escape }}*\\n{{ summary | json_escape }}"
      }
    },
    {
      "type": "context",
      "elements": [
        { "type": "mrkdwn", "text": "{{ event_label | json_escape }}{% if case %} · case #{{ case.id }}{% endif %}" }
      ]
    }
  ]
}
`
	},
	{
		id: 'teams',
		label: 'Microsoft Teams',
		description: 'Adaptive card for a Teams Workflows (Power Automate) webhook.',
		content_type: 'application/json',
		template: `{
  "type": "message",
  "attachments": [
    {
      "contentType": "application/vnd.microsoft.card.adaptive",
      "content": {
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "type": "AdaptiveCard",
        "version": "1.4",
        "body": [
          { "type": "TextBlock", "size": "Medium", "weight": "Bolder", "wrap": true, "text": "{{ title | json_escape }}" },
          { "type": "TextBlock", "wrap": true, "text": "{{ summary | json_escape }}" }
        ],
        "actions": [{% if url %}
          { "type": "Action.OpenUrl", "title": "Open in IRIS", "url": "{{ url | json_escape }}" }
        {% endif %}]
      }
    }
  ]
}
`
	},
	{
		id: 'discord',
		label: 'Discord',
		description: 'Channel webhook with an embed.',
		content_type: 'application/json',
		template: `{
  "username": "IRIS",
  "embeds": [
    {
      "title": "{{ title | truncate(250) | json_escape }}",
      "description": "{{ summary | truncate(4000) | json_escape }}",{% if url %}
      "url": "{{ url | json_escape }}",{% endif %}
      "timestamp": "{{ timestamp }}",
      "footer": { "text": "{{ event_label | json_escape }}" }
    }
  ]
}
`
	},
	{
		id: 'mattermost',
		label: 'Mattermost',
		description: 'Incoming webhook with a Markdown message.',
		content_type: 'application/json',
		template: `{
  "username": "IRIS",
  "text": "#### {{ (url | link(title)) | json_escape }}\\n{{ summary | json_escape }}"
}
`
	},
	{
		id: 'google-chat',
		label: 'Google Chat',
		description: 'Space webhook with a text message.',
		content_type: 'application/json',
		template: `{
  "text": "*{{ title | json_escape }}*\\n{{ summary | json_escape }}{% if url %}\\n<{{ url | json_escape }}|Open in IRIS>{% endif %}"
}
`
	},
	{
		id: 'generic',
		label: 'Compact JSON',
		description: 'The essentials of the event, without the full object.',
		content_type: 'application/json',
		template: `{
  "event": {{ event | tojson }},
  "title": {{ title | tojson }},
  "summary": {{ summary | tojson }},
  "url": {{ url | tojson }},
  "case": {{ case | tojson }},
  "actor": {{ actor | tojson }},
  "timestamp": {{ timestamp | tojson }},
  "data": {{ data | tojson }}
}
`
	},
	{
		id: 'text',
		label: 'Plain text',
		description: 'One line of text.',
		content_type: 'text/plain',
		template: `{{ title }} — {{ summary }}{% if url %} {{ url }}{% endif %}
`
	}
];

// ---- Display ---------------------------------------------------------------

export const STATUS_LABELS: Record<WebhookDeliveryStatus, string> = {
	pending: 'Pending',
	retrying: 'Retrying',
	success: 'Delivered',
	failed: 'Failed',
	skipped: 'Skipped'
};

export const STATUS_TONES: Record<WebhookDeliveryStatus, string> = {
	pending: 'bg-muted text-muted-foreground',
	retrying: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
	success: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
	failed: 'bg-red-500/15 text-red-700 dark:text-red-300',
	skipped: 'bg-muted text-muted-foreground'
};

/** `https://hooks.slack.com/…` → `hooks.slack.com`; templated URLs as is. */
export function destinationHost(url: string): string {
	try {
		return new URL(url).host || url;
	} catch {
		return url;
	}
}

/** Pretty-print JSON text; anything else is returned unchanged. */
export function prettyBody(body: string | null | undefined): string {
	if (!body) return '';
	try {
		return JSON.stringify(JSON.parse(body), null, 2);
	} catch {
		return body;
	}
}
