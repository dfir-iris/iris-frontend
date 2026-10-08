<!--
  "Add asset" / "Add IOC" — create one object in several attached cases at
  once (each case is written through the regular case create path, so
  hooks and history fire), or park it in the war-room staging inbox.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { Bug, Inbox, Loader2, Plus, Server } from 'lucide-svelte';
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
	import AssetFlagChip from '$lib/components/common/assets/AssetFlagChip.svelte';
	import type { AssetFlag } from '$lib/services/asset-flags.service';
	import type { AssetType } from '$lib/services/asset-types.service';
	import type { AnalysisStatusItem } from '$lib/services/analysis-status.service';
	import type { IocType } from '$lib/services/ioc-types.service';
	import type { TlpItem } from '$lib/services/tlp.service';
	import { WarRoomScopeService, type ScopeCase } from '$lib/services/war-room-scope.service';
	import { SCOPE_MAX_TARGET_CASES } from '$lib/services/war-room-scope-batches';
	import ScopeAssetFields from './scope-asset-fields.svelte';
	import ScopeIocFields from './scope-ioc-fields.svelte';
	import ScopeCasePicker from './scope-case-picker.svelte';
	import ScopeCustomerWarning from './scope-customer-warning.svelte';
	import ScopeOutcomes from './scope-outcomes.svelte';
	import {
		assetFormToInput,
		assetFormValid,
		distinctCustomers,
		emptyAssetForm,
		emptyIocForm,
		errorMessage,
		iocFormToInput,
		iocFormValid,
		outcomesFailed,
		summariseOutcomes,
		type AssetForm,
		type IocForm,
		type ScopeOutcome
	} from './helpers';

	type Props = {
		open: boolean;
		kind: 'asset' | 'ioc';
		warRoomId: number;
		cases: ScopeCase[];
		flags: AssetFlag[];
		assetTypes: AssetType[];
		analysisStatuses: AnalysisStatusItem[];
		iocTypes: IocType[];
		tlps: TlpItem[];
		onDone?: () => void;
		onStaged?: () => void;
	};

	let {
		open = $bindable(),
		kind,
		warRoomId,
		cases,
		flags,
		assetTypes,
		analysisStatuses,
		iocTypes,
		tlps,
		onDone,
		onStaged
	}: Props = $props();

	const MAX_REASON = 4000;

	let assetForm = $state<AssetForm>(emptyAssetForm());
	let iocForm = $state<IocForm>(emptyIocForm());
	let selected = $state<number[]>([]);
	let flagIds = $state<number[]>([]);
	let flagReason = $state('');
	let submitting = $state(false);
	let outcomes = $state<ScopeOutcome[] | null>(null);

	$effect(() => {
		if (open) {
			untrack(() => {
				assetForm = emptyAssetForm();
				iocForm = emptyIocForm();
				selected = cases.length === 1 ? [cases[0].case_id] : [];
				flagIds = [];
				flagReason = '';
				outcomes = null;
				submitting = false;
			});
		}
	});

	const isAsset = $derived(kind === 'asset');
	const pickedFlags = $derived(flags.filter((f) => flagIds.includes(f.id)));
	const reasonRequired = $derived(pickedFlags.some((f) => f.requires_reason));
	const formValid = $derived(isAsset ? assetFormValid(assetForm) : iocFormValid(iocForm));
	const reasonMissing = $derived(isAsset && reasonRequired && !flagReason.trim());
	// A flag that needs a decision cannot be picked at creation time:
	// set it afterwards from the table, where a decision can be linked.
	const pickableFlags = $derived(flags.filter((f) => !f.requires_decision));

	const toggleFlag = (id: number) => {
		flagIds = flagIds.includes(id) ? flagIds.filter((x) => x !== id) : [...flagIds, id];
	};
	const customers = $derived.by(() => {
		const picked = new Set(selected);
		return distinctCustomers(cases.filter((c) => picked.has(c.case_id)));
	});
	// Creating fans out in batches; a staged object keeps its proposed
	// targets in one row, capped by the server.
	const tooManyToStage = $derived(selected.length > SCOPE_MAX_TARGET_CASES);
	const caseNames = $derived(Object.fromEntries(cases.map((c) => [c.case_id, c.case_name])));
	const canSubmit = $derived(formValid && selected.length > 0 && !reasonMissing);
	const label = $derived(
		isAsset ? assetForm.asset_name.trim() || 'Asset' : iocForm.ioc_value.trim() || 'IOC'
	);

	const submit = async () => {
		if (!canSubmit || submitting) return;
		submitting = true;
		const reason = flagReason.trim();
		const res = isAsset
			? await WarRoomScopeService.createAsset(warRoomId, {
					asset: assetFormToInput(assetForm),
					case_ids: [...selected],
					...(flagIds.length ? { flag_ids: [...flagIds] } : {}),
					...(flagIds.length && reason ? { flag_reason: reason } : {})
				})
			: await WarRoomScopeService.createIoc(warRoomId, {
					ioc: iocFormToInput(iocForm),
					case_ids: [...selected]
				});
		submitting = false;

		if (!res.ok || !res.data || typeof res.data === 'string') {
			toast({
				title: isAsset ? 'Could not add the asset' : 'Could not add the IOC',
				description: errorMessage(res, 'The server refused the request.'),
				variant: 'destructive'
			});
			return;
		}

		const rows: ScopeOutcome[] = res.data.results.map((r) => ({
			case_id: r.case_id,
			status: r.status,
			label,
			message: r.message
		}));

		if (!outcomesFailed(rows)) {
			toast({
				title: isAsset ? 'Asset added' : 'IOC added',
				description: summariseOutcomes(rows),
				variant: 'success'
			});
			open = false;
			onDone?.();
			return;
		}
		outcomes = rows;
	};

	// Park the object in the war-room inbox; the selected cases become the
	// proposed targets for a later push.
	const stageForLater = async () => {
		if (!formValid || submitting) return;
		submitting = true;
		const res = await WarRoomScopeService.createStaged(warRoomId, {
			object_type: kind,
			payload: isAsset ? assetFormToInput(assetForm) : iocFormToInput(iocForm),
			proposed_case_ids: [...selected]
		});
		submitting = false;
		if (!res.ok || !res.data || typeof res.data === 'string') {
			toast({
				title: 'Could not stage the object',
				description: errorMessage(res, 'The server refused the request.'),
				variant: 'destructive'
			});
			return;
		}
		toast({ title: 'Added to staging', description: label, variant: 'success' });
		open = false;
		onStaged?.();
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
	<DialogContent class="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
		<DialogHeader class="border-b px-6 py-4">
			<DialogTitle class="flex items-center gap-2">
				{#if isAsset}
					<Server class="h-4 w-4 text-primary" aria-hidden="true" />
					Add asset
				{:else}
					<Bug class="h-4 w-4 text-primary" aria-hidden="true" />
					Add IOC
				{/if}
			</DialogTitle>
			<DialogDescription>
				Created in every selected case. Cases that already hold it are skipped.
			</DialogDescription>
		</DialogHeader>

		<div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
			{#if outcomes}
				<ScopeOutcomes rows={outcomes} {caseNames} />
			{:else}
				{#if isAsset}
					<ScopeAssetFields bind:form={assetForm} {assetTypes} {analysisStatuses} />

					{#if pickableFlags.length}
						<fieldset>
							<legend class="text-xs font-medium text-muted-foreground">
								Initial flags (optional)
							</legend>
							<div class="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Initial flags">
								{#each pickableFlags as f (f.id)}
									{@const active = flagIds.includes(f.id)}
									<button
										type="button"
										aria-pressed={active}
										class={[
											'inline-flex items-center rounded-lg border p-1 transition-colors',
											active
												? 'border-primary bg-primary/10 ring-1 ring-primary/40'
												: 'border-transparent hover:bg-muted'
										]}
										onclick={() => toggleFlag(f.id)}
									>
										<AssetFlagChip flag={f} size="sm" />
									</button>
								{/each}
							</div>
						</fieldset>
					{/if}

					{#if pickedFlags.length}
						<div>
							<label class="text-xs font-medium text-muted-foreground" for="scope-add-reason">
								Flag reason {reasonRequired ? '(required)' : '(optional)'}
							</label>
							<Textarea
								id="scope-add-reason"
								value={flagReason}
								oninput={(e) => (flagReason = (e.target as HTMLTextAreaElement).value)}
								rows={2}
								maxlength={MAX_REASON}
								class="mt-1"
								aria-invalid={reasonMissing}
								aria-required={reasonRequired}
							/>
							{#if reasonMissing}
								<p class="mt-1 text-2xs text-destructive">
									{pickedFlags
										.filter((f) => f.requires_reason)
										.map((f) => f.name)
										.join(', ')} requires a reason.
								</p>
							{/if}
						</div>
					{/if}
				{:else}
					<ScopeIocFields bind:form={iocForm} {iocTypes} {tlps} />
				{/if}

				<ScopeCasePicker
					{cases}
					{selected}
					onChange={(next) => (selected = next)}
					idPrefix={`scope-add-${kind}-target`}
				/>
				<ScopeCustomerWarning {customers} />
			{/if}
		</div>

		<DialogFooter class="border-t px-6 py-3">
			{#if outcomes}
				<Button onclick={close}>Done</Button>
			{:else}
				<Button variant="ghost" onclick={() => (open = false)} disabled={submitting}>Cancel</Button>
				<Button
					variant="outline"
					onclick={stageForLater}
					disabled={!formValid || submitting || tooManyToStage}
					class="gap-1.5"
					title={tooManyToStage
						? `A staged object proposes at most ${SCOPE_MAX_TARGET_CASES} target cases`
						: 'Keep it in the war-room staging inbox and push it later'}
				>
					<Inbox class="h-3.5 w-3.5" />
					Stage for later
				</Button>
				<Button onclick={submit} disabled={!canSubmit || submitting} class="gap-1.5">
					{#if submitting}
						<Loader2 class="h-3.5 w-3.5 animate-spin" />
					{:else}
						<Plus class="h-3.5 w-3.5" />
					{/if}
					Add to {selected.length}
					{selected.length === 1 ? 'case' : 'cases'}
				</Button>
			{/if}
		</DialogFooter>
	</DialogContent>
</Dialog>
