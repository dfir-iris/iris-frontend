<!--
  One delivery: what was sent, what came back, the event payload, and
  a redeliver action that queues the same payload again.
-->
<script lang="ts">
	import { Redo2Icon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Tabs from '$lib/components/ui/tabs';
	import { ClipboardCopy } from '$lib/components/ui/clipboard-copy';
	import { toast } from '$lib/components/ui/toast';
	import { formatDateTime } from '$lib/utils/time-formatter';
	import {
		WebhooksService,
		type WebhookDelivery,
		type WebhookDeliveryDetail
	} from '$lib/services/webhooks.service';
	import { STATUS_LABELS, STATUS_TONES } from '../helpers/webhook-form';
	import HttpMessage from './HttpMessage.svelte';

	type Props = {
		open: boolean;
		deliveryId: number | null;
		onRedelivered?: (delivery: WebhookDelivery) => void;
	};

	let { open = $bindable(), deliveryId, onRedelivered }: Props = $props();

	let detail = $state<WebhookDeliveryDetail | null>(null);
	let loading = $state(false);
	let redelivering = $state(false);
	let tab = $state('request');

	$effect(() => {
		if (open && deliveryId !== null) load(deliveryId);
	});

	async function load(id: number) {
		loading = true;
		detail = null;
		tab = 'request';
		try {
			const res = await WebhooksService.delivery(id);
			if (res.ok && res.data && typeof res.data === 'object') {
				detail = res.data as WebhookDeliveryDetail;
			} else {
				toast({ title: 'Failed to load the delivery', variant: 'destructive' });
			}
		} finally {
			loading = false;
		}
	}

	async function redeliver() {
		if (!detail) return;
		redelivering = true;
		try {
			const res = await WebhooksService.redeliver(detail.id);
			if (res.ok && res.data && typeof res.data === 'object') {
				toast({ title: 'Redelivery queued', variant: 'success' });
				onRedelivered?.(res.data as WebhookDelivery);
				open = false;
			} else {
				toast({
					title: 'Failed to redeliver',
					description: (res.data as { message?: string } | null)?.message ?? res.error?.message,
					variant: 'destructive'
				});
			}
		} finally {
			redelivering = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="flex max-h-[90vh] flex-col sm:max-w-[860px]">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2 text-sm">
				Delivery #{deliveryId}
				{#if detail}
					<span class={`rounded px-1.5 py-0.5 text-2xs ${STATUS_TONES[detail.status]}`}>
						{STATUS_LABELS[detail.status]}
					</span>
				{/if}
			</Dialog.Title>
			<Dialog.Description class="text-xs">
				{detail ? `${detail.event_label}${detail.title ? ` — ${detail.title}` : ''}` : ''}
			</Dialog.Description>
		</Dialog.Header>

		{#if loading || !detail}
			<p class="py-8 text-center text-xs text-muted-foreground">Loading…</p>
		{:else}
			<dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
				<div>
					<dt class="text-2xs text-muted-foreground">HTTP status</dt>
					<dd class="font-mono">{detail.response_status ?? '—'}</dd>
				</div>
				<div>
					<dt class="text-2xs text-muted-foreground">Duration</dt>
					<dd>{detail.duration_ms !== null ? `${detail.duration_ms} ms` : '—'}</dd>
				</div>
				<div>
					<dt class="text-2xs text-muted-foreground">Attempts</dt>
					<dd>{detail.attempts}</dd>
				</div>
				<div>
					<dt class="text-2xs text-muted-foreground">Trigger</dt>
					<dd class="capitalize">{detail.trigger}</dd>
				</div>
				<div>
					<dt class="text-2xs text-muted-foreground">Created</dt>
					<dd>{detail.created_at ? formatDateTime(detail.created_at) : '—'}</dd>
				</div>
				<div>
					<dt class="text-2xs text-muted-foreground">Completed</dt>
					<dd>{detail.completed_at ? formatDateTime(detail.completed_at) : '—'}</dd>
				</div>
				<div class="col-span-2">
					<dt class="text-2xs text-muted-foreground">Delivery ID (X-IRIS-Delivery)</dt>
					<dd class="flex items-center gap-1 font-mono text-2xs">
						{detail.uuid ?? '—'}
						{#if detail.uuid}<ClipboardCopy value={detail.uuid} size={11} alwaysVisible />{/if}
					</dd>
				</div>
			</dl>

			{#if detail.error}
				<p
					class="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-2xs text-destructive"
				>
					{detail.error}
				</p>
			{/if}

			<Tabs.Root bind:value={tab} class="flex min-h-0 flex-1 flex-col">
				<Tabs.List class="w-fit">
					<Tabs.Trigger value="request">Request</Tabs.Trigger>
					<Tabs.Trigger value="response">Response</Tabs.Trigger>
					<Tabs.Trigger value="payload">Event payload</Tabs.Trigger>
				</Tabs.List>
				<Tabs.Content value="request" class="min-h-0 overflow-y-auto">
					{#if detail.request_url}
						<HttpMessage
							startLine={`${detail.request_method ?? ''} ${detail.request_url}`}
							headers={detail.request_headers}
							body={detail.request_body}
						/>
					{:else}
						<p class="py-4 text-center text-xs text-muted-foreground">Not sent.</p>
					{/if}
				</Tabs.Content>
				<Tabs.Content value="response" class="min-h-0 overflow-y-auto">
					{#if detail.response_status !== null}
						<HttpMessage
							startLine={`HTTP ${detail.response_status}`}
							headers={detail.response_headers}
							body={detail.response_body}
							emptyBody="Empty response body"
						/>
					{:else}
						<p class="py-4 text-center text-xs text-muted-foreground">No response received.</p>
					{/if}
				</Tabs.Content>
				<Tabs.Content value="payload" class="min-h-0 overflow-y-auto">
					<HttpMessage
						startLine={detail.event}
						body={detail.payload ? JSON.stringify(detail.payload) : null}
						emptyBody="No payload stored"
					/>
				</Tabs.Content>
			</Tabs.Root>
		{/if}

		<Dialog.Footer>
			<Button variant="outline" size="sm" class="h-7" onclick={() => (open = false)}>Close</Button>
			<Button
				size="sm"
				class="h-7"
				onclick={redeliver}
				disabled={!detail || !detail.payload || redelivering}
				title="Send the same payload again with the webhook's current settings"
			>
				<Redo2Icon size={12} class="mr-1" />
				{redelivering ? 'Queuing…' : 'Redeliver'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
