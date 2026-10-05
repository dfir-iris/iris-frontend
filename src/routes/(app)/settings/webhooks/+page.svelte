<!--
  Native webhooks. Server administrators send IRIS events to external
  HTTP endpoints (chat tools, SOAR, ticketing…) with full control of the
  request: method, URL, query, headers, authentication, body template,
  TLS verification, timeout and retries. Deliveries are logged and can
  be inspected and replayed.

  List view → editor (full pane). `?webhook=<id>` opens the editor
  directly, so a webhook's delivery log can be linked to.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { replaceState } from '$app/navigation';
	import {
		CircleAlertIcon,
		CopyIcon,
		ImportIcon,
		InfoIcon,
		PencilIcon,
		PlusIcon,
		RefreshCwIcon,
		ShieldAlertIcon,
		Trash2Icon,
		WebhookIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Switch } from '$lib/components/ui/switch';
	import { toast } from '$lib/components/ui/toast';
	import ApiError from '$lib/components/ui/api-error.svelte';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import { formatDateTime } from '$lib/utils/time-formatter';
	import {
		WebhooksService,
		type Webhook,
		type WebhookEvent,
		type WebhookLegacyImportResult,
		type WebhookLegacyStatus,
		type WebhookSettings
	} from '$lib/services/webhooks.service';
	import {
		STATUS_LABELS,
		STATUS_TONES,
		describeFieldErrors,
		destinationHost,
		duplicateForm,
		emptyForm,
		extractFieldErrors,
		formFromWebhook,
		summarizeEvents,
		type EditorTab,
		type WebhookForm
	} from './helpers/webhook-form';
	import WebhookEditor from './components/WebhookEditor.svelte';

	let webhooks = $state<Webhook[]>([]);
	let catalogue = $state<WebhookEvent[]>([]);
	let settings = $state<WebhookSettings | null>(null);
	let legacy = $state<WebhookLegacyStatus | null>(null);
	let loading = $state(true);
	let loadError = $state<string | null>(null);

	// Editor: `editorKey` remounts it so its state starts fresh.
	let editor = $state<{
		key: number;
		webhook: Webhook | null;
		form: WebhookForm;
		tab: EditorTab;
	} | null>(null);
	let editorKey = 0;

	let confirmDeleteOpen = $state(false);
	let pendingDelete = $state<Webhook | null>(null);
	let toggling = $state<Record<number, boolean>>({});

	let confirmImportOpen = $state(false);
	let importing = $state(false);
	let importResult = $state<WebhookLegacyImportResult | null>(null);
	let importResultOpen = $state(false);

	async function loadList() {
		const res = await WebhooksService.list();
		if (res.ok && Array.isArray(res.data)) {
			webhooks = res.data;
			loadError = null;
		} else {
			loadError = res.error?.message ?? 'Failed to load webhooks';
		}
	}

	async function loadAll() {
		loading = true;
		try {
			const [, events, srv, leg] = await Promise.all([
				loadList(),
				WebhooksService.events(),
				WebhooksService.settings(),
				WebhooksService.legacyStatus()
			]);
			if (events.ok && Array.isArray(events.data)) catalogue = events.data;
			if (srv.ok && srv.data && typeof srv.data === 'object') settings = srv.data;
			if (leg.ok && leg.data && typeof leg.data === 'object') legacy = leg.data;
		} finally {
			loading = false;
		}
	}

	onMount(async () => {
		await loadAll();
		const id = Number(new URL(window.location.href).searchParams.get('webhook'));
		if (id) await openEdit(id);
	});

	function setUrl(id: number | null) {
		const url = new URL(window.location.href);
		if (id) url.searchParams.set('webhook', String(id));
		else url.searchParams.delete('webhook');
		replaceState(url, {});
	}

	function openNew() {
		editor = { key: ++editorKey, webhook: null, form: emptyForm(), tab: 'general' };
		setUrl(null);
	}

	async function openEdit(id: number, tab: EditorTab = 'general') {
		const res = await WebhooksService.get(id);
		if (res.ok && res.data && typeof res.data === 'object') {
			const webhook = res.data as Webhook;
			editor = { key: ++editorKey, webhook, form: formFromWebhook(webhook), tab };
			setUrl(id);
		} else {
			toast({ title: 'Webhook not found', variant: 'destructive' });
			setUrl(null);
		}
	}

	async function openDuplicate(id: number) {
		const res = await WebhooksService.get(id);
		if (res.ok && res.data && typeof res.data === 'object') {
			editor = {
				key: ++editorKey,
				webhook: null,
				form: duplicateForm(res.data as Webhook),
				tab: 'general'
			};
			setUrl(null);
		}
	}

	function closeEditor() {
		editor = null;
		setUrl(null);
		loadList();
	}

	function onSaved(webhook: Webhook) {
		setUrl(webhook.id);
		loadList();
	}

	async function toggleEnabled(webhook: Webhook, enabled: boolean) {
		toggling[webhook.id] = true;
		try {
			const res = await WebhooksService.update(webhook.id, { enabled });
			if (res.ok && res.data && typeof res.data === 'object') {
				webhooks = webhooks.map((w) => (w.id === webhook.id ? (res.data as Webhook) : w));
			} else if (res.status === 400) {
				const fields = extractFieldErrors(res.data);
				toast({
					title: `Cannot ${enabled ? 'enable' : 'disable'} "${webhook.name}"`,
					description:
						describeFieldErrors(fields) || (res.data as { message?: string } | null)?.message,
					variant: 'destructive'
				});
			}
		} finally {
			toggling[webhook.id] = false;
		}
	}

	function requestDelete(webhook: Webhook) {
		pendingDelete = webhook;
		confirmDeleteOpen = true;
	}

	async function confirmDelete() {
		if (!pendingDelete) return;
		const res = await WebhooksService.remove(pendingDelete.id);
		if (res.ok) {
			toast({ title: 'Webhook deleted', variant: 'success' });
			await loadList();
		} else if (res.status !== 403) {
			toast({
				title: 'Failed to delete the webhook',
				description: res.error?.message,
				variant: 'destructive'
			});
		}
		pendingDelete = null;
	}

	async function runImport() {
		importing = true;
		try {
			const res = await WebhooksService.legacyImport();
			if (res.ok && res.data && typeof res.data === 'object') {
				importResult = res.data as WebhookLegacyImportResult;
				importResultOpen = true;
				await loadList();
			} else {
				toast({
					title: 'Import failed',
					description: (res.data as { message?: string } | null)?.message ?? res.error?.message,
					variant: 'destructive'
				});
			}
		} finally {
			importing = false;
		}
	}

	function deliveriesSummary(webhook: Webhook): { ok: number; failed: number } {
		const counts = webhook.deliveries_24h ?? {};
		return { ok: counts.success ?? 0, failed: counts.failed ?? 0 };
	}
