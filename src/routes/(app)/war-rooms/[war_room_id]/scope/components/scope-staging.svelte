<!--
  War-room staging inbox: objects spotted at war-room level that do not
  belong to a case yet. Review, adjust targets, push (or discard).
-->
<script lang="ts">
	import { Bug, CornerDownRight, Inbox, Pencil, Send, Server, Trash2 } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components/ui/toast';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import { formatDateTime } from '$lib/utils/time-formatter';
	import type { AssetType } from '$lib/services/asset-types.service';
	import type { AnalysisStatusItem } from '$lib/services/analysis-status.service';
	import type { IocType } from '$lib/services/ioc-types.service';
	import type { TlpItem } from '$lib/services/tlp.service';
	import {
		WarRoomScopeService,
		type ScopeCase,
		type StagedObject
	} from '$lib/services/war-room-scope.service';
	import ScopePushDialog from './scope-push-dialog.svelte';
	import ScopeStagedEditDialog from './scope-staged-edit-dialog.svelte';
	import { SCOPE_MAX_TARGET_CASES } from '$lib/services/war-room-scope-batches';
	import { errorMessage, limitedList, stagedLabel, type ScopeOutcome } from './helpers';

	type Props = {
		warRoomId: number;
		items: StagedObject[];
		cases: ScopeCase[];
		canWrite: boolean;
		assetTypes: AssetType[];
		analysisStatuses: AnalysisStatusItem[];
		iocTypes: IocType[];
		tlps: TlpItem[];
		onChanged: () => void;
	};

	let {
		warRoomId,
		items,
		cases,
		canWrite,
		assetTypes,
		analysisStatuses,
		iocTypes,
		tlps,
		onChanged
	}: Props = $props();

	let editOpen = $state(false);
	let pushOpen = $state(false);
	let confirmOpen = $state(false);
	let current = $state<StagedObject | null>(null);

	const caseById = $derived(new Map(cases.map((c) => [c.case_id, c])));
	const assetTypeName = $derived(new Map(assetTypes.map((t) => [t.asset_id, t.asset_name])));
	const iocTypeName = $derived(new Map(iocTypes.map((t) => [t.type_id, t.type_name])));

	const typeLabel = (s: StagedObject): string => {
		const id = Number(s.object_type === 'ioc' ? s.payload.ioc_type_id : s.payload.asset_type_id);
		const name = s.object_type === 'ioc' ? iocTypeName.get(id) : assetTypeName.get(id);
		return name ?? (s.object_type === 'ioc' ? 'IOC' : 'Asset');
	};

	const targetsLabel = (s: StagedObject): string => {
		const ids = s.proposed_case_ids ?? [];
		if (ids.length === 0) return 'No target yet';
		return limitedList(
			ids.map((id) => {
				const c = caseById.get(id);
				return c ? `#${id} ${c.case_name}` : `#${id}`;
			}),
			5
		);
	};

	const openEdit = (s: StagedObject) => {
		current = s;
		editOpen = true;
	};

	const openPush = (s: StagedObject) => {
		current = s;
		pushOpen = true;
	};

	const askRemove = (s: StagedObject) => {
		current = s;
		confirmOpen = true;
	};

	const remove = async () => {
		if (!current) return;
		const target = current;
		const res = await WarRoomScopeService.removeStaged(warRoomId, target.id);
		if (!res.ok) {
			toast({
				title: 'Could not discard the staged object',
				description: errorMessage(res, 'The server refused the request.'),
				variant: 'destructive'
			});
			return;
		}
		toast({ title: 'Staged object discarded', description: stagedLabel(target) });
		onChanged();
	};

	const push = async (caseIds: number[]): Promise<ScopeOutcome[] | null> => {
		if (!current) return null;
		const label = stagedLabel(current);
		const res = await WarRoomScopeService.pushStaged(warRoomId, current.id, caseIds);
		if (!res.ok || !res.data || typeof res.data === 'string') {
			toast({
				title: 'Could not push the staged object',
				description: errorMessage(res, 'The server refused the request.'),
				variant: 'destructive'
			});
			return null;
		}
		return res.data.results.map((r) => ({
			case_id: r.case_id,
			status: r.status,
			label,
			message: r.message
		}));
	};
