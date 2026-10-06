<!--
  Set the stage of one or many assets (possibly across several cases).
  Stages flagged `requires_reason` / `requires_decision` cannot be applied
  without a reason / a linked decision; the server enforces the same rule.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { Gavel, Loader2, Milestone } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import { toast } from '$lib/components/ui/toast';
	import AssetStageChip from '$lib/components/common/assets/AssetStageChip.svelte';
	import type { AssetStage } from '$lib/services/asset-stages.service';
	import {
		WarRoomScopeService,
		type ScopeAsset,
		type ScopeDecisionRef
	} from '$lib/services/war-room-scope.service';
	import ScopeOutcomes from './scope-outcomes.svelte';
	import { errorMessage, outcomesFailed, summariseOutcomes, type ScopeOutcome } from './helpers';

	type Props = {
		open: boolean;
		warRoomId: number;
		stages: AssetStage[];
		assets: ScopeAsset[];
		/** Pre-selected target stage (`null` = "No stage"); defaults to the single asset's stage. */
		initialStageId?: number | null;
		onDone?: () => void;
	};

	let { open = $bindable(), warRoomId, stages, assets, initialStageId, onDone }: Props = $props();

	const MAX_REASON = 4000;

	let stageId = $state<number | null>(null);
	let reason = $state('');
	let decisionId = $state<number | null>(null);
	let decisions = $state<ScopeDecisionRef[]>([]);
	let submitting = $state(false);
	let outcomes = $state<ScopeOutcome[] | null>(null);

	const loadDecisions = async () => {
		const res = await WarRoomScopeService.listDecisionRefs(warRoomId);
		decisions =
			res.ok && Array.isArray(res.data)
				? res.data.filter(
						(d) =>
							d.decision_id === decisionId || (d.status !== 'rejected' && d.status !== 'superseded')
					)
				: [];
	};

	$effect(() => {
		if (open) {
			untrack(() => {
				const single = assets.length === 1 ? assets[0] : null;
				stageId = initialStageId !== undefined ? initialStageId : (single?.stage_id ?? null);
				reason = single && stageId === single.stage_id ? (single.stage_reason ?? '') : '';
				decisionId = single && stageId === single.stage_id ? single.stage_decision_id : null;
				outcomes = null;
				submitting = false;
				void loadDecisions();
			});
		}
	});

	const stage = $derived(stages.find((s) => s.id === stageId) ?? null);
	const caseCount = $derived(new Set(assets.map((a) => a.case_id)).size);
	const reasonMissing = $derived(!!stage?.requires_reason && !reason.trim());
	const decisionMissing = $derived(!!stage?.requires_decision && decisionId == null);
	const canSubmit = $derived(
		assets.length > 0 && !reasonMissing && !decisionMissing && reason.length <= MAX_REASON
	);
	const caseNames = $derived(Object.fromEntries(assets.map((a) => [a.case_id, a.case_name])));

	const submit = async () => {
		if (!canSubmit || submitting) return;
		submitting = true;
		const trimmed = reason.trim();
		const res = await WarRoomScopeService.setStage(warRoomId, {
			asset_ids: assets.map((a) => a.asset_id),
			stage_id: stageId,
			reason: trimmed || undefined,
			decision_id: decisionId
		});
		submitting = false;

		if (!res.ok || !res.data || typeof res.data === 'string') {
			toast({
				title: 'Could not set the stage',
				description: errorMessage(res, 'The server refused the change.'),
				variant: 'destructive'
			});
			return;
		}

		const byId = new Map(assets.map((a) => [a.asset_id, a.asset_name]));
		const caseOf = new Map(assets.map((a) => [a.asset_id, a.case_id]));
		// The backend reports `case_id: null` for an asset it cannot find.
		const rows: ScopeOutcome[] = res.data.results.map((r) => ({
			case_id: r.case_id ?? caseOf.get(r.asset_id) ?? 0,
			status: r.status,
			label: byId.get(r.asset_id) ?? `Asset #${r.asset_id}`,
			message: r.message
		}));

		if (!outcomesFailed(rows)) {
			toast({
				title: `Stage set to ${stage?.name ?? 'No stage'}`,
				description: summariseOutcomes(rows),
				variant: 'success'
			});
			open = false;
			onDone?.();
			return;
		}
		outcomes = rows;
	};

	const close = () => {
		const hadResults = outcomes !== null;
		open = false;
		if (hadResults) onDone?.();
	};
