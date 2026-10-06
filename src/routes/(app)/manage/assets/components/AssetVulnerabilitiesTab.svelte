<!--
  Vulnerabilities of a registry asset: its own (registry) findings,
  editable with asset_manager_write, and — read-only — the findings
  recorded on the cases where this asset was sighted, linking back to
  those cases.
-->
<script lang="ts">
	import { PlusIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from '$lib/components/ui/toast';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import {
		VulnerabilitiesService,
		type CaseFinding,
		type ManagedFinding
	} from '$lib/services/vulnerabilities.service';
	import FindingsList from '$lib/components/vulnerabilities/findings/FindingsList.svelte';
	import ManagedFindingDialog from '$lib/components/vulnerabilities/findings/ManagedFindingDialog.svelte';
	import FindingHistoryDialog from '$lib/components/vulnerabilities/findings/FindingHistoryDialog.svelte';

	let {
		assetId,
		assetName,
		canWrite = false
	}: {
		assetId: number;
		assetName: string;
		canWrite?: boolean;
	} = $props();

	let findings = $state<ManagedFinding[]>([]);
	let fromCases = $state<CaseFinding[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	const load = async () => {
		loading = true;
		error = null;
		try {
			const res = await VulnerabilitiesService.listManaged(assetId);
			if (res.ok && res.data && typeof res.data === 'object') {
				findings = res.data.findings;
				fromCases = res.data.from_cases;
			} else {
				findings = [];
				fromCases = [];
				error = res.error?.message ?? 'Failed to load the vulnerabilities';
			}
		} finally {
			loading = false;
		}
	};

	$effect(() => {
		void assetId;
		void load();
	});

	let addOpen = $state(false);
	let editOpen = $state(false);
	let editFinding = $state<ManagedFinding | null>(null);
	let historyOpen = $state(false);
	let historyTarget = $state<CaseFinding | ManagedFinding | null>(null);
	let deleteOpen = $state(false);
	let deleteFinding = $state<ManagedFinding | null>(null);

	const asManaged = (f: CaseFinding | ManagedFinding) => f as ManagedFinding;

	const loadHistory = (target: CaseFinding | ManagedFinding) =>
		target.scope === 'case'
			? VulnerabilitiesService.caseHistory(target.case_id, target.finding_id)
			: VulnerabilitiesService.managedHistory(assetId, target.finding_id);

	const confirmDelete = async () => {
		const finding = deleteFinding;
		if (!finding) return;
		const res = await VulnerabilitiesService.removeManaged(assetId, finding.finding_id);
		if (!res.ok) {
			toast({
				title: 'Failed to delete the finding',
				description: res.error?.message,
				variant: 'destructive'
			});
			return;
		}
		toast({ title: `${finding.vulnerability.identifier} removed`, variant: 'success' });
		void load();
	};

	const showHistory = (f: CaseFinding | ManagedFinding) => {
		historyTarget = f;
		historyOpen = true;
	};
</script>

<div class="flex flex-col gap-5">
	<section class="flex flex-col gap-2">
		<div class="flex items-center gap-2">
			<h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				On this asset
			</h3>
			<span class="text-xs tabular-nums text-muted-foreground">{findings.length}</span>
			{#if canWrite}
				<Button size="sm" variant="outline" class="ml-auto" onclick={() => (addOpen = true)}>
					<PlusIcon /> Add vulnerability
				</Button>
			{/if}
		</div>
		{#if loading && findings.length === 0 && fromCases.length === 0}
			<Skeleton class="h-16 w-full" />
		{:else if error}
			<p class="py-4 text-center text-xs text-destructive">{error}</p>
		{:else}
			<FindingsList
				{findings}
				canEdit={canWrite}
				emptyMessage="No vulnerability recorded on the registry asset."
				onHistory={showHistory}
				onEdit={(f) => {
					editFinding = asManaged(f);
					editOpen = true;
				}}
				onDelete={(f) => {
					deleteFinding = asManaged(f);
					deleteOpen = true;
				}}
			/>
		{/if}
	</section>

	{#if !error}
		<section class="flex flex-col gap-2">
			<div class="flex items-center gap-2">
				<h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					From cases
				</h3>
				<span class="text-xs tabular-nums text-muted-foreground">{fromCases.length}</span>
			</div>
			<p class="text-2xs text-muted-foreground">
				Recorded on the cases where this asset was sighted (those you can open). Edit them from
				their case.
			</p>
			{#if loading && fromCases.length === 0}
				<Skeleton class="h-16 w-full" />
			{:else}
				<FindingsList
					findings={fromCases}
					showCase
					emptyMessage="No finding on the cases of this asset."
					onHistory={showHistory}
				/>
			{/if}
		</section>
	{/if}
</div>

{#if canWrite}
	<ManagedFindingDialog bind:open={addOpen} managedAssetId={assetId} {assetName} onSaved={load} />
	<ManagedFindingDialog
		bind:open={editOpen}
		managedAssetId={assetId}
		{assetName}
		finding={editFinding}
		onSaved={load}
	/>
{/if}

{#if historyTarget}
	{@const target = historyTarget}
	<FindingHistoryDialog
		bind:open={historyOpen}
		title={`${target.vulnerability.identifier} on ${target.scope === 'case' ? target.asset_name : assetName}`}
		load={() => loadHistory(target)}
	/>
{/if}

<ConfirmationDialog
	bind:open={deleteOpen}
	title="Delete finding"
	message={deleteFinding
		? `Remove ${deleteFinding.vulnerability.identifier} from ${assetName}? Its history goes with it.`
		: ''}
	confirmText="Delete"
	onConfirm={confirmDelete}
/>
