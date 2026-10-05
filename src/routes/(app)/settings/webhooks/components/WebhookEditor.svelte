<!--
  Create / edit one webhook. Tabs on the left, a live preview of the
  request on the right that follows every keystroke. "Send test" sends
  the form as it stands — saved or not — with a sample event.

  Secrets (secret headers / params, auth secret, signing secret) are
  write-only: the form shows that one is stored and leaving the input
  empty keeps it. See `helpers/webhook-form.ts` for the exact rules.
-->
<script lang="ts">
	import {
		ArrowLeftIcon,
		ArrowRightIcon,
		DicesIcon,
		EyeIcon,
		EyeOffIcon,
		FlaskConicalIcon,
		LoaderCircleIcon,
		PanelRightIcon,
		SaveIcon,
		ShieldAlertIcon,
		TriangleAlertIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Tabs from '$lib/components/ui/tabs';
	import { toast } from '$lib/components/ui/toast';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import {
		WebhooksService,
		type Webhook,
		type WebhookAuthType,
		type WebhookEvent,
		type WebhookSettings,
		type WebhookTestResult
	} from '$lib/services/webhooks.service';
	import {
		METHODS,
		describeFieldErrors,
		extractFieldErrors,
		formFromWebhook,
		formSignature,
		formToBody,
		tabOfField,
		type EditorTab,
		type WebhookForm
	} from '../helpers/webhook-form';
	import BodyEditor from './BodyEditor.svelte';
	import ChoiceGroup from './ChoiceGroup.svelte';
	import DeliveriesLog from './DeliveriesLog.svelte';
	import EventsPicker from './EventsPicker.svelte';
	import FormSection from './FormSection.svelte';
	import KeyValueEditor from './KeyValueEditor.svelte';
	import PreviewPanel from './PreviewPanel.svelte';
	import TestResultDialog from './TestResultDialog.svelte';

	type Props = {
		/** The stored webhook, null while creating. */
		webhook: Webhook | null;
		initialForm: WebhookForm;
		catalogue: WebhookEvent[];
		settings: WebhookSettings | null;
		initialTab?: EditorTab;
		onClose: () => void;
		onSaved: (webhook: Webhook) => void;
	};

	let {
		webhook,
		initialForm,
		catalogue,
		settings,
		initialTab = 'general',
		onClose,
		onSaved
	}: Props = $props();

	// The editor is keyed on the webhook by the page, so these only need
	// their initial values.
	// svelte-ignore state_referenced_locally
	let form = $state<WebhookForm>(initialForm);
	// svelte-ignore state_referenced_locally
	let current = $state<Webhook | null>(webhook);
	// svelte-ignore state_referenced_locally
	let baseline = $state(formSignature(initialForm));
	// svelte-ignore state_referenced_locally
	let tab = $state<EditorTab>(initialTab);

	let errors = $state<Record<string, string[]>>({});
	let saving = $state(false);
	let testing = $state(false);
	let testResult = $state<WebhookTestResult | null>(null);
	let testOpen = $state(false);
	let deliveriesReload = $state(0);
	let showPreview = $state(true);
	let previewContext = $state<Record<string, unknown> | null>(null);
	let previewEvent = $state('');
	let confirmLeaveOpen = $state(false);
	let showAuthSecret = $state(false);
	let showSigningSecret = $state(false);

	const dirty = $derived(formSignature(form) !== baseline);
	const body = $derived(formToBody(form));

	/** The events the preview and the test can sample: the subscribed ones. */
	const eventOptions = $derived.by(() => {
		const chosen = catalogue.filter(
			(e) => form.events.includes(e.name) || (form.allEvents && !e.manual)
		);
		return chosen.length ? chosen : catalogue;
	});

	$effect(() => {
		if (!eventOptions.some((e) => e.name === previewEvent)) {
			previewEvent = eventOptions[0]?.name ?? '';
		}
	});

	const errorCounts = $derived.by(() => {
		const counts: Partial<Record<EditorTab, number>> = {};
		for (const field of Object.keys(errors)) {
			const t = tabOfField(field);
			counts[t] = (counts[t] ?? 0) + 1;
		}
		return counts;
	});

	const subscribedCount = $derived(
		form.allEvents ? null : form.events.length > 0 ? form.events.length : null
	);

	/** Errors of a field and of its rows (`headers`, `headers.0`…). */
	function fieldErrors(field: string): string[] {
		return Object.entries(errors)
			.filter(([key]) => key === field || key.startsWith(`${field}.`))
			.flatMap(([, messages]) => messages);
	}

	const AUTH_TYPES: { value: WebhookAuthType; label: string }[] = [
		{ value: 'none', label: 'None' },
		{ value: 'basic', label: 'Basic' },
		{ value: 'bearer', label: 'Bearer token' }
	];

	const TABS: { value: EditorTab; label: string }[] = [
		{ value: 'general', label: 'General' },
		{ value: 'events', label: 'Events' },
		{ value: 'request', label: 'Request' },
		{ value: 'body', label: 'Body' }
	];

	const TAB_CONTENT = 'mt-0 min-h-0 flex-1 overflow-y-auto px-8 py-6';
	const CONTENT = 'mx-auto flex w-full max-w-5xl flex-col';

	const STEPS: { tab: EditorTab; title: string; text: string }[] = [
		{
			tab: 'events',
			title: 'Events',
			text: 'Automatic events, manual entries in the object menus, and an optional condition.'
		},
		{
			tab: 'request',
			title: 'Request',
			text: 'Method, URL, query parameters, headers, authentication, signing and TLS.'
		},
		{
			tab: 'body',
			title: 'Body',
			text: 'The IRIS payload as is, or a template — with Slack, Teams… presets.'
		}
	];

	const TAB_TRIGGER =
		'-mb-px h-10 rounded-none border-b-2 border-transparent bg-transparent px-3 text-xs font-medium data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none';

	const HANDLED_REQUEST_FIELDS = [
		'url',
		'query_params',
		'headers',
		'auth_username',
		'auth_secret',
		'timeout_seconds',
		'max_retries'
	];

	function onAuthTypeChange(type: WebhookAuthType) {
		// A secret stored for another scheme must not silently carry over.
		form.auth_secret_stored = !!current?.has_auth_secret && current.auth_type === type;
		form.auth_secret = '';
	}

	function generateSigningSecret() {
		const bytes = new Uint8Array(32);
		crypto.getRandomValues(bytes);
		form.signing_secret = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
		form.signing_secret_clear = false;
		showSigningSecret = true;
	}

	const implicitHeaders = $derived.by(() => {
		const rows = [
			{ name: 'User-Agent', value: 'IRIS/<version>' },
			{ name: 'X-IRIS-Event', value: '<event name>' },
			{ name: 'X-IRIS-Delivery', value: '<delivery id>' }
		];
		if (form.body_mode !== 'none') {
			rows.push({ name: 'Content-Type', value: form.content_type || 'application/json' });
		}
		if (form.auth_type !== 'none')
			rows.push({ name: 'Authorization', value: '<from authentication>' });
		const signing =
			!form.signing_secret_clear && (form.signing_secret !== '' || form.signing_secret_stored);
		if (signing) {
			rows.push({ name: 'X-IRIS-Timestamp', value: '<unix time>' });
			rows.push({ name: 'X-IRIS-Signature', value: 'sha256=<hmac>' });
		}
		return rows;
	});

	function showErrors(data: unknown, fallback: string) {
		errors = extractFieldErrors(data);
		const first = Object.keys(errors)[0];
		if (first) tab = tabOfField(first);
		toast({
			title: fallback,
			description:
				describeFieldErrors(errors) || (data as { message?: string } | null)?.message || undefined,
			variant: 'destructive'
		});
	}

	async function save() {
		saving = true;
		try {
			const res = current
				? await WebhooksService.update(current.id, body)
				: await WebhooksService.create(body);
			if (res.ok && res.data && typeof res.data === 'object') {
				const saved = res.data as Webhook;
				const created = !current;
				current = saved;
				form = formFromWebhook(saved);
				baseline = formSignature(form);
				errors = {};
				toast({ title: created ? 'Webhook created' : 'Webhook saved', variant: 'success' });
				onSaved(saved);
			} else if (res.status === 400) {
				showErrors(res.data, 'The webhook was not saved');
			} else if (res.status !== 403) {
				toast({
					title: 'Failed to save the webhook',
					description: res.error?.message,
					variant: 'destructive'
				});
			}
		} finally {
			saving = false;
		}
	}

	async function sendTest() {
		testing = true;
		try {
			const res = await WebhooksService.test({
				webhook: body,
				webhook_id: current?.id ?? null,
				event: previewEvent || null
			});
			if (res.ok && res.data && typeof res.data === 'object') {
				testResult = res.data as WebhookTestResult;
				testOpen = true;
				if (testResult.delivery_id) deliveriesReload += 1;
			} else if (res.status === 400) {
				showErrors(res.data, 'The test was not sent');
			} else {
				toast({ title: 'Test failed', description: res.error?.message, variant: 'destructive' });
			}
		} finally {
			testing = false;
		}
	}

	function requestClose() {
		if (dirty) confirmLeaveOpen = true;
		else onClose();
	}

	function onKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 's') {
			e.preventDefault();
			if (dirty && !saving) save();
		}
	}

	const previewEventLabel = $derived(
		catalogue.find((e) => e.name === previewEvent)?.label ?? previewEvent
	);
