import { describe, it, expect } from 'vitest';
import type { Webhook, WebhookEvent } from '$lib/services/webhooks.service';
import {
	BODY_PRESETS,
	describeFieldErrors,
	destinationHost,
	duplicateForm,
	emptyForm,
	extractFieldErrors,
	flattenContext,
	formFromWebhook,
	formSignature,
	formToBody,
	groupEvents,
	isManualEvent,
	newEntry,
	prettyBody,
	summarizeEvents,
	tabOfField,
	variableExpression
} from '../webhook-form';

function webhook(overrides: Partial<Webhook> = {}): Webhook {
	return {
		id: 7,
		name: 'Slack',
		description: null,
		enabled: true,
		events: ['case_created'],
		manual_label: null,
		condition: null,
		method: 'POST',
		url: 'https://hooks.example.com/x',
		query_params: [],
		headers: [
			{ name: 'X-Plain', value: 'a', secret: false },
			{ name: 'X-Token', value: null, secret: true, has_value: true }
		],
		auth_type: 'bearer',
		auth_username: null,
		has_auth_secret: true,
		body_mode: 'default',
		body_template: null,
		content_type: 'application/json',
		has_signing_secret: true,
		verify_tls: true,
		timeout_seconds: 10,
		max_retries: 3,
		follow_redirects: false,
		use_proxy: true,
		created_by: null,
		created_at: null,
		updated_at: null,
		last_delivery: null,
		deliveries_24h: {},
		...overrides
	};
}

const catalogue: WebhookEvent[] = [
	{
		name: 'case_created',
		object_type: 'case',
		object_label: 'Case',
		action: 'created',
		label: 'Case created',
		description: 'A case is opened',
		manual: false
	},
	{
		name: 'case_deleted',
		object_type: 'case',
		object_label: 'Case',
		action: 'deleted',
		label: 'Case deleted',
		description: '',
		manual: false
	},
	{
		name: 'alert_created',
		object_type: 'alert',
		object_label: 'Alert',
		action: 'created',
		label: 'Alert created',
		description: '',
		manual: false
	},
	{
		name: 'on_manual_trigger_ioc',
		object_type: 'ioc',
		object_label: 'IOC',
		action: 'manual_trigger',
		label: 'IOC manual trigger',
		description: '',
		manual: true
	},
	{
		name: 'on_manual_trigger_case',
		object_type: 'case',
		object_label: 'Case',
		action: 'manual_trigger',
		label: 'Case manual trigger',
		description: '',
		manual: true
	}
];

describe('formFromWebhook', () => {
	it('never carries a stored secret value', () => {
		const form = formFromWebhook(webhook());
		const token = form.headers.find((h) => h.name === 'X-Token')!;
		expect(token).toMatchObject({ value: '', secret: true, stored: true });
		expect(form.auth_secret).toBe('');
		expect(form.auth_secret_stored).toBe(true);
		expect(form.signing_secret_stored).toBe(true);
	});

	it('maps the wildcard to the all-events switch', () => {
		const form = formFromWebhook(webhook({ events: ['*'] }));
		expect(form.allEvents).toBe(true);
		expect(form.events).toEqual([]);
	});

	it('keeps the manual triggers next to the wildcard', () => {
		const form = formFromWebhook(
			webhook({ events: ['*', 'on_manual_trigger_ioc'], manual_label: 'Send to SOAR' })
		);
		expect(form.allEvents).toBe(true);
		expect(form.events).toEqual(['on_manual_trigger_ioc']);
		expect(form.manual_label).toBe('Send to SOAR');
	});
});

describe('duplicateForm', () => {
	it('renames, disables and forgets stored secrets', () => {
		const form = duplicateForm(webhook());
		expect(form.name).toBe('Copy of Slack');
		expect(form.enabled).toBe(false);
		expect(form.headers.every((h) => !h.stored)).toBe(true);
		expect(form.auth_secret_stored).toBe(false);
		expect(form.signing_secret_stored).toBe(false);
	});

	it('asks for the secrets again on save', () => {
		const body = formToBody(duplicateForm(webhook()));
		expect(body.auth_secret).toBeNull();
		expect(body.headers?.find((h) => h.name === 'X-Token')?.value).toBe('');
	});
});

