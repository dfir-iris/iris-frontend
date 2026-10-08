<!--
  Flag board: one column per flag (plus "No flag"), one card per asset
  carrying it. An asset with several flags shows in each of their
  columns. Dropping a card on a flag column sets that flag (the asset
  keeps its other flags); clicking a card opens the flag dialog on the
  column's flag (the keyboard path, also used to remove it). With a
  paginated list the column counts read "shown / total" from the
  server-side flag totals.
-->
<script lang="ts">
	import { Gavel, ShieldAlert } from 'lucide-svelte';
	import AssetFlagChip from '$lib/components/common/assets/AssetFlagChip.svelte';
	import type { AssetFlag } from '$lib/services/asset-flags.service';
	import type { ScopeAsset, ScopeAssetFlag } from '$lib/services/war-room-scope.service';

	type Props = {
		assets: ScopeAsset[];
		flags: AssetFlag[];
		canWrite: boolean;
		/** A card was dropped on a flag column the asset does not carry yet. */
		onSet: (asset: ScopeAsset, flag: AssetFlag) => void;
		/** A card was clicked; `flag` is null in the "No flag" column. */
		onOpen: (asset: ScopeAsset, flag: AssetFlag | null) => void;
		/** Assets per flag id (null = no flag) over every page, when paginated. */
		flagTotals?: Map<number | null, number>;
	};

	let { assets, flags, canWrite, onSet, onOpen, flagTotals }: Props = $props();

	type Card = { asset: ScopeAsset; entry: ScopeAssetFlag | null };
	type Column = { key: string; flag: AssetFlag | null; rows: Card[]; total: number };

	let dragId = $state<number | null>(null);
	let overKey = $state<string | null>(null);

	const columns = $derived.by(() => {
		const known = new Set(flags.map((f) => f.id));
		// One pass over the assets instead of one filter per flag.
		const buckets = new Map<number | null, Card[]>();
		const push = (key: number | null, card: Card) => {
			const list = buckets.get(key);
			if (list) list.push(card);
			else buckets.set(key, [card]);
		};
		for (const asset of assets) {
			const carried = (asset.flags ?? []).filter((f) => known.has(f.flag_id));
			if (carried.length === 0) push(null, { asset, entry: null });
			for (const entry of carried) push(entry.flag_id, { asset, entry });
		}
		const make = (flag: AssetFlag | null): Column => {
			const rows = buckets.get(flag?.id ?? null) ?? [];
			const total = flagTotals ? (flagTotals.get(flag?.id ?? null) ?? 0) : rows.length;
			return {
				key: flag ? String(flag.id) : 'none',
				flag,
				rows,
				total: Math.max(total, rows.length)
			};
		};
		const main: Column[] = [make(null), ...flags.filter((f) => f.kind !== 'exception').map(make)];
		const exceptions: Column[] = flags.filter((f) => f.kind === 'exception').map(make);
		return { main, exceptions };
	});

	const drop = (col: Column) => {
		const asset = assets.find((a) => a.asset_id === dragId);
		dragId = null;
		overKey = null;
		if (!asset || !col.flag) return;
		if ((asset.flags ?? []).some((f) => f.flag_id === col.flag?.id)) return;
		onSet(asset, col.flag);
	};
</script>

{#snippet column(col: Column)}
	<section
		class={[
			'flex w-64 shrink-0 flex-col rounded-lg border bg-card/40 transition-colors',
			overKey === col.key && 'border-primary bg-primary/5'
		]}
		aria-label={`Flag ${col.flag?.name ?? 'No flag'}`}
		data-testid="scope-flag-column"
		data-flag={col.flag?.name ?? 'No flag'}
		ondragover={(e) => {
			// The "No flag" column is not a drop target: removing a flag
			// goes through the dialog, which names the flag removed.
			if (!canWrite || dragId === null || !col.flag) return;
			e.preventDefault();
			overKey = col.key;
		}}
		ondragleave={() => {
			if (overKey === col.key) overKey = null;
		}}
		ondrop={(e) => {
			e.preventDefault();
			drop(col);
		}}
	>
		<header class="flex items-center gap-2 border-b px-3 py-2">
			{#if col.flag}
				<AssetFlagChip flag={col.flag} size="xs" />
			{:else}
				<span
					class="inline-flex h-5 items-center rounded-md border border-dashed px-1.5 text-[11px] font-medium text-muted-foreground"
				>
					No flag
				</span>
			{/if}
			<span
				class="text-2xs tabular-nums text-muted-foreground"
				title={col.total > col.rows.length
					? `${col.rows.length} on this page, ${col.total} in total`
					: undefined}
			>
				{col.total > col.rows.length ? `${col.rows.length} / ${col.total}` : col.rows.length}
			</span>
			{#if col.flag?.requires_decision}
				<Gavel class="ml-auto h-3.5 w-3.5 text-muted-foreground" aria-label="Requires a decision" />
			{/if}
		</header>
		{#if col.flag?.description}
			<p class="px-3 pt-2 text-2xs text-muted-foreground">{col.flag.description}</p>
		{/if}
		<ul class="flex min-h-[4rem] flex-col gap-1.5 overflow-y-auto p-2">
			{#each col.rows as { asset: a, entry } (a.asset_id)}
				<li>
					<button
						type="button"
						draggable={canWrite}
						ondragstart={(e) => {
							dragId = a.asset_id;
							e.dataTransfer?.setData('text/plain', String(a.asset_id));
						}}
						ondragend={() => {
							dragId = null;
							overKey = null;
						}}
						onclick={() => onOpen(a, col.flag)}
						disabled={!canWrite}
						class={[
							'flex w-full flex-col gap-1 rounded-md border bg-background px-2.5 py-2 text-left text-xs shadow-sm transition-colors',
							canWrite ? 'cursor-grab hover:bg-muted/50' : 'cursor-default',
							dragId === a.asset_id && 'opacity-50'
						]}
						aria-label={`${a.asset_name} in case #${a.case_id}${canWrite ? ', change flags' : ''}`}
					>
						<span class="flex items-center gap-1.5">
							{#if a.asset_compromise_status_id === 1}
								<ShieldAlert
									class="h-3.5 w-3.5 shrink-0 text-destructive"
									aria-label="Compromised"
								/>
							{/if}
							<span class="truncate font-medium">{a.asset_name}</span>
						</span>
						<span class="truncate text-2xs text-muted-foreground">
							<span class="font-mono">#{a.case_id}</span>
							{a.case_name}
						</span>
						{#if entry?.reason && col.flag?.kind === 'exception'}
							<span class="line-clamp-2 text-2xs italic text-muted-foreground">
								{entry.reason}
							</span>
						{/if}
					</button>
				</li>
			{:else}
				<li class="py-3 text-center text-2xs text-muted-foreground">Empty</li>
			{/each}
		</ul>
	</section>
{/snippet}

<div class="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2" data-testid="scope-flag-board">
	{#each columns.main as col (col.key)}
		{@render column(col)}
	{/each}
	{#if columns.exceptions.length}
		<div class="flex shrink-0 items-start pt-2">
			<span
				class="text-2xs font-semibold uppercase tracking-wider text-muted-foreground [writing-mode:vertical-rl]"
			>
				Exceptions
			</span>
		</div>
		{#each columns.exceptions as col (col.key)}
			{@render column(col)}
		{/each}
	{/if}
</div>
