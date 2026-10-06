<!--
  Stage card on the asset Details tab: where the asset stands on the
  org-wide stage path, one-click moves along it, off-path exception
  stages, and the stage history. The same data drives the war-room
  Board, so a move here shows up there too.
-->
<script lang="ts">
	import { getContext } from 'svelte';
	import { page } from '$app/state';
	import { ChevronRightIcon, GavelIcon, HistoryIcon, XIcon } from 'lucide-svelte';
	import type { Asset } from '$lib/types/resources/asset';
	import {
		CASE_ASSETS_CTX,
		type CaseAssetsContext
	} from '$lib/contexts/case-assets.context.svelte';
	import {
		CASE_ACCESS_CTX,
		type CaseAccessContext
	} from '$lib/contexts/case-access.context.svelte';
	import {
		AssetStagesService,
		assetStageChipClass,
		assetStageDotClass,
		type AssetStage,
		type AssetStageHistoryEntry
	} from '$lib/services/asset-stages.service';
	import { assetStages, loadAssetStages } from '$lib/stores/asset-stages.store.svelte';
	import AssetStageChip from '$lib/components/common/assets/AssetStageChip.svelte';
	import { getAssetStageIcon } from '$lib/components/common/assets/asset-stage-icon';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toast } from '$lib/components/ui/toast';
	import { formatDateTime } from '$lib/utils/time-formatter';
	import {
		STAGE_REASON_MAX,
		applyAssetStage,
		buildStageUpdate,
		stageNeedsInput,
		stagePathStates,
		validateStageInput
	} from '../stage-helpers';

	let { asset }: { asset: Asset } = $props();

	const caseAssets = getContext<CaseAssetsContext>(CASE_ASSETS_CTX);
	const caseAccess = getContext<CaseAccessContext>(CASE_ACCESS_CTX);
	const canEdit = $derived(caseAccess?.canEdit() ?? false);
	const caseId = $derived(Number(page.params.case_id));

	const stages = $derived(assetStages.items);
	const pathStages = $derived(stages.filter((s) => s.kind !== 'exception'));
	const exceptionStages = $derived(stages.filter((s) => s.kind === 'exception'));
	// Prefer the taxonomy entry (fresh colour/icon) over the nested dump.
	const current = $derived<AssetStage | null>(
		asset.stage_id !== null && asset.stage_id !== undefined
			? (stages.find((s) => s.id === asset.stage_id) ?? asset.stage ?? null)
			: null
	);
	const currentIndex = $derived(
		current && current.kind !== 'exception' ? pathStages.findIndex((s) => s.id === current.id) : -1
	);

	let busy = $state(false);
	let pending = $state<AssetStage | null>(null);
	let reason = $state('');
	let decisionId = $state('');
	let formError = $state<string | null>(null);

	let history = $state<AssetStageHistoryEntry[]>([]);
	let historyLoading = $state(false);
	// Folded by default: the stepper already shows where the asset stands.
	let historyOpen = $state(false);

	const stepStates = $derived(
		stagePathStates(
			pathStages,
			current && current.kind !== 'exception' ? current.id : null,
			history.map((h) => h.to_stage_id)
		)
	);

	$effect(() => {
		void loadAssetStages();
	});

	const loadHistory = async (assetId: number) => {
		if (!Number.isFinite(caseId)) return;
		historyLoading = true;
		try {
			const res = await AssetStagesService.history(caseId, assetId);
			if (asset.asset_id !== assetId) return;
			history = res.ok && Array.isArray(res.data) ? res.data : [];
		} finally {
			historyLoading = false;
		}
	};

	// Reload when the asset changes or its stage moves (here, from the
	// bulk bar, or after a list refresh).
	$effect(() => {
		const id = asset.asset_id;
		void asset.stage_updated_at;
		void loadHistory(id);
	});

	// Drop a half-filled form when switching asset.
	$effect(() => {
		void asset.asset_id;
		pending = null;
		formError = null;
	});

	const apply = async (stage: AssetStage | null, withReason = '', withDecision = '') => {
		busy = true;
		try {
			const result = await applyAssetStage(
				caseAssets,
				caseId,
				[asset.asset_id],
				buildStageUpdate(stage, withReason, withDecision)
			);
			if (result.failed.length) {
				const message = result.failed[0]?.message ?? 'Unable to set stage';
				if (pending) {
					formError = message;
				} else {
					toast({ title: 'Stage not changed', description: message, variant: 'destructive' });
				}
				return;
			}
			pending = null;
			toast({
				title: stage ? `Stage set to ${stage.name}` : 'Stage cleared',
				variant: 'success'
			});
		} finally {
			busy = false;
		}
	};

	const pick = (stage: AssetStage) => {
		if (!canEdit || busy) return;
		if (stageNeedsInput(stage)) {
			pending = stage;
			reason = stage.id === asset.stage_id ? (asset.stage_reason ?? '') : '';
			decisionId =
				stage.id === asset.stage_id &&
				asset.stage_decision_id !== null &&
				asset.stage_decision_id !== undefined
					? String(asset.stage_decision_id)
					: '';
			formError = null;
			return;
		}
		if (stage.id === asset.stage_id) return;
		pending = null;
		void apply(stage);
	};

	const submitPending = () => {
		if (!pending) return;
		formError = validateStageInput(pending, reason, decisionId);
		if (formError) return;
		void apply(pending, reason, decisionId);
	};

	const stageOf = (id: number | null, name: string | null) =>
		id !== null
			? (stages.find((s) => s.id === id) ?? { name: name ?? `#${id}`, color: 'slate', icon: null })
			: name
				? { name, color: 'slate', icon: null }
				: null;

	const formatWhen = (value: string | null | undefined) => (value ? formatDateTime(value) : '');