describe('formToBody', () => {
	it('keeps stored secrets left blank', () => {
		const body = formToBody(formFromWebhook(webhook()));
		expect(body.headers).toEqual([
			{ name: 'X-Plain', value: 'a', secret: false },
			{ name: 'X-Token', value: null, secret: true }
		]);
		expect(body).not.toHaveProperty('auth_secret');
		expect(body).not.toHaveProperty('signing_secret');
	});

	it('sends typed secrets', () => {
		const form = formFromWebhook(webhook());
		form.headers[1].value = 'new-token';
		form.auth_secret = 'bearer-token';
		form.signing_secret = 'sign';
		const body = formToBody(form);
		expect(body.headers?.[1].value).toBe('new-token');
		expect(body.auth_secret).toBe('bearer-token');
		expect(body.signing_secret).toBe('sign');
	});

	it('clears the auth secret when none is stored', () => {
		const form = formFromWebhook(webhook({ auth_type: 'none', has_auth_secret: false }));
		form.auth_type = 'basic';
		form.auth_username = ' user ';
		const body = formToBody(form);
		expect(body.auth_secret).toBeNull();
		expect(body.auth_username).toBe('user');
	});

	it('leaves the auth secret out without auth', () => {
		const form = formFromWebhook(webhook({ auth_type: 'none' }));
		const body = formToBody(form);
		expect(body).not.toHaveProperty('auth_secret');
		expect(body.auth_username).toBeNull();
	});

	it('clears the signing secret on request', () => {
		const form = formFromWebhook(webhook());
		form.signing_secret_clear = true;
		expect(formToBody(form).signing_secret).toBeNull();
	});

	it('drops blank rows and trims names', () => {
		const form = emptyForm();
		form.query_params = [newEntry(), newEntry({ name: ' q ', value: '{{ event }}' })];
		expect(formToBody(form).query_params).toEqual([
			{ name: 'q', value: '{{ event }}', secret: false }
		]);
	});

	it('sends the template only in template mode', () => {
		const form = emptyForm();
		form.body_template = '{{ title }}';
		expect(formToBody(form).body_template).toBeNull();
		form.body_mode = 'template';
		expect(formToBody(form).body_template).toBe('{{ title }}');
	});

	it('sends the wildcard for all events', () => {
		const form = emptyForm();
		form.allEvents = true;
		form.events = ['case_created'];
		expect(formToBody(form).events).toEqual(['*']);
	});

	it('sends manual triggers with the wildcard, as they are not part of it', () => {
		const form = emptyForm();
		form.allEvents = true;
		form.events = ['case_created', 'on_manual_trigger_ioc'];
		expect(formToBody(form).events).toEqual(['*', 'on_manual_trigger_ioc']);
		form.allEvents = false;
		expect(formToBody(form).events).toEqual(['case_created', 'on_manual_trigger_ioc']);
	});

	it('sends a trimmed menu label, or null', () => {
		const form = emptyForm();
		expect(formToBody(form).manual_label).toBeNull();
		form.manual_label = '  Send to SOAR ';
		expect(formToBody(form).manual_label).toBe('Send to SOAR');
	});
});

describe('formSignature', () => {
	it('ignores row keys', () => {
		const a = emptyForm();
		const b = emptyForm();
		a.headers = [newEntry({ name: 'X' })];
		b.headers = [newEntry({ name: 'X' })];
		expect(formSignature(a)).toBe(formSignature(b));
		b.headers[0].value = 'changed';
		expect(formSignature(a)).not.toBe(formSignature(b));
	});
});

describe('field errors', () => {
	it('maps fields to tabs', () => {
		expect(tabOfField('name')).toBe('general');
		expect(tabOfField('condition')).toBe('events');
		expect(tabOfField('manual_label')).toBe('events');
		expect(tabOfField('body_template')).toBe('body');
		expect(tabOfField('headers.1')).toBe('request');
		expect(tabOfField('url')).toBe('request');
	});

	it('extracts errors from a 400 body', () => {
		expect(
			extractFieldErrors({ message: 'Data error', data: { url: ['Bad URL'], name: 'Required' } })
		).toEqual({ url: ['Bad URL'], name: ['Required'] });
		expect(extractFieldErrors({ message: 'x', data: ['nope'] })).toEqual({});
		expect(extractFieldErrors(null)).toEqual({});
	});

	it('describes errors one per line', () => {
		expect(describeFieldErrors({ url: ['a', 'b'], name: ['c'] })).toBe('url: a, b\nname: c');
	});
});

