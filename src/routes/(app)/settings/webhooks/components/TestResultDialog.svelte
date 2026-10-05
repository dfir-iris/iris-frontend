<!-- Outcome of "Send test": the request as sent and the receiver's answer. -->
<script lang="ts">
	import { CircleCheckIcon, CircleXIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Tabs from '$lib/components/ui/tabs';
	import type { WebhookTestResult } from '$lib/services/webhooks.service';
	import HttpMessage from './HttpMessage.svelte';

	type Props = {
		open: boolean;
		result: WebhookTestResult | null;
		eventLabel?: string;
	};

	let { open = $bindable(), result, eventLabel = '' }: Props = $props();

	let tab = $state('response');

	$effect(() => {
		if (open) tab = 'response';
	});
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="flex max-h-[90vh] flex-col sm:max-w-[820px]">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2 text-sm">
				{#if result?.response.success}
					<CircleCheckIcon size={16} class="text-emerald-600" /> Test delivered
				{:else}
					<CircleXIcon size={16} class="text-destructive" /> Test failed
				{/if}
			</Dialog.Title>
			<Dialog.Description class="text-xs">
				{eventLabel || result?.event}
				{#if result}
					· {result.sample_source === 'last_delivery' ? 'last real event' : 'synthetic sample'}
					{#if result.response.status_code !== null}· HTTP {result.response.status_code}{/if}
					{#if result.response.duration_ms !== null}· {result.response.duration_ms} ms{/if}
					{#if result.delivery_id}· logged as delivery #{result.delivery_id}{/if}
				{/if}
			</Dialog.Description>
		</Dialog.Header>

		{#if result}
			{#if result.response.error}
				<p
					class="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive"
				>
					{result.response.error}
				</p>
			{/if}
			{#each result.request.errors as error (`${error.field}:${error.message}`)}
				<p
					class="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive"
				>
					<span class="font-mono">{error.field}</span> — {error.message}
				</p>
			{/each}

			<Tabs.Root bind:value={tab} class="flex min-h-0 flex-1 flex-col">
				<Tabs.List class="w-fit">
					<Tabs.Trigger value="response">Response</Tabs.Trigger>
					<Tabs.Trigger value="request">Request</Tabs.Trigger>
				</Tabs.List>
				<Tabs.Content value="response" class="min-h-0 overflow-y-auto">
					{#if result.response.status_code !== null}
						<HttpMessage
							startLine={`HTTP ${result.response.status_code}`}
							headers={result.response.headers}
							body={result.response.body}
							emptyBody="Empty response body"
						/>
					{:else}
						<p class="py-4 text-center text-xs text-muted-foreground">No response received.</p>
					{/if}
				</Tabs.Content>
				<Tabs.Content value="request" class="min-h-0 overflow-y-auto">
					<HttpMessage
						startLine={`${result.request.method} ${result.request.url}`}
						headers={result.request.headers}
						body={result.request.body}
					/>
				</Tabs.Content>
			</Tabs.Root>
		{/if}

		<Dialog.Footer>
			<Button size="sm" class="h-7" onclick={() => (open = false)}>Close</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