</script>

<section
	class="mx-4 mt-3 rounded-lg border p-4"
	aria-labelledby="asset-stage-heading"
	data-testid="asset-stage-card"
>
	<div class="mb-4 flex items-center gap-2">
		<p
			id="asset-stage-heading"
			class="text-2xs font-semibold uppercase tracking-wider text-muted-foreground"
		>
			Stage
		</p>
		{#if asset.stage_updated_at}
			<span class="text-2xs text-muted-foreground">
				updated {formatWhen(asset.stage_updated_at)}
			</span>
		{/if}
		<div class="ml-auto flex items-center gap-1.5">
			<AssetStageChip stage={current} size="sm" />
			{#if canEdit && current}
				<Button
					variant="ghost"
					size="xs"
					class="h-6 px-1.5 text-2xs text-muted-foreground"
					disabled={busy}
					onclick={() => {
						pending = null;
						void apply(null);
					}}
				>
					<XIcon size={11} class="mr-0.5" />
					Clear
				</Button>
			{/if}
		</div>
	</div>

	{#if !assetStages.loaded}
		<Skeleton class="h-14 w-full" />
	{:else if stages.length === 0}
		<p class="text-xs text-muted-foreground">
			No asset stages are configured. An administrator can add them in Settings › Asset stages.
		</p>
	{:else}
		{#if pathStages.length}
			<ol
				class="grid"
				style:grid-template-columns={`repeat(${pathStages.length}, minmax(0, 1fr))`}
				aria-label="Stage path"
			>
				{#each pathStages as stage, i (stage.id)}
					{@const Icon = getAssetStageIcon(stage.icon)}
					{@const state = stepStates[i]}
					{@const reached = state === 'reached'}
					{@const isCurrent = stage.id === current?.id}
					<li class="relative flex flex-col items-center text-center">
						{#if i > 0}
							<span
								class="absolute right-1/2 top-3.5 h-0.5 w-full {currentIndex >= 0 &&
								i <= currentIndex
									? assetStageDotClass(stage.color)
									: 'bg-border'}"
							></span>
						{/if}
						<button
							type="button"
							class="relative z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors disabled:cursor-default
								{reached
								? `${assetStageDotClass(stage.color)} border-transparent text-white`
								: stage.is_optional
									? 'border-dashed border-muted-foreground/40 bg-card text-muted-foreground/70 enabled:hover:border-ring/40'
									: 'border-border bg-card text-muted-foreground enabled:hover:border-ring/40'}
								{isCurrent ? 'ring-4 ring-ring/20' : ''}"
							disabled={!canEdit || busy}
							aria-label={`Set stage to ${stage.name}${stage.is_optional ? ' (optional)' : ''}`}
							aria-current={isCurrent ? 'step' : undefined}
							title={stage.description || stage.name}
							onclick={() => pick(stage)}
						>
							<Icon class="h-3.5 w-3.5" aria-hidden="true" />
						</button>
						<span class="mt-1.5 text-xs {isCurrent ? 'font-semibold' : 'text-muted-foreground'}">
							{stage.name}
						</span>
						{#if state === 'skipped'}
							<span class="text-2xs italic text-muted-foreground" data-testid="asset-stage-skipped">
								skipped
							</span>
						{:else if stage.is_optional && state === 'todo'}
							<span class="text-2xs italic text-muted-foreground">optional</span>
						{/if}
					</li>
				{/each}
			</ol>
		{/if}

		{#if exceptionStages.length}
			<div class="mt-4 flex flex-wrap items-center gap-1.5">
				<span class="text-2xs uppercase tracking-wide text-muted-foreground">Exceptions</span>
				{#each exceptionStages as stage (stage.id)}
					{@const Icon = getAssetStageIcon(stage.icon)}
					{@const isCurrent = stage.id === current?.id}
					<button
						type="button"
						class="inline-flex h-6 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors disabled:cursor-default
							{isCurrent
							? assetStageChipClass(stage.color)
							: 'border-dashed text-muted-foreground enabled:hover:bg-muted/50'}"
						disabled={!canEdit || busy}
						aria-pressed={isCurrent}
						title={stage.description || stage.name}
						onclick={() => pick(stage)}
					>
						<Icon class="h-3 w-3" aria-hidden="true" />
						{stage.name}
					</button>
				{/each}
			</div>
		{/if}

		{#if pending}
			<form
				class="mt-4 flex flex-col gap-2 rounded-md border bg-muted/20 p-3"
				onsubmit={(e) => {
					e.preventDefault();
					submitPending();
				}}
				aria-label={`Move to ${pending.name}`}
			>
				<div class="flex items-center gap-2 text-xs">
					Move to <AssetStageChip stage={pending} />
				</div>
				<div class="flex flex-col gap-1">
					<label
						for="asset-stage-reason"
						class="text-2xs uppercase tracking-wide text-muted-foreground"
					>
						Reason{pending.requires_reason ? ' *' : ''}
					</label>
					<Textarea
						id="asset-stage-reason"
						rows={2}
						maxlength={STAGE_REASON_MAX}
						bind:value={reason}
						placeholder="Why is this asset moving to this stage?"
						disabled={busy}
					/>
				</div>
				<div class="flex flex-col gap-1">
					<label
						for="asset-stage-decision"
						class="text-2xs uppercase tracking-wide text-muted-foreground"
					>
						Decision ID{pending.requires_decision ? ' *' : ' (optional)'}
					</label>
					<Input
						id="asset-stage-decision"
						inputmode="numeric"
						class="h-8 max-w-48 text-xs"
						bind:value={decisionId}
						placeholder="e.g. 12"
						disabled={busy}
					/>
				</div>
				{#if formError}
					<p class="text-2xs text-destructive" role="alert">{formError}</p>
				{/if}
				<div class="flex justify-end gap-1.5">
					<Button
						type="button"
						variant="outline"
						size="xs"
						disabled={busy}
						onclick={() => {
							pending = null;
							formError = null;
						}}
					>
						Cancel
					</Button>
					<Button type="submit" size="xs" disabled={busy}>
						{busy ? 'Saving…' : 'Set stage'}
					</Button>
				</div>
			</form>
		{/if}

		{#if current && (asset.stage_reason || asset.stage_decision_id)}
			{@const Icon = getAssetStageIcon(current.icon)}
			<div
				class="mt-4 flex items-start gap-2 rounded-md border px-3 py-2 text-xs {current.kind ===
				'exception'
					? assetStageChipClass(current.color)
					: 'bg-muted/20'}"
			>
				<Icon class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
				<span class="min-w-0 whitespace-pre-wrap break-words">
					<b>{current.name}</b>{#if asset.stage_reason}
						— {asset.stage_reason}{/if}
					{#if asset.stage_decision_id}
						<span class="inline-flex items-center gap-1 whitespace-nowrap">
							· <GavelIcon class="h-3 w-3" aria-hidden="true" /> decision #{asset.stage_decision_id}
						</span>
					{/if}
				</span>
			</div>
		{/if}
	{/if}

	<div class="mt-4 border-t pt-3">
		{#if historyLoading && history.length === 0}
			<Skeleton class="h-6 w-full" />
		{:else if history.length === 0}
			<p class="text-xs text-muted-foreground">No stage changes yet.</p>
		{:else}
			<button
				type="button"
				class="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
				aria-expanded={historyOpen}
				aria-controls="asset-stage-history"
				data-testid="asset-stage-history-toggle"
				onclick={() => (historyOpen = !historyOpen)}
			>
				<ChevronRightIcon
					class="h-3 w-3 transition-transform {historyOpen ? 'rotate-90' : ''}"
					aria-hidden="true"
				/>
				<HistoryIcon class="h-3 w-3" aria-hidden="true" />
				Stage history
				<span class="rounded-full bg-muted px-1.5 font-medium normal-case tracking-normal">
					{history.length}
				</span>
			</button>
		{/if}
		{#if historyOpen && history.length > 0}
			<ol
				id="asset-stage-history"
				class="relative ml-1 mt-2 border-l border-border/60 pl-4"
				data-testid="asset-stage-history"
			>
				{#each history as entry (entry.id)}
					{@const to = stageOf(entry.to_stage_id, entry.to_stage_name)}
					<li class="relative pb-3 last:pb-0">
						<span
							class="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-card {to
								? assetStageDotClass(to.color)
								: 'bg-muted-foreground/40'}"
						></span>
						<div class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
							{#if to}
								<span>Stage set to</span>
								<AssetStageChip stage={to} />
							{:else}
								<span>Stage cleared</span>
							{/if}
							{#if entry.from_stage_name}
								<span class="text-muted-foreground">from {entry.from_stage_name}</span>
							{/if}
							{#if entry.changed_by_name}
								<span class="text-muted-foreground">by {entry.changed_by_name}</span>
							{/if}
							{#if entry.war_room_id && entry.war_room_name}
								<a
									href={`/war-rooms/${entry.war_room_id}`}
									class="text-muted-foreground underline-offset-2 hover:underline"
								>
									via {entry.war_room_name}
								</a>
							{/if}
							{#if entry.decision_number}
								<span class="inline-flex items-center gap-0.5 text-muted-foreground">
									<GavelIcon class="h-3 w-3" aria-hidden="true" />D-{entry.decision_number}
								</span>
							{/if}
							<span class="ml-auto text-2xs text-muted-foreground">
								{formatWhen(entry.changed_at)}
							</span>
						</div>
						{#if entry.reason}
							<p class="mt-0.5 whitespace-pre-wrap break-words text-xs text-muted-foreground">
								{entry.reason}
							</p>
						{/if}
					</li>
				{/each}
			</ol>
		{/if}
	</div>
</section>