</script>

<Dialog
	bind:open
	onOpenChange={(v) => {
		if (!v && outcomes !== null) onDone?.();
	}}
>
	<DialogContent class="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
		<DialogHeader class="border-b px-6 py-4">
			<DialogTitle class="flex items-center gap-2">
				<Milestone class="h-4 w-4 text-primary" aria-hidden="true" />
				Set stage
			</DialogTitle>
			<DialogDescription>
				{#if assets.length === 1}
					{assets[0].asset_name} in #{assets[0].case_id} {assets[0].case_name}
				{:else}
					{assets.length} assets across {caseCount}
					{caseCount === 1 ? 'case' : 'cases'}
				{/if}
			</DialogDescription>
		</DialogHeader>

		<div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
			{#if outcomes}
				<ScopeOutcomes rows={outcomes} {caseNames} />
			{:else}
				<fieldset>
					<legend class="text-xs font-medium text-muted-foreground">Stage</legend>
					<div class="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Stage">
						{#each [null, ...stages] as s (s?.id ?? 'none')}
							{@const active = (s?.id ?? null) === stageId}
							<button
								type="button"
								role="radio"
								aria-checked={active}
								class={[
									'inline-flex items-center gap-1 rounded-lg border p-1 transition-colors',
									active
										? 'border-primary bg-primary/10 ring-1 ring-primary/40'
										: 'border-transparent hover:bg-muted'
								]}
								onclick={() => (stageId = s?.id ?? null)}
							>
								<AssetStageChip stage={s} size="sm" />
								{#if s?.requires_decision}
									<Gavel class="h-3 w-3 text-muted-foreground" aria-label="Requires a decision" />
								{/if}
							</button>
						{/each}
					</div>
					{#if stage?.description}
						<p class="mt-1.5 text-2xs text-muted-foreground">{stage.description}</p>
					{/if}
				</fieldset>

				<div>
					<label class="text-xs font-medium text-muted-foreground" for="scope-stage-reason">
						Reason {stage?.requires_reason ? '(required)' : '(optional)'}
					</label>
					<Textarea
						id="scope-stage-reason"
						value={reason}
						oninput={(e) => (reason = (e.target as HTMLTextAreaElement).value)}
						rows={3}
						maxlength={MAX_REASON}
						placeholder={stage?.kind === 'exception'
							? 'Why is this asset an exception?'
							: 'Context for the change'}
						class="mt-1"
						aria-invalid={reasonMissing}
						aria-required={stage?.requires_reason ?? false}
					/>
					{#if reasonMissing}
						<p class="mt-1 text-2xs text-destructive">This stage requires a reason.</p>
					{/if}
				</div>

				<div>
					<label class="text-xs font-medium text-muted-foreground" for="scope-stage-decision">
						Decision {stage?.requires_decision ? '(required)' : '(optional)'}
					</label>
					<select
						id="scope-stage-decision"
						class="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
						value={decisionId == null ? '' : String(decisionId)}
						onchange={(e) => {
							const v = (e.target as HTMLSelectElement).value;
							decisionId = v ? Number(v) : null;
						}}
						aria-invalid={decisionMissing}
					>
						<option value="">No decision</option>
						{#each decisions as d (d.decision_id)}
							<option value={String(d.decision_id)}>{d.ref} · {d.title} ({d.status})</option>
						{/each}
					</select>
					{#if decisionMissing}
						<p class="mt-1 text-2xs text-destructive">
							This stage requires a decision from the register.
						</p>
					{/if}
				</div>
			{/if}
		</div>

		<DialogFooter class="border-t px-6 py-3">
			{#if outcomes}
				<Button onclick={close}>Done</Button>
			{:else}
				<Button variant="ghost" onclick={() => (open = false)} disabled={submitting}>Cancel</Button>
				<Button onclick={submit} disabled={!canSubmit || submitting} class="gap-1.5">
					{#if submitting}
						<Loader2 class="h-3.5 w-3.5 animate-spin" />
					{/if}
					Apply to {assets.length}
					{assets.length === 1 ? 'asset' : 'assets'}
				</Button>
			{/if}
		</DialogFooter>
	</DialogContent>
</Dialog>
