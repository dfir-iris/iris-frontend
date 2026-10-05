<!--
  Live render of the request the form would send, re-run (debounced)
  on every change. The sample is the last real payload of the chosen
  event when one was ever delivered, else a synthetic one — nothing is
  sent.
-->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		CircleCheckIcon,
		CircleXIcon,
		FilterIcon,
		LoaderCircleIcon,
		TriangleAlertIcon
	} from 'lucide-svelte';
	import {
		WebhooksService,
		type WebhookBody,
		type WebhookEvent,
		type WebhookPreview
	} from '$lib/services/webhooks.service';
	import { describeFieldErrors, extractFieldErrors } from '../helpers/webhook-form';
	import HttpMessage from './HttpMessage.svelte';

	type Props = {
		body: WebhookBody;
		webhookId: number | null;
		eventOptions: WebhookEvent[];
		event: string;
		onContext?: (context: Record<string, unknown> | null) => void;
	};

	let { body, webhookId, eventOptions, event = $bindable(), onContext }: Props = $props();

	const automaticOptions = $derived(eventOptions.filter((e) => !e.manual));
	const manualOptions = $derived(eventOptions.filter((e) => e.manual));

	let preview = $state<WebhookPreview | null>(null);
	let problem = $state<string | null>(null);
	let loading = $state(false);

	let timer: ReturnType<typeof setTimeout> | undefined;
	let generation = 0;

	const signature = $derived(JSON.stringify({ body, event, webhookId }));

	$effect(() => {
		const current = signature;
		clearTimeout(timer);
		timer = setTimeout(() => run(current), 450);
	});

	onDestroy(() => clearTimeout(timer));

	async function run(current: string) {
		const mine = ++generation;
		const input = JSON.parse(current) as {
			body: WebhookBody;
			event: string;
			webhookId: number | null;
		};
		if (!input.event) return;
		loading = true;
		try {
			const res = await WebhooksService.preview({
				webhook: input.body,
				webhook_id: input.webhookId,
				event: input.event
			});
			if (mine !== generation) return;
			if (res.ok && res.data && typeof res.data === 'object') {
				preview = res.data as WebhookPreview;
				problem = null;
				onContext?.(preview.context);
			} else {
				const fields = extractFieldErrors(res.data);
				problem =
					describeFieldErrors(fields) ||
					(res.data as { message?: string } | null)?.message ||
					res.error?.message ||
					'Preview failed';
			}
		} finally {
			if (mine === generation) loading = false;
		}
	}
</script>

<div class="flex h-full min-h-0 flex-col" data-testid="webhook-preview">
	<header class="flex flex-col gap-2 border-b px-4 py-3">
		<div class="flex items-center justify-between gap-2">
			<h2 class="flex items-center gap-2 text-sm font-semibold">
				Request preview
				{#if loading}
					<LoaderCircleIcon size={12} class="animate-spin text-muted-foreground" />
				{/if}
			</h2>
		</div>
		<select
			class="h-8 w-full rounded-md border bg-background px-2 text-xs"
			bind:value={event}
			aria-label="Sample event"
		>
			{#if automaticOptions.length}
				<optgroup label="Automatic events">
					{#each automaticOptions as option (option.name)}
						<option value={option.name}>{option.object_label} · {option.label}</option>
					{/each}
				</optgroup>
			{/if}
			{#if manualOptions.length}
				<optgroup label="Manual triggers">
					{#each manualOptions as option (option.name)}
						<option value={option.name}>{option.label}</option>
					{/each}
				</optgroup>
			{/if}
		</select>
	</header>

	<div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
		{#if problem}
			<div
				class="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-200"
			>
				<TriangleAlertIcon size={12} class="mt-0.5 shrink-0" />
				<span class="whitespace-pre-line">{problem}</span>
			</div>
		{/if}

		{#if preview}
			<div class="flex flex-wrap items-center gap-1.5 text-2xs">
				<span
					class="rounded bg-muted px-1.5 py-0.5 text-muted-foreground"
					title={preview.sample_source === 'last_delivery'
						? 'The payload of the last real delivery of this event'
						: 'No delivery of this event yet — a synthetic payload with placeholder values'}
				>
					{preview.sample_source === 'last_delivery' ? 'Last real event' : 'Synthetic sample'}
				</span>
				{#if preview.condition.error}
					<span class="flex items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 text-red-700">
						<CircleXIcon size={10} /> Condition error: {preview.condition.error}
					</span>
				{:else if preview.condition.matches === false}
					<span
						class="flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-300"
					>
						<FilterIcon size={10} /> Condition false — this event would be skipped
					</span>
				{:else if preview.condition.matches === true}
					<span
						class="flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300"
					>
						<CircleCheckIcon size={10} /> Condition matches
					</span>
				{/if}
			</div>

			{#each preview.request.errors as error (`${error.field}:${error.message}`)}
				<div
					class="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-2xs text-destructive"
				>
					<CircleXIcon size={12} class="mt-0.5 shrink-0" />
					<span><span class="font-mono">{error.field}</span> — {error.message}</span>
				</div>
			{/each}

			<HttpMessage
				startLine={`${preview.request.method} ${preview.request.url || '(no URL)'}`}
				headers={preview.request.headers}
				body={preview.request.body}
				maxHeight="max-h-none"
			/>
			<p class="text-2xs text-muted-foreground">
				Secrets are masked. Signature and delivery headers get their real values at send time.
			</p>
		{:else if !problem}
			<p class="py-6 text-center text-xs text-muted-foreground">Rendering…</p>
		{/if}
	</div>
</div>
