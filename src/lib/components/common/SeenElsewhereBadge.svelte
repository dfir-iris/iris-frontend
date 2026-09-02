<!--
  "Seen elsewhere" badge.

  Surfaces the v2.4.x analyst affordance: when an IOC or asset has been
  observed in a previous case the user can read, light a small chip that
  expands into a popover listing the other cases. Empty result → nothing
  rendered, so the badge only appears when it's actionable.

  Generic over the two object types: the parent picks the loader fn
  (`load`) that returns `{ case_id, case_name, … }` rows and the label
  copy ("IOC" / "Asset"). We do the fetch on mount so the data is ready
  by the time the user hovers; subsequent re-mounts (different ids) re-
  fetch automatically via `$effect`.
-->
<script lang="ts">
	import { HistoryIcon, ExternalLinkIcon } from 'lucide-svelte';
	import * as Popover from '$lib/components/ui/popover';

	type Row = {
		case_id: number;
		case_name: string;
		// Optional metadata that distinguishes IOC links (client_name)
		// from asset links (case_open_date / asset_description). The
		// component renders whichever is present.
		client_name?: string;
		case_open_date?: string | null;
		asset_description?: string | null;
	};

	type Variant = 'inline' | 'popover';

	type Props = {
		/** Loader fired on mount; returns the rows or `null` on error. */
		load: () => Promise<Row[] | null>;
		/** Word used in the badge label, e.g. "IOC" or "asset". */
		objectLabel: string;
		/** Stable id that, when changed, retriggers the loader. Lets the
		 *  parent reuse a single badge instance across rows without
		 *  carrying stale results from the previous selection. */
		objectId?: number | string | null;
		/** `popover` (default) renders an interactive trigger that opens
		 *  a list of the linked cases — used in detail views where the
		 *  parent isn't itself a button. `inline` renders a plain visual
		 *  badge with no popover and no nested button — used inside list
		 *  rows that are themselves `<button>` elements (nested buttons
		 *  are invalid HTML and the click would bubble to the row). */
		variant?: Variant;
	};

	const { load, objectLabel, objectId = null, variant = 'popover' }: Props = $props();

	let rows = $state<Row[] | null>(null);
	let loading = $state(false);

	$effect(() => {
		// Re-fetch whenever the id flips. Capture id into a local so
		// the cleanup branch doesn't race with a newer fetch.
		void objectId;
		let cancelled = false;
		loading = true;
		rows = null;
		void (async () => {
			const result = await load();
			if (cancelled) return;
			rows = result ?? [];
			loading = false;
		})();
		return () => {
			cancelled = true;
		};
	});

	const count = $derived(rows?.length ?? 0);
</script>

{#if count > 0}
	{#if variant === 'inline'}
		<!--
		  Inline (list-row) presentation — kept deliberately tiny so it
		  doesn't dominate a dense card row. Icon-only with a count badge;
		  the tooltip carries the full label. Non-interactive `<span>` so
		  it can sit inside a parent `<button>` row without nested-button
		  HTML.
		-->
		<span
			class="inline-flex items-center gap-0.5 rounded border border-amber-500/40 bg-amber-500/10 px-1 py-px text-2xs font-medium text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-400"
			title={`Seen in ${count} other case${count === 1 ? '' : 's'}`}
		>
			<HistoryIcon size={10} />
			<span class="tabular-nums">{count}</span>
		</span>
	{:else}
		<Popover.Root>
			<Popover.Trigger
				class="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-500/20 hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-400 dark:hover:bg-amber-400/20"
				aria-label={`Seen in ${count} other case${count === 1 ? '' : 's'}`}
			>
				<HistoryIcon size={12} />
				<span class="tabular-nums">{count}</span>
			</Popover.Trigger>
			<Popover.Content align="start" class="w-80 p-0">
				<div class="border-b px-3 py-2 text-xs font-semibold">
					This {objectLabel} was seen in {count} other case{count === 1 ? '' : 's'}
				</div>
				<ul class="max-h-72 overflow-y-auto py-1">
					{#each rows ?? [] as row (row.case_id)}
						<li>
							<a
								href={`/case/${row.case_id}`}
								class="flex items-start gap-2 px-3 py-2 text-xs transition-colors hover:bg-muted/60"
							>
								<span class="mt-0.5 shrink-0 font-mono text-2xs text-muted-foreground">
									#{row.case_id}
								</span>
								<span class="min-w-0 flex-1">
									<span class="block truncate font-medium" title={row.case_name}>
										{row.case_name}
									</span>
									{#if row.client_name}
										<span class="block truncate text-2xs text-muted-foreground">
											{row.client_name}
										</span>
									{:else if row.asset_description}
										<span class="block truncate text-2xs text-muted-foreground">
											{row.asset_description}
										</span>
									{:else if row.case_open_date}
										<span class="block truncate text-2xs text-muted-foreground">
											Opened {row.case_open_date}
										</span>
									{/if}
								</span>
								<ExternalLinkIcon size={11} class="mt-0.5 shrink-0 text-muted-foreground" />
							</a>
						</li>
					{/each}
				</ul>
			</Popover.Content>
		</Popover.Root>
	{/if}
{:else if loading}
	<!--
	  Hold a zero-impact placeholder while loading so the badge can
	  "appear" without shifting layout. We deliberately do NOT show a
	  spinner — the analyst doesn't need to wait, and a flicker would
	  be more annoying than the absence of the badge for ~100ms.
	-->
	<span aria-hidden="true"></span>
{/if}
