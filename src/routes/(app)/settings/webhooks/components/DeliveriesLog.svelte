<!--
  Delivery log of one webhook, newest first. Polls while a delivery is
  still pending or retrying so outcomes appear without a refresh.
-->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { ChevronLeftIcon, ChevronRightIcon, HistoryIcon, RefreshCwIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { formatDateTime } from '$lib/utils/time-formatter';
	import {
		WebhooksService,
		type WebhookDelivery,
		type WebhookDeliveryStatus,
		type WebhookEvent
	} from '$lib/services/webhooks.service';
	import { STATUS_LABELS, STATUS_TONES } from '../helpers/webhook-form';
	import DeliveryDialog from './DeliveryDialog.svelte';

	type Props = {
		webhookId: number;
		catalogue: WebhookEvent[];
		/** Bumped by the editor after a test send, to reload. */
		reloadToken?: number;
	};

	let { webhookId, catalogue, reloadToken = 0 }: Props = $props();

	const PER_PAGE = 25;
	const STATUSES = Object.keys(STATUS_LABELS) as WebhookDeliveryStatus[];

	let rows = $state<WebhookDelivery[]>([]);
	let total = $state(0);
	let lastPage = $state(1);
	let page = $state(1);
	let status = $state<WebhookDeliveryStatus | ''>('');
	let event = $state('');
	let loading = $state(false);

	let detailOpen = $state(false);
	let detailId = $state<number | null>(null);

	let poll: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		// Reload when the filters, the page or the token change.
		void [webhookId, status, event, page, reloadToken];
		load();
	});

	onDestroy(() => clearTimeout(poll));

	async function load(quiet = false) {
		clearTimeout(poll);
		if (!quiet) loading = true;
		try {
			const res = await WebhooksService.deliveries(webhookId, {
				status: status || null,
				event: event || null,
				page,
				per_page: PER_PAGE
			});
			if (res.ok && res.data && typeof res.data === 'object') {
				rows = res.data.data;
				total = res.data.total;
				lastPage = Math.max(1, res.data.last_page ?? 1);
			}
		} finally {
			loading = false;
		}
		if (rows.some((r) => r.status === 'pending' || r.status === 'retrying')) {
			poll = setTimeout(() => load(true), 4000);
		}
	}

	function openDetail(row: WebhookDelivery) {
		detailId = row.id;
		detailOpen = true;
	}

	function onRedelivered() {
		page = 1;
		load();
	}
</script>

<div class="flex flex-col gap-3" data-testid="webhook-deliveries">
	<div class="flex flex-wrap items-center gap-2">
		<select
			class="h-7 rounded-md border bg-background px-2 text-xs"
			bind:value={status}
			onchange={() => (page = 1)}
			aria-label="Status"
		>
			<option value="">All statuses</option>
			{#each STATUSES as s (s)}<option value={s}>{STATUS_LABELS[s]}</option>{/each}
		</select>
		<select
			class="h-7 max-w-72 rounded-md border bg-background px-2 text-xs"
			bind:value={event}
			onchange={() => (page = 1)}
			aria-label="Event"
		>
			<option value="">All events</option>
			{#each catalogue as e (e.name)}
				<option value={e.name}>{e.object_label} · {e.label}</option>
			{/each}
		</select>
		<Button variant="outline" size="sm" class="h-7" onclick={() => load()} disabled={loading}>
			<RefreshCwIcon size={12} class={`mr-1 ${loading ? 'animate-spin' : ''}`} />
			Refresh
		</Button>
		<span class="ml-auto text-2xs text-muted-foreground">{total} deliveries</span>
	</div>

	{#if rows.length === 0 && !loading}
		<div class="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
			<HistoryIcon size={28} class="opacity-40" />
			<p class="text-xs">No deliveries{status || event ? ' match these filters' : ' yet'}.</p>
			<p class="text-2xs">Use "Send test" to try the webhook now.</p>
		</div>
	{:else}
		<div class="overflow-hidden rounded-md border">
			<table class="w-full text-xs">
				<thead class="bg-muted/40 text-left text-2xs uppercase tracking-wide text-muted-foreground">
					<tr>
						<th class="w-24 px-3 py-2">Status</th>
						<th class="px-3 py-2">Event</th>
						<th class="w-20 px-3 py-2">HTTP</th>
						<th class="w-20 px-3 py-2">Time</th>
						<th class="w-16 px-3 py-2">Tries</th>
						<th class="w-24 px-3 py-2">Trigger</th>
						<th class="w-44 px-3 py-2">When</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as row (row.id)}
						<tr
							class="cursor-pointer border-t hover:bg-muted/20"
							onclick={() => openDetail(row)}
							title={row.error ?? 'Show details'}
						>
							<td class="px-3 py-2">
								<span class={`rounded px-1.5 py-0.5 text-2xs ${STATUS_TONES[row.status]}`}>
									{STATUS_LABELS[row.status]}
								</span>
							</td>
							<td class="max-w-0 px-3 py-2">
								<div class="truncate">{row.event_label}</div>
								{#if row.title || row.error}
									<div
										class={`truncate text-2xs ${row.error ? 'text-destructive' : 'text-muted-foreground'}`}
									>
										{row.error ?? row.title}
									</div>
								{/if}
							</td>
							<td class="px-3 py-2 font-mono">{row.response_status ?? '—'}</td>
							<td class="px-3 py-2 text-muted-foreground">
								{row.duration_ms !== null ? `${row.duration_ms} ms` : '—'}
							</td>
							<td class="px-3 py-2">{row.attempts}</td>
							<td class="px-3 py-2 capitalize text-muted-foreground">{row.trigger}</td>
							<td class="px-3 py-2 text-muted-foreground">
								{row.created_at ? formatDateTime(row.created_at) : '—'}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if lastPage > 1}
			<div class="flex items-center justify-end gap-2 text-2xs text-muted-foreground">
				<Button
					variant="outline"
					size="icon"
					class="h-6 w-6"
					aria-label="Previous page"
					disabled={page <= 1}
					onclick={() => (page -= 1)}
				>
					<ChevronLeftIcon size={12} />
				</Button>
				Page {page} / {lastPage}
				<Button
					variant="outline"
					size="icon"
					class="h-6 w-6"
					aria-label="Next page"
					disabled={page >= lastPage}
					onclick={() => (page += 1)}
				>
					<ChevronRightIcon size={12} />
				</Button>
			</div>
		{/if}
	{/if}
</div>

<DeliveryDialog bind:open={detailOpen} deliveryId={detailId} {onRedelivered} />