</script>

<svelte:head>
	<title>Webhooks</title>
</svelte:head>

{#if editor}
	{#key editor.key}
		<WebhookEditor
			webhook={editor.webhook}
			initialForm={editor.form}
			initialTab={editor.tab}
			{catalogue}
			{settings}
			onClose={closeEditor}
			{onSaved}
		/>
	{/key}
{:else}
	<div class="flex h-full w-full flex-col overflow-hidden">
		<header class="flex items-center justify-between gap-3 border-b px-5 py-3">
			<div class="flex items-center gap-2.5">
				<WebhookIcon size={18} class="text-muted-foreground" />
				<div class="leading-tight">
					<h1 class="text-sm font-semibold">Webhooks</h1>
					<p class="text-xs text-muted-foreground">
						Send IRIS events to external services — chat, SOAR, ticketing — as fully customisable
						HTTP requests.
					</p>
				</div>
			</div>
			<div class="flex items-center gap-1.5">
				<Button variant="outline" size="sm" class="h-7" onclick={loadAll} disabled={loading}>
					<RefreshCwIcon size={12} class={`mr-1 ${loading ? 'animate-spin' : ''}`} />
					Refresh
				</Button>
				<Button size="sm" class="h-7" onclick={openNew} data-testid="webhook-new">
					<PlusIcon size={12} class="mr-1" />
					New webhook
				</Button>
			</div>
		</header>

		<div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
			{#if loadError}
				<ApiError error={loadError} onRetry={loadAll} />
			{/if}

			{#if legacy?.installed && legacy.webhook_count > 0}
				<section
					class="flex flex-wrap items-start justify-between gap-3 rounded-md border border-blue-500/30 bg-blue-500/5 p-3"
					data-testid="webhook-legacy-banner"
				>
					<div class="flex items-start gap-2 text-xs">
						<ImportIcon size={14} class="mt-0.5 shrink-0 text-blue-600 dark:text-blue-300" />
						<div>
							<p class="font-medium">
								The IrisWebHooks module is installed{legacy.active ? ' and active' : ''} with {legacy.webhook_count}
								hook{legacy.webhook_count === 1 ? '' : 's'}.
							</p>
							<p class="text-muted-foreground">
								Import them as native webhooks to get the preview, the delivery log and retries.
								They are created disabled — enable them once the module is
								<a class="underline hover:text-foreground" href="/settings/modules">disabled</a>, or
								every event would be sent twice.
							</p>
						</div>
					</div>
					<Button
						variant="outline"
						size="sm"
						class="h-7"
						onclick={() => (confirmImportOpen = true)}
						disabled={importing}
					>
						<ImportIcon size={12} class="mr-1" />
						{importing ? 'Importing…' : 'Import'}
					</Button>
				</section>
			{:else if legacy?.installed && legacy.error}
				<p class="flex items-center gap-2 text-2xs text-muted-foreground">
					<CircleAlertIcon size={12} /> IrisWebHooks module configuration unreadable: {legacy.error}
				</p>
			{/if}

			{#if settings && !settings.instance_url_configured}
				<p
					class="flex items-start gap-2 rounded-md border bg-muted/30 p-2 text-2xs text-muted-foreground"
				>
					<InfoIcon size={12} class="mt-0.5 shrink-0" />
					<span>
						<code class="font-mono">IRIS_ALLOW_ORIGIN</code> is not set, so IRIS does not know its
						public address: the <code class="font-mono">url</code> of an event (the link back to the
						case, alert…) is empty.
					</span>
				</p>
			{/if}

			{#if loading && webhooks.length === 0}
				<p class="py-10 text-center text-xs text-muted-foreground">Loading…</p>
			{:else if webhooks.length === 0 && !loadError}
				<div
					class="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground"
					data-testid="webhook-empty"
				>
					<WebhookIcon size={32} class="opacity-40" />
					<p class="text-sm">No webhooks yet.</p>
					<p class="max-w-md text-xs">
						Post to a Slack or Teams channel when an alert comes in, open a ticket when a case is
						created, or feed every change to your SOAR.
					</p>
					<Button size="sm" class="mt-2 h-7" onclick={openNew}>
						<PlusIcon size={12} class="mr-1" /> Create a webhook
					</Button>
				</div>
			{:else if webhooks.length > 0}
				<div class="overflow-hidden rounded-md border">
					<table class="w-full text-xs" data-testid="webhook-table">
						<thead
							class="bg-muted/40 text-left text-2xs uppercase tracking-wide text-muted-foreground"
						>
							<tr>
								<th class="w-16 px-3 py-2">On</th>
								<th class="px-3 py-2">Name</th>
								<th class="w-48 px-3 py-2">Events</th>
								<th class="px-3 py-2">Destination</th>
								<th class="w-56 px-3 py-2">Last delivery</th>
								<th class="w-28 px-3 py-2" title="Delivered / failed in the last 24 hours">24h</th>
								<th class="w-28 px-3 py-2"></th>
							</tr>
						</thead>
						<tbody>
							{#each webhooks as webhook (webhook.id)}
								{@const last = webhook.last_delivery}
								{@const day = deliveriesSummary(webhook)}
								<tr class="border-t hover:bg-muted/20">
									<td class="px-3 py-2">
										<Switch
											checked={webhook.enabled}
											disabled={toggling[webhook.id]}
											onCheckedChange={(v: boolean) => toggleEnabled(webhook, v)}
											aria-label={`Enable ${webhook.name}`}
										/>
									</td>
									<td class="max-w-0 px-3 py-2">
										<button
											type="button"
											class="block max-w-full truncate text-left font-medium underline-offset-2 hover:underline"
											onclick={() => openEdit(webhook.id)}
										>
											{webhook.name}
										</button>
										{#if webhook.description}
											<div class="truncate text-2xs text-muted-foreground">
												{webhook.description}
											</div>
										{/if}
									</td>
									<td class="px-3 py-2 text-muted-foreground">
										{summarizeEvents(webhook.events, catalogue)}
										{#if webhook.condition}
											<span class="ml-1 rounded bg-muted px-1 text-2xs" title={webhook.condition}
												>if…</span
											>
										{/if}
									</td>
									<td class="max-w-0 px-3 py-2">
										<div class="flex items-center gap-1.5">
											<span class="rounded bg-muted px-1 font-mono text-2xs">{webhook.method}</span>
											<span class="truncate font-mono text-2xs" title={webhook.url}>
												{destinationHost(webhook.url)}
											</span>
											{#if !webhook.verify_tls}
												<span title="TLS certificate not verified">
													<ShieldAlertIcon size={12} class="shrink-0 text-amber-600" />
												</span>
											{/if}
										</div>
									</td>
									<td class="px-3 py-2">
										{#if last}
											<button
												type="button"
												class="flex items-center gap-1.5 text-left"
												title={last.error ?? 'Open the delivery log'}
												onclick={() => openEdit(webhook.id, 'deliveries')}
											>
												<span class={`rounded px-1.5 py-0.5 text-2xs ${STATUS_TONES[last.status]}`}>
													{last.response_status ?? STATUS_LABELS[last.status]}
												</span>
												<span class="text-2xs text-muted-foreground">
													{formatDateTime(last.created_at)}
												</span>
											</button>
										{:else}
											<span class="text-2xs text-muted-foreground">Never</span>
										{/if}
									</td>
									<td class="px-3 py-2 text-2xs">
										<span class="text-emerald-700 dark:text-emerald-400">{day.ok}</span>
										<span class="text-muted-foreground">/</span>
										<span
											class={day.failed
												? 'font-semibold text-red-700 dark:text-red-400'
												: 'text-muted-foreground'}>{day.failed}</span
										>
									</td>
									<td class="px-3 py-2">
										<div class="flex items-center justify-end gap-1">
											<Button
												variant="ghost"
												size="icon"
												class="h-6 w-6"
												aria-label="Edit webhook"
												onclick={() => openEdit(webhook.id)}
											>
												<PencilIcon size={12} />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												class="h-6 w-6"
												aria-label="Duplicate webhook"
												title="Duplicate (secrets must be entered again)"
												onclick={() => openDuplicate(webhook.id)}
											>
												<CopyIcon size={12} />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												class="h-6 w-6 text-destructive hover:text-destructive"
												aria-label="Delete webhook"
												onclick={() => requestDelete(webhook)}
											>
												<Trash2Icon size={12} />
											</Button>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	</div>
{/if}

<ConfirmationDialog
	bind:open={confirmDeleteOpen}
	title="Delete webhook?"
	message={pendingDelete
		? `"${pendingDelete.name}" and its delivery log will be permanently deleted.`
		: ''}
	confirmText="Delete"
	confirmButtonVariant="destructive"
	onConfirm={confirmDelete}
/>

<ConfirmationDialog
	bind:open={confirmImportOpen}
	title="Import the IrisWebHooks module configuration?"
	message="Each hook of the module becomes a disabled native webhook. The module itself is left untouched. Hooks with the same name as an existing webhook are skipped."
	confirmText="Import"
	confirmButtonVariant="default"
	onConfirm={runImport}
/>

<Dialog.Root bind:open={importResultOpen}>
	<Dialog.Content class="flex max-h-[85vh] flex-col sm:max-w-[640px]">
		<Dialog.Header>
			<Dialog.Title class="text-sm">Import finished</Dialog.Title>
			<Dialog.Description class="text-xs">
				{importResult?.created.length ?? 0} created, {importResult?.skipped.length ?? 0} skipped. Review
				each one, then enable it.
			</Dialog.Description>
		</Dialog.Header>
		{#if importResult}
			<div class="min-h-0 flex-1 space-y-3 overflow-y-auto text-xs">
				{#each importResult.notes as note (note)}
					<p class="rounded-md border bg-muted/30 p-2 text-2xs text-muted-foreground">{note}</p>
				{/each}
				{#each importResult.created as item (item.id)}
					<div class="rounded-md border p-2">
						<button
							type="button"
							class="font-medium underline-offset-2 hover:underline"
							onclick={() => {
								importResultOpen = false;
								openEdit(item.id);
							}}
						>
							{item.name}
						</button>
						{#each item.warnings as warning (warning)}
							<p class="text-2xs text-amber-700 dark:text-amber-300">• {warning}</p>
						{/each}
					</div>
				{/each}
				{#each importResult.skipped as item (item.name)}
					<div class="rounded-md border border-destructive/30 p-2">
						<p class="font-medium">{item.name} <span class="text-destructive">— skipped</span></p>
						{#each Object.entries(item.errors) as [field, messages] (field)}
							<p class="text-2xs text-destructive">• {field}: {messages.join(', ')}</p>
						{/each}
						{#each item.warnings as warning (warning)}
							<p class="text-2xs text-muted-foreground">• {warning}</p>
						{/each}
					</div>
				{/each}
			</div>
		{/if}
		<Dialog.Footer>
			<Button size="sm" class="h-7" onclick={() => (importResultOpen = false)}>Close</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
