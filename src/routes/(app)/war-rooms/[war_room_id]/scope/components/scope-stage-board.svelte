<!--
  Stage board: one column per stage (plus "No stage"), one card per asset.
  Dropping a card on a column changes the asset's stage; clicking a card
  opens the stage dialog (the keyboard path). With a paginated list the
  column counts read "shown / total" from the server-side stage totals.
-->
<script lang="ts">
	import { Gavel, ShieldAlert } from 'lucide-svelte';
	import AssetStageChip from '$lib/components/common/assets/AssetStageChip.svelte';
	import type { AssetStage } from '$lib/services/asset-stages.service';
	import type { ScopeAsset } from '$lib/services/war-room-scope.service';

	type Props = {
		assets: ScopeAsset[];
		stages: AssetStage[];
		canWrite: boolean;
		onMove: (asset: ScopeAsset, stageId: number | null) => void;
		onOpen: (asset: ScopeAsset) => void;
		/** Assets per stage id (null = no stage) over every page, when paginated. */
		stageTotals?: Map<number | null, number>;
	};

	let { assets, stages, canWrite, onMove, onOpen, stageTotals }: Props = $props();

	type Column = { key: string; stage: AssetStage | null; rows: ScopeAsset[]; total: number };

	let dragId = $state<number | null>(null);
	let overKey = $state<string | null>(null);

	const columns = $derived.by(() => {
		const known = new Set(stages.map((s) => s.id));
		// One pass over the assets instead of one filter per stage.
		const buckets = new Map<number | null, ScopeAsset[]>();
		for (const a of assets) {
			const key = a.stage_id != null && known.has(a.stage_id) ? a.stage_id : null;
			const list = buckets.get(key);
			if (list) list.push(a);
			else buckets.set(key, [a]);
		}
		let noneTotal = 0;
		if (stageTotals) {
			for (const [id, n] of stageTotals) if (id === null || !known.has(id)) noneTotal += n;
		}
		const make = (stage: AssetStage | null): Column => {
			const rows = buckets.get(stage?.id ?? null) ?? [];
			const total = stageTotals
				? stage
					? (stageTotals.get(stage.id) ?? 0)
					: noneTotal
				: rows.length;
			return {
				key: stage ? String(stage.id) : 'none',
				stage,
				rows,
				total: Math.max(total, rows.length)
			};
		};
		const main: Column[] = [make(null), ...stages.filter((s) => s.kind !== 'exception').map(make)];
		const exceptions: Column[] = stages.filter((s) => s.kind === 'exception').map(make);
		return { main, exceptions };
	});

	const drop = (col: Column) => {
		const asset = assets.find((a) => a.asset_id === dragId);
		dragId = null;
		overKey = null;
		if (!asset) return;
		const target = col.stage?.id ?? null;
		if ((asset.stage_id ?? null) === target) return;
		onMove(asset, target);
	};
</script>

{#snippet column(col: Column)}
	<section
		class={[
			'flex w-64 shrink-0 flex-col rounded-lg border bg-card/40 transition-colors',
			overKey === col.key && 'border-primary bg-primary/5'
		]}
		aria-label={`Stage ${col.stage?.name ?? 'No stage'}`}
		data-testid="scope-stage-column"
		data-stage={col.stage?.name ?? 'No stage'}
		ondragover={(e) => {
			if (!canWrite || dragId === null) return;
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
			<AssetStageChip stage={col.stage} size="xs" />
			<span
				class="text-2xs tabular-nums text-muted-foreground"
				title={col.total > col.rows.length
					? `${col.rows.length} on this page, ${col.total} in total`
					: undefined}
			>
				{col.total > col.rows.length ? `${col.rows.length} / ${col.total}` : col.rows.length}
			</span>
			{#if col.stage?.requires_decision}
				<Gavel class="ml-auto h-3.5 w-3.5 text-muted-foreground" aria-label="Requires a decision" />
			{/if}
		</header>
		{#if col.stage?.description}
			<p class="px-3 pt-2 text-2xs text-muted-foreground">{col.stage.description}</p>
		{/if}
		<ul class="flex min-h-[4rem] flex-col gap-1.5 overflow-y-auto p-2">
			{#each col.rows as a (a.asset_id)}
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
						onclick={() => onOpen(a)}
						disabled={!canWrite}
						class={[
							'flex w-full flex-col gap-1 rounded-md border bg-background px-2.5 py-2 text-left text-xs shadow-sm transition-colors',
							canWrite ? 'cursor-grab hover:bg-muted/50' : 'cursor-default',
							dragId === a.asset_id && 'opacity-50'
						]}
						aria-label={`${a.asset_name} in case #${a.case_id}${canWrite ? ', change stage' : ''}`}
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
						{#if a.stage_reason && col.stage?.kind === 'exception'}
							<span class="line-clamp-2 text-2xs italic text-muted-foreground">
								{a.stage_reason}
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

<div class="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2" data-testid="scope-stage-board">
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
