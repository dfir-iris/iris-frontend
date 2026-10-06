<!--
  Edit a staged object: its payload, proposed target cases and note.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { Loader2 } from 'lucide-svelte';
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
	import type { AssetType } from '$lib/services/asset-types.service';
	import type { AnalysisStatusItem } from '$lib/services/analysis-status.service';
	import type { IocType } from '$lib/services/ioc-types.service';
	import type { TlpItem } from '$lib/services/tlp.service';
	import {
		WarRoomScopeService,
		type ScopeCase,
		type StagedObject
	} from '$lib/services/war-room-scope.service';
	import ScopeAssetFields from './scope-asset-fields.svelte';
	import ScopeIocFields from './scope-ioc-fields.svelte';
	import ScopeCasePicker from './scope-case-picker.svelte';
	import { SCOPE_MAX_TARGET_CASES } from '$lib/services/war-room-scope-batches';
	import {
		assetFormFromPayload,
		assetFormToInput,
		assetFormValid,
		emptyAssetForm,
		emptyIocForm,
		errorMessage,
		iocFormFromPayload,
		iocFormToInput,
		iocFormValid,
		type AssetForm,
		type IocForm
	} from './helpers';

	type Props = {
		open: boolean;
		warRoomId: number;
		item: StagedObject | null;
		cases: ScopeCase[];
		assetTypes: AssetType[];
		analysisStatuses: AnalysisStatusItem[];
		iocTypes: IocType[];
		tlps: TlpItem[];
		onSaved?: () => void;
	};

	let {
		open = $bindable(),
		warRoomId,
		item,
		cases,
		assetTypes,
		analysisStatuses,
		iocTypes,
		tlps,
		onSaved
	}: Props = $props();

	const MAX_NOTE = 4000;

	let assetForm = $state<AssetForm>(emptyAssetForm());
	let iocForm = $state<IocForm>(emptyIocForm());
	let targets = $state<number[]>([]);
	let note = $state('');
	let saving = $state(false);

	$effect(() => {
		if (open) {
			untrack(() => {
				const payload = item?.payload ?? {};
				assetForm = assetFormFromPayload(payload);
				iocForm = iocFormFromPayload(payload);
				targets = [...(item?.proposed_case_ids ?? [])];
				note = item?.note ?? '';
				saving = false;
			});
		}
	});

	const isAsset = $derived(item?.object_type === 'asset');
	const valid = $derived(isAsset ? assetFormValid(assetForm) : iocFormValid(iocForm));

	// Proposed targets the caller can no longer see (detached / no access)
	// are kept as-is: dropping them silently would rewrite someone else's
	// proposal.
	const caseIds = $derived(new Set(cases.map((c) => c.case_id)));
	const hiddenTargets = $derived(targets.filter((id) => !caseIds.has(id)));
	const visibleTargets = $derived(targets.filter((id) => caseIds.has(id)));

	const save = async () => {
		if (!item || !valid || saving) return;
		saving = true;
		const trimmed = note.trim();
		const res = await WarRoomScopeService.updateStaged(warRoomId, item.id, {
			payload: isAsset ? assetFormToInput(assetForm) : iocFormToInput(iocForm),
			proposed_case_ids: [...targets],
			note: trimmed ? trimmed : null
		});
		saving = false;
		if (!res.ok || !res.data || typeof res.data === 'string') {
			toast({
				title: 'Could not save the staged object',
				description: errorMessage(res, 'The server refused the change.'),
				variant: 'destructive'
			});
			return;
		}
		toast({ title: 'Staged object saved', variant: 'success' });
		open = false;
		onSaved?.();
	};
</script>

<Dialog bind:open>
	<DialogContent class="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
		<DialogHeader class="border-b px-6 py-4">
			<DialogTitle>Edit staged {isAsset ? 'asset' : 'IOC'}</DialogTitle>
			<DialogDescription
				>Adjust the object and its proposed targets before pushing.</DialogDescription
			>
		</DialogHeader>

		<div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
			{#if isAsset}
				<ScopeAssetFields
					bind:form={assetForm}
					{assetTypes}
					{analysisStatuses}
					idPrefix="scope-staged-asset"
				/>
			{:else}
				<ScopeIocFields bind:form={iocForm} {iocTypes} {tlps} idPrefix="scope-staged-ioc" />
			{/if}

			<ScopeCasePicker
				{cases}
				selected={visibleTargets}
				onChange={(next) => (targets = [...next, ...hiddenTargets])}
				max={Math.max(0, SCOPE_MAX_TARGET_CASES - hiddenTargets.length)}
				idPrefix="scope-staged-target"
			/>
			{#if hiddenTargets.length}
				<p class="text-2xs text-muted-foreground">
					Also proposed: {hiddenTargets.length}
					{hiddenTargets.length === 1 ? 'case' : 'cases'} you cannot access.
				</p>
			{/if}

			<div>
				<label class="text-xs font-medium text-muted-foreground" for="scope-staged-note">Note</label
				>
				<Textarea
					id="scope-staged-note"
					value={note}
					oninput={(e) => (note = (e.target as HTMLTextAreaElement).value)}
					rows={2}
					maxlength={MAX_NOTE}
					class="mt-1"
				/>
			</div>
		</div>

		<DialogFooter class="border-t px-6 py-3">
			<Button variant="ghost" onclick={() => (open = false)} disabled={saving}>Cancel</Button>
			<Button onclick={save} disabled={!valid || saving} class="gap-1.5">
				{#if saving}
					<Loader2 class="h-3.5 w-3.5 animate-spin" />
				{/if}
				Save
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