</script>

<svelte:window onkeydown={onKeydown} />

{#snippet fieldError(field: string)}
	{#each fieldErrors(field) as message (message)}
		<p class="text-xs text-destructive">{message}</p>
	{/each}
{/snippet}

{#snippet secretToggle(shown: boolean, toggle: () => void)}
	<button
		type="button"
		class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
		aria-label={shown ? 'Hide' : 'Show'}
		onclick={toggle}
	>
		{#if shown}<EyeOffIcon size={13} />{:else}<EyeIcon size={13} />{/if}
	</button>
{/snippet}

<div class="flex h-full w-full flex-col overflow-hidden" data-testid="webhook-editor">
	<header class="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5">
		<div class="flex min-w-0 items-center gap-2">
			<Button
				variant="ghost"
				size="icon"
				class="h-8 w-8"
				aria-label="Back to webhooks"
				onclick={requestClose}
			>
				<ArrowLeftIcon size={15} />
			</Button>
			<div class="min-w-0 leading-tight">
				<h1 class="truncate text-sm font-semibold">
					{form.name.trim() || (current ? current.name : 'New webhook')}
				</h1>
				<p class="text-2xs text-muted-foreground">
					{#if current}Webhook #{current.id}{:else}Not saved yet{/if}
					{#if dirty}<span class="ml-1 text-amber-600 dark:text-amber-400">· unsaved changes</span
						>{/if}
				</p>
			</div>
		</div>

		<div class="flex items-center gap-2">
			<label
				class="flex h-8 cursor-pointer items-center gap-2 rounded-md border px-2.5 text-xs"
				title={form.enabled
					? 'Deliveries are sent. Switch off to pause the webhook.'
					: 'Disabled: nothing is sent, except tests.'}
			>
				<Switch
					checked={form.enabled}
					onCheckedChange={(v: boolean) => (form.enabled = v)}
					aria-label="Enabled"
				/>
				<span class={form.enabled ? '' : 'text-muted-foreground'}>
					{form.enabled ? 'Enabled' : 'Disabled'}
				</span>
			</label>
			<div class="mx-1 h-5 w-px bg-border"></div>
			{#if tab !== 'deliveries'}
				<Button
					variant={showPreview ? 'secondary' : 'ghost'}
					size="sm"
					class="hidden h-8 text-xs lg:inline-flex"
					aria-pressed={showPreview}
					onclick={() => (showPreview = !showPreview)}
					title={showPreview ? 'Hide the request preview' : 'Show the request preview'}
				>
					<PanelRightIcon size={13} class="mr-1" /> Preview
				</Button>
			{/if}
			<Button
				variant="outline"
				size="sm"
				class="h-8 text-xs"
				onclick={sendTest}
				disabled={testing || !form.url.trim()}
				title={`Send the ${previewEventLabel || 'selected'} sample event now, with the settings as they are on screen`}
			>
				{#if testing}
					<LoaderCircleIcon size={13} class="mr-1 animate-spin" />
				{:else}
					<FlaskConicalIcon size={13} class="mr-1" />
				{/if}
				Send test
			</Button>
			<Button
				size="sm"
				class="h-8 text-xs"
				onclick={save}
				disabled={saving || (!dirty && !!current)}
				data-testid="webhook-save"
			>
				<SaveIcon size={13} class="mr-1" />
				{saving ? 'Saving…' : current ? 'Save' : 'Create webhook'}
			</Button>
		</div>
	</header>

	<div class="flex min-h-0 flex-1">
		<Tabs.Root bind:value={tab} class="flex min-h-0 min-w-0 flex-1 flex-col">
			<Tabs.List
				class="h-auto w-full shrink-0 justify-start gap-1 rounded-none border-b bg-transparent p-0 px-4"
			>
				{#each TABS as { value, label } (value)}
					{@const count = errorCounts[value]}
					<Tabs.Trigger {value} class={TAB_TRIGGER}>
						{label}
						{#if count}
							<span
								class="ml-1.5 rounded-full bg-destructive px-1.5 text-2xs text-destructive-foreground"
								>{count}</span
							>
						{:else if value === 'events' && subscribedCount}
							<span class="ml-1.5 rounded-full bg-muted px-1.5 text-2xs text-muted-foreground"
								>{subscribedCount}</span
							>
						{/if}
					</Tabs.Trigger>
				{/each}
				<Tabs.Trigger
					value="deliveries"
					class={TAB_TRIGGER}
					disabled={!current}
					title={current ? undefined : 'Save the webhook first'}
				>
					Deliveries
				</Tabs.Trigger>
			</Tabs.List>

			<!-- General -->
			<Tabs.Content value="general" class={TAB_CONTENT}>
				<div class={CONTENT}>
					<FormSection
						title="Identity"
						description="How the webhook appears in the list and in the delivery logs."
					>
						<div class="flex flex-col gap-1.5">
							<label class="text-xs font-medium" for="webhook-name">Name</label>
							<Input
								id="webhook-name"
								class="h-8 text-sm"
								maxlength={255}
								placeholder="e.g. SOC Slack channel"
								bind:value={form.name}
							/>
							{@render fieldError('name')}
						</div>
						<div class="flex flex-col gap-1.5">
							<label class="text-xs font-medium" for="webhook-description">
								Description <span class="font-normal text-muted-foreground">(optional)</span>
							</label>
							<Textarea
								id="webhook-description"
								rows={3}
								class="text-xs md:text-xs"
								placeholder="What receives these events, and who owns it"
								bind:value={form.description}
							/>
						</div>
					</FormSection>
					<FormSection
						title="How it works"
						description="Check the preview on the right, send a test, then save. Deliveries run in the background, are retried on failure and logged under Deliveries."
					>
						<ol class="grid grid-cols-1 gap-3 md:grid-cols-3">
							{#each STEPS as step, i (step.tab)}
								<li>
									<button
										type="button"
										class="group flex h-full w-full flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/40"
										onclick={() => (tab = step.tab)}
									>
										<span class="flex items-center gap-2 text-xs font-semibold">
											<span
												class="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-2xs group-hover:bg-primary group-hover:text-primary-foreground"
												>{i + 1}</span
											>
											{step.title}
											<ArrowRightIcon
												size={12}
												class="ml-auto text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
											/>
										</span>
										<span class="text-2xs leading-relaxed text-muted-foreground">{step.text}</span>
									</button>
								</li>
							{/each}
						</ol>
					</FormSection>
				</div>
			</Tabs.Content>

			<!-- Events -->
			<Tabs.Content value="events" class={TAB_CONTENT}>
				<div class={CONTENT}>
					<EventsPicker
						{catalogue}
						bind:allEvents={form.allEvents}
						bind:selected={form.events}
						bind:manualLabel={form.manual_label}
						labelFallback={form.name.trim()}
						error={fieldErrors('events')}
						labelError={fieldErrors('manual_label')}
					/>

					<FormSection
						title="Condition"
						description="Optional. A Jinja expression over the event (same variables as the body): the webhook only fires when it is true."
					>
						<div class="flex flex-col gap-1.5">
							<Input
								id="webhook-condition"
								aria-label="Condition"
								class="h-8 font-mono text-xs"
								placeholder={"e.g. data.alert_severity_id >= 4 and 'phishing' in (data.alert_tags or '')"}
								bind:value={form.condition}
							/>
							{@render fieldError('condition')}
							<p class="text-2xs text-muted-foreground">
								The preview tells whether the sample event matches. Examples:
								<code class="font-mono">case.id == 12</code>,
								<code class="font-mono">actor.login != 'automation'</code>,
								<code class="font-mono">object_type == 'alert'</code>.
							</p>
						</div>
					</FormSection>
				</div>
			</Tabs.Content>

			<!-- Request -->
			<Tabs.Content value="request" class={TAB_CONTENT}>
				<div class={CONTENT}>
					<FormSection title="Destination">
						<div class="flex flex-wrap items-center gap-2">
							<ChoiceGroup
								options={METHODS.map((m) => ({ value: m, label: m }))}
								bind:value={form.method}
								ariaLabel="HTTP method"
							/>
							<Input
								class="h-8 min-w-[280px] flex-1 font-mono text-xs"
								placeholder={'https://hooks.example.com/services/… — {{ variables }} allowed'}
								bind:value={form.url}
								aria-label="URL"
								data-testid="webhook-url"
							/>
						</div>
						{@render fieldError('url')}
						{#if settings && !settings.allow_private_egress}
							<p class="text-2xs text-muted-foreground">
								Private, loopback, link-local and reserved addresses are refused on this instance (<code
									class="font-mono">IRIS_WEBHOOKS_ALLOW_PRIVATE_EGRESS=False</code
								>).
							</p>
						{/if}
					</FormSection>

					<FormSection title="Query parameters">
						<KeyValueEditor
							bind:entries={form.query_params}
							addLabel="Add parameter"
							error={fieldErrors('query_params')}
							testId="webhook-query-params"
						/>
					</FormSection>

					<FormSection
						title="Headers"
						description="A header of yours replaces the one IRIS adds under the same name. Mark a value secret to encrypt it and mask it in logs."
					>
						<KeyValueEditor
							bind:entries={form.headers}
							addLabel="Add header"
							namePlaceholder="Header name"
							implicit={implicitHeaders}
							error={fieldErrors('headers')}
							testId="webhook-headers"
						/>
					</FormSection>

					<FormSection
						title="Authentication"
						description="Sent as Authorization, encrypted at rest and masked in logs. For an API key in a custom header, add a secret header instead."
					>
						<ChoiceGroup
							options={AUTH_TYPES}
							bind:value={form.auth_type}
							onChange={onAuthTypeChange}
							ariaLabel="Authentication"
						/>
						{#if form.auth_type !== 'none'}
							<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
								{#if form.auth_type === 'basic'}
									<div class="flex flex-col gap-1.5">
										<label class="text-xs font-medium" for="webhook-auth-user">Username</label>
										<Input
											id="webhook-auth-user"
											class="h-8 text-xs"
											autocomplete="off"
											bind:value={form.auth_username}
										/>
										{@render fieldError('auth_username')}
									</div>
								{/if}
								<div class="flex flex-col gap-1.5">
									<label class="text-xs font-medium" for="webhook-auth-secret">
										{form.auth_type === 'basic' ? 'Password' : 'Token'}
									</label>
									<div class="relative">
										<Input
											id="webhook-auth-secret"
											class="h-8 pr-8 font-mono text-xs"
											type={showAuthSecret ? 'text' : 'password'}
											autocomplete="new-password"
											placeholder={form.auth_secret_stored ? '•••••• stored — type to replace' : ''}
											bind:value={form.auth_secret}
										/>
										{@render secretToggle(showAuthSecret, () => (showAuthSecret = !showAuthSecret))}
									</div>
									{@render fieldError('auth_secret')}
								</div>
							</div>
						{/if}
					</FormSection>

					<FormSection
						title="Payload signing"
						description="Lets the receiver check a request comes from IRIS."
					>
						{#snippet actions()}
							{#if form.signing_secret_stored && !form.signing_secret_clear}
								<span
									class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-2xs text-emerald-700 dark:text-emerald-300"
								>
									Secret stored
								</span>
							{:else if form.signing_secret_clear}
								<span class="rounded-full bg-muted px-2 py-0.5 text-2xs text-muted-foreground">
									Removed on save
								</span>
							{/if}
						{/snippet}
						<div class="flex flex-wrap items-center gap-2">
							<div class="relative w-[420px] max-w-full">
								<Input
									class="h-8 pr-8 font-mono text-xs"
									type={showSigningSecret ? 'text' : 'password'}
									autocomplete="new-password"
									placeholder={form.signing_secret_stored && !form.signing_secret_clear
										? '•••••• stored — type to replace'
										: 'No signing secret'}
									bind:value={form.signing_secret}
									oninput={() => (form.signing_secret_clear = false)}
									aria-label="Signing secret"
								/>
								{@render secretToggle(
									showSigningSecret,
									() => (showSigningSecret = !showSigningSecret)
								)}
							</div>
							<Button
								variant="outline"
								size="sm"
								class="h-8 text-xs"
								onclick={generateSigningSecret}
							>
								<DicesIcon size={13} class="mr-1" /> Generate
							</Button>
							{#if form.signing_secret_stored && !form.signing_secret_clear}
								<Button
									variant="ghost"
									size="sm"
									class="h-8 text-xs text-destructive hover:text-destructive"
									onclick={() => {
										form.signing_secret = '';
										form.signing_secret_clear = true;
									}}
								>
									Remove
								</Button>
							{:else if form.signing_secret_clear}
								<Button
									variant="ghost"
									size="sm"
									class="h-8 text-xs"
									onclick={() => (form.signing_secret_clear = false)}
								>
									Keep it
								</Button>
							{/if}
						</div>
						<p class="text-2xs text-muted-foreground">
							Each request carries <code class="font-mono">X-IRIS-Timestamp</code> and
							<code class="font-mono">X-IRIS-Signature: sha256=&lt;hex&gt;</code>, the HMAC-SHA256
							of <code class="font-mono">"&lt;timestamp&gt;.&lt;raw body&gt;"</code> with this secret.
							Copy a generated secret now: it can't be shown again once saved.
						</p>
					</FormSection>

					<FormSection title="Delivery">
						<div class="flex flex-col gap-4">
							<label class="flex cursor-pointer items-start gap-3">
								<Switch
									checked={form.verify_tls}
									onCheckedChange={(v: boolean) => (form.verify_tls = v)}
									aria-label="Verify TLS certificate"
								/>
								<span class="flex flex-col gap-0.5">
									<span class="text-xs font-medium">Verify the TLS certificate</span>
									<span class="text-2xs text-muted-foreground">
										Turn off only for a receiver with a self-signed or internal-CA certificate.
									</span>
								</span>
							</label>
							{#if !form.verify_tls}
								<div
									class="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
									data-testid="webhook-tls-warning"
								>
									<ShieldAlertIcon size={14} class="mt-0.5 shrink-0" />
									<span>
										Certificate checks are off: anyone able to intercept the traffic can read the
										payload and any credentials sent with it, or impersonate the receiver.
									</span>
								</div>
							{/if}
							<label class="flex cursor-pointer items-start gap-3">
								<Switch
									checked={form.follow_redirects}
									onCheckedChange={(v: boolean) => (form.follow_redirects = v)}
									aria-label="Follow redirects"
								/>
								<span class="flex flex-col gap-0.5">
									<span class="text-xs font-medium">Follow redirects</span>
									<span class="text-2xs text-muted-foreground">
										Secret headers are dropped when the host changes.
									</span>
								</span>
							</label>
							<label class="flex cursor-pointer items-start gap-3">
								<Switch
									checked={form.use_proxy}
									onCheckedChange={(v: boolean) => (form.use_proxy = v)}
									aria-label="Use the proxy"
								/>
								<span class="flex flex-col gap-0.5">
									<span class="text-xs font-medium">Use the proxy</span>
									<span class="text-2xs text-muted-foreground">
										{#if settings && !settings.proxy_configured}
											No proxy is configured on this instance: requests go out directly either way.
										{:else}
											Through the proxy of the server settings, or the <code class="font-mono"
												>HTTP(S)_PROXY</code
											> variables. Turn off to connect directly — for instance when the proxy refuses
											this host.
										{/if}
									</span>
								</span>
							</label>
							<div class="flex flex-wrap gap-6">
								<div class="flex flex-col gap-1.5">
									<label class="text-xs font-medium" for="webhook-timeout">
										Timeout <span class="font-normal text-muted-foreground">(seconds, 1–60)</span>
									</label>
									<Input
										id="webhook-timeout"
										type="number"
										min={1}
										max={60}
										class="h-8 w-28 text-xs"
										bind:value={form.timeout_seconds}
									/>
									{@render fieldError('timeout_seconds')}
								</div>
								<div class="flex flex-col gap-1.5">
									<label class="text-xs font-medium" for="webhook-retries">
										Retries <span class="font-normal text-muted-foreground">(0–10)</span>
									</label>
									<Input
										id="webhook-retries"
										type="number"
										min={0}
										max={10}
										class="h-8 w-28 text-xs"
										bind:value={form.max_retries}
									/>
									{@render fieldError('max_retries')}
								</div>
							</div>
							<p class="text-2xs text-muted-foreground">
								Network errors, timeouts, 408, 425, 429 and 5xx answers are retried with an
								increasing delay; other answers are final.
							</p>
						</div>
					</FormSection>

					{#each Object.entries(errors).filter(([f]) => tabOfField(f) === 'request' && !HANDLED_REQUEST_FIELDS.includes(f.split('.')[0])) as [field, messages] (field)}
						<p class="flex items-center gap-1 text-xs text-destructive">
							<TriangleAlertIcon size={12} />
							<span class="font-mono">{field}</span>: {messages.join(', ')}
						</p>
					{/each}
				</div>
			</Tabs.Content>

			<!-- Body -->
			<Tabs.Content
				value="body"
				class="mt-0 flex min-h-0 flex-1 flex-col overflow-y-auto px-8 py-6"
			>
				<BodyEditor bind:form context={previewContext} {errors} />
			</Tabs.Content>

			<!-- Deliveries -->
			<Tabs.Content value="deliveries" class={TAB_CONTENT}>
				{#if current}
					<DeliveriesLog webhookId={current.id} {catalogue} reloadToken={deliveriesReload} />
				{/if}
			</Tabs.Content>
		</Tabs.Root>

		<!-- Stays mounted when hidden: the Body tab's variables come from it. -->
		{#if tab !== 'deliveries'}
			<aside
				class={`hidden w-[clamp(380px,36vw,620px)] shrink-0 border-l bg-muted/10 ${showPreview ? 'lg:block' : ''}`}
			>
				<PreviewPanel
					{body}
					webhookId={current?.id ?? null}
					{eventOptions}
					bind:event={previewEvent}
					onContext={(c) => (previewContext = c)}
				/>
			</aside>
		{/if}
	</div>
</div>

<TestResultDialog bind:open={testOpen} result={testResult} eventLabel={previewEventLabel} />

<ConfirmationDialog
	bind:open={confirmLeaveOpen}
	title="Discard unsaved changes?"
	message="Your changes to this webhook have not been saved."
	confirmText="Discard"
	onConfirm={onClose}
/>