</script>

<div class="flex flex-col gap-3">
	<div class="flex items-start gap-3 rounded-md border bg-card/40 px-4 py-3">
		<Inbox class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
		<div class="min-w-0 flex-1">
			<p class="text-sm font-medium">War-room inbox</p>
			<p class="text-xs text-muted-foreground">
				Things spotted at war-room level that don't belong to a case yet. Review, adjust targets,
				push.
			</p>
		</div>
	</div>

	{#if items.length === 0}
		<div
			class="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground"
		>
			<Inbox class="h-8 w-8 opacity-50" aria-hidden="true" />
			<p class="text-sm font-medium">Staging is empty</p>
			<p class="text-xs">Everything spotted in the war room has been pushed to a case.</p>
		</div>
	{:else}
		<ul class="flex flex-col gap-2" data-testid="scope-staging-list">
			{#each items as s (s.id)}
				<li
					class="flex flex-wrap items-center gap-3 rounded-md border bg-card px-3 py-2.5"
					data-testid="scope-staged-row"
				>
					<div class="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
						{#if s.object_type === 'ioc'}
							<Bug class="h-4 w-4" aria-hidden="true" />
						{:else}
							<Server class="h-4 w-4" aria-hidden="true" />
						{/if}
					</div>
					<div class="min-w-0 flex-1">
						<p class="flex items-center gap-2 text-sm">
							<span class="truncate font-mono font-medium">{stagedLabel(s)}</span>
							<span class="shrink-0 text-2xs text-muted-foreground">{typeLabel(s)}</span>
						</p>
						<p class="flex items-center gap-1 text-2xs text-muted-foreground">
							<CornerDownRight class="h-3 w-3" aria-hidden="true" />
							{s.created_by_name ?? 'Unknown'}
							{#if s.created_at}
								· {formatDateTime(s.created_at)}
							{/if}
							{#if s.note}
								· <span class="truncate italic">{s.note}</span>
							{/if}
						</p>
					</div>
					<div class="min-w-0 max-w-[18rem] text-xs">
						<p class="text-2xs uppercase tracking-wider text-muted-foreground">Proposed target</p>
						<p class="truncate" title={targetsLabel(s)}>{targetsLabel(s)}</p>
					</div>
					{#if canWrite}
						<div class="flex shrink-0 items-center gap-1">
							<Button
								variant="ghost"
								size="icon"
								class="h-8 w-8 text-muted-foreground"
								onclick={() => askRemove(s)}
								aria-label={`Discard ${stagedLabel(s)}`}
								title="Discard"
							>
								<Trash2 class="h-4 w-4" />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								class="h-8 w-8 text-muted-foreground"
								onclick={() => openEdit(s)}
								aria-label={`Edit ${stagedLabel(s)}`}
								title="Edit"
							>
								<Pencil class="h-4 w-4" />
							</Button>
							<Button variant="outline" size="sm" class="gap-1.5" onclick={() => openPush(s)}>
								<Send class="h-3.5 w-3.5" /> Push…
							</Button>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<ScopeStagedEditDialog
	bind:open={editOpen}
	{warRoomId}
	item={current}
	{cases}
	{assetTypes}
	{analysisStatuses}
	{iocTypes}
	{tlps}
	onSaved={onChanged}
/>

<ScopePushDialog
	bind:open={pushOpen}
	title={`Push ${current ? stagedLabel(current) : ''}`}
	description="Create it in the selected cases. The staged row is removed once every target holds it."
	{cases}
	initialCaseIds={(current?.proposed_case_ids ?? []).filter((id) => caseById.has(id))}
	maxCases={SCOPE_MAX_TARGET_CASES}
	onSubmit={push}
	onDone={onChanged}
/>

<ConfirmationDialog
	bind:open={confirmOpen}
	title="Discard staged object"
	message={`Discard "${current ? stagedLabel(current) : ''}" from the staging inbox? It was never pushed to a case.`}
	confirmText="Discard"
	confirmButtonVariant="destructive"
	onConfirm={remove}
	showIcon
/>
