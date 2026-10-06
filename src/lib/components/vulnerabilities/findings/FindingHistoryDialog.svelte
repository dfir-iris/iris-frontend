<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import type { RequestResponse } from '$lib/services/api.service';
	import type { FindingHistoryEntry } from '$lib/services/vulnerabilities.service';
	import { mediumDateTimeFormatter } from '$lib/utils/time-formatter';
	import { historyChangeRows } from './history-format';

	let {
		open = $bindable(false),
		title,
		load
	}: {
		open: boolean;
		title: string;
		load: () => Promise<RequestResponse<FindingHistoryEntry[]>>;
	} = $props();

	let entries = $state<FindingHistoryEntry[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);

	$effect(() => {
		if (!open) return;
		loading = true;
		error = null;
		entries = [];
		void load()
			.then((res) => {
				if (res.ok && Array.isArray(res.data)) entries = res.data;
				else error = res.error?.message ?? 'Failed to load the history';
			})
			.catch((e: unknown) => {
				error = e instanceof Error ? e.message : 'Failed to load the history';
			})
			.finally(() => {
				loading = false;
			});
	});

	const formatDate = (iso: string | null) => (iso ? mediumDateTimeFormatter(iso) || iso : '—');
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
		<Dialog.Header class="shrink-0 border-b px-6 py-4">
			<Dialog.Title class="text-base font-medium">History</Dialog.Title>
			<Dialog.Description class="text-xs">{title}</Dialog.Description>
		</Dialog.Header>

		<div class="min-h-0 flex-1 overflow-y-auto px-6 py-4">
			{#if loading}
				<div class="space-y-2">
					{#each [1, 2, 3] as n (n)}
						<Skeleton class="h-14 w-full" />
					{/each}
				</div>
			{:else if error}
				<p class="py-6 text-center text-xs text-destructive">{error}</p>
			{:else if entries.length === 0}
				<p class="py-6 text-center text-xs text-muted-foreground">No history recorded.</p>
			{:else}
				<ol class="flex flex-col gap-3">
					{#each entries as entry (entry.history_id)}
						{@const rows = historyChangeRows(entry.changes)}
						<li class="rounded-md border p-3 text-xs">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<span class="font-medium">
									{entry.action === 'create' ? 'Recorded' : 'Updated'}
									<span class="font-normal text-muted-foreground">
										by {entry.changed_by_name ?? 'unknown user'}
									</span>
								</span>
								<span class="tabular-nums text-muted-foreground">
									{formatDate(entry.changed_at)}
								</span>
							</div>
							{#if rows.length > 0}
								<dl class="mt-2 grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1">
									{#each rows as row (row.field)}
										<dt class="text-muted-foreground">{row.label}</dt>
										<dd class="break-words">
											{#if entry.action === 'update'}
												<span class="text-muted-foreground line-through">{row.from}</span>
												<span class="mx-1 text-muted-foreground">→</span>
											{/if}
											{row.to}
										</dd>
									{/each}
								</dl>
							{/if}
							{#if entry.reason}
								<p class="mt-2 whitespace-pre-wrap rounded bg-muted/40 p-2 text-2xs">
									{entry.reason}
								</p>
							{/if}
							{#if entry.decision_war_room_id !== null && entry.decision_number !== null}
								<a
									class="mt-2 inline-block text-2xs text-primary hover:underline"
									href={`/war-rooms/${entry.decision_war_room_id}/decisions`}
								>
									Decision #{entry.decision_number}
								</a>
							{/if}
						</li>
					{/each}
				</ol>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