describe('events', () => {
	it('groups by object and filters', () => {
		const automatic = catalogue.filter((e) => !e.manual);
		expect(groupEvents(automatic).map((g) => [g.objectType, g.events.length])).toEqual([
			['case', 2],
			['alert', 1]
		]);
		const filtered = groupEvents(catalogue, 'opened');
		expect(filtered).toHaveLength(1);
		expect(filtered[0].events[0].name).toBe('case_created');
	});

	it('summarizes a subscription', () => {
		expect(summarizeEvents(['*'], catalogue)).toBe('All events');
		expect(summarizeEvents([], catalogue)).toBe('No events');
		expect(summarizeEvents(['case_created'], catalogue)).toBe('Case created');
		expect(summarizeEvents(['case_created', 'alert_created'], catalogue)).toBe('Case created +1');
		expect(summarizeEvents(['unknown'], catalogue)).toBe('unknown');
	});

	it('summarizes manual triggers apart', () => {
		expect(summarizeEvents(['on_manual_trigger_ioc'], catalogue)).toBe('IOC manual trigger');
		expect(
			summarizeEvents(['*', 'on_manual_trigger_ioc', 'on_manual_trigger_case'], catalogue)
		).toBe('All events · 2 manual triggers');
		expect(summarizeEvents(['case_created', 'on_manual_trigger_ioc'], catalogue)).toBe(
			'Case created · IOC manual trigger'
		);
	});

	it('tells manual triggers from automatic events', () => {
		expect(isManualEvent('on_manual_trigger_alert')).toBe(true);
		expect(isManualEvent('on_postload_alert_create')).toBe(false);
		expect(isManualEvent('*')).toBe(false);
	});
});

describe('template variables', () => {
	it('flattens the context without expanding payload', () => {
		const vars = flattenContext({
			title: 'Hello',
			case: { id: 3, 'client-name': 'ACME' },
			items: [1, 2],
			payload: { title: 'Hello' }
		});
		const paths = vars.map((v) => v.path);
		expect(paths).toEqual(['title', 'case', 'case.id', 'case["client-name"]', 'items', 'payload']);
		expect(vars.find((v) => v.path === 'items')).toMatchObject({
			type: 'list',
			preview: '2 item(s)'
		});
		expect(vars.find((v) => v.path === 'case.id')).toMatchObject({ type: 'number', depth: 1 });
	});

	it('stops at the max depth', () => {
		const vars = flattenContext({ a: { b: { c: 1 } } }, 1);
		expect(vars.map((v) => v.path)).toEqual(['a', 'a.b']);
	});

	it('builds insert expressions', () => {
		expect(variableExpression('case.id', 'raw')).toBe('{{ case.id }}');
		expect(variableExpression('case', 'json')).toBe('{{ case | tojson }}');
		expect(variableExpression('title', 'escaped')).toBe('{{ title | json_escape }}');
	});
});

describe('presets', () => {
	it('have unique ids and a template', () => {
		const ids = BODY_PRESETS.map((p) => p.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const preset of BODY_PRESETS) {
			expect(preset.template.trim(), preset.id).not.toBe('');
			expect(preset.content_type, preset.id).toMatch(/\//);
		}
		expect(BODY_PRESETS.find((p) => p.id === 'generic')?.template).toContain('tojson');
	});
});

describe('display', () => {
	it('extracts the destination host', () => {
		expect(destinationHost('https://hooks.slack.com/services/x')).toBe('hooks.slack.com');
		expect(destinationHost('{{ url }}')).toBe('{{ url }}');
	});

	it('pretty-prints JSON bodies only', () => {
		expect(prettyBody('{"a":1}')).toBe('{\n  "a": 1\n}');
		expect(prettyBody('plain text')).toBe('plain text');
		expect(prettyBody(null)).toBe('');
	});
});
