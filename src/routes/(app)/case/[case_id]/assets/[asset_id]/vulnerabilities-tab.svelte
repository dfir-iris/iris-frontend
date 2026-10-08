<!--
  Vulnerability findings recorded on one case asset, with a quick add.
  `?finding=<id>` in the URL opens that finding once.
-->
<script lang="ts">
	import { getContext } from 'svelte';
	import { PlusIcon } from 'lucide-svelte';
	import { page } from '$app/state';
	import {
		CASE_ACCESS_CTX,
		type CaseAccessContext
	} from '$lib/contexts/case-access.context.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import {
		VulnerabilitiesService,
		type CaseFinding,
		type ManagedFinding
	} from '$lib/services/vulnerabilities.service';
	import FindingsList from '$lib/components/vulnerabilities/findings/FindingsList.svelte';
	import CaseFindingDialog from '$lib/components/vulnerabilities/findings/CaseFindingDialog.svelte';
	import FindingHistoryDialog from '$lib/components/vulnerabilities/findings/FindingHistoryDialog.svelte';
	import {
		deleteCaseFinding,
		fetchCaseFindingForEdit
	} from '$lib/components/vulnerabilities/findings/case-findings';
	import { canWriteFindings } from '$lib/components/vulnerabilities/permissions';
	import { USER_CTX, type UserCtx } from '$lib/contexts/user-context.context.svelte';

	let {
		assetId,
		onCountChange
	}: {
		assetId: number;
		onCountChange?: (count: number) => void;
	} = $props();

	const caseAccess = getContext<CaseAccessContext | undefined>(CASE_ACCESS_CTX);
	const userCtx = getContext<UserCtx>(USER_CTX);
	// Recording / editing / deleting findings needs case write access
	// and `vulnerabilities_create`.
	const canEdit = $derived(canWriteFindings(userCtx, caseAccess?.canEdit() ?? false));
	const caseId = $derived(Number(page.params.case_id));

	let findings = $state<CaseFinding[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let seq = 0;

	const load = async () => {
		const id = caseId;
		const asset = assetId;
		if (!Number.isFinite(id)) return;
		const mine = ++seq;
		loading = true;
		error = null;
		const res = await VulnerabilitiesService.listCase(id, { asset_id: asset });
		if (mine !== seq) return;
		loading = false;
		if (res.ok && res.data && typeof res.data === 'object') {
			findings = res.data.findings;
			onCountChange?.(findings.length);
		} else {
			findings = [];
			error = res.error?.message ?? 'Failed to load the vulnerabilities';
		}
	};

	$effect(() => {
		void [caseId, assetId];
		void load();
	});

	let addOpen = $state(false);
	let editOpen = $state(false);
	let editFinding = $state<CaseFinding | null>(null);
	let historyOpen = $state(false);
	let historyFinding = $state<CaseFinding | null>(null);
	let deleteOpen = $state(false);
	let deleteFinding = $state<CaseFinding | null>(null);

	const asCase = (f: CaseFinding | ManagedFinding) => f as CaseFinding;

	const openEdit = async (finding: CaseFinding) => {
		const full = await fetchCaseFindingForEdit(caseId, finding.finding_id);
		if (!full) return;
		editFinding = full;
		editOpen = true;
	};

	// `?finding=<id>` (war-room board attention links) opens that finding
	// once: the edit dialog with write access, its history otherwise.
	let openedFinding: number | null = null;
	$effect(() => {
		const raw = Number(page.url.searchParams.get('finding'));
		if (!Number.isInteger(raw) || raw <= 0 || raw === openedFinding) return;
		openedFinding = raw;
		if (canEdit) {
			void openEdit({ finding_id: raw } as CaseFinding);
			return;
		}
		void fetchCaseFindingForEdit(caseId, raw).then((full) => {
			if (!full) return;
			historyFinding = full;
			historyOpen = true;
		});
	});

	const confirmDelete = async () => {
		if (deleteFinding && (await deleteCaseFinding(caseId, deleteFinding))) void load();
	};
</script>

<div class="flex flex-col gap-3">
	{#if canEdit}
		<div class="flex items-center gap-2">
			<Button
				size="sm"
				variant="outline"
				class="ml-auto"
				data-tour="asset-vuln-add"
				onclick={() => (addOpen = true)}
			>
				<PlusIcon /> Add vulnerability
			</Button>
		</div>
	{/if}

	{#if loading && findings.length === 0}
		<Skeleton class="h-16 w-full" />
		<Skeleton class="h-16 w-full" />
	{:else if error}
		<p class="py-4 text-center text-xs text-destructive">{error}</p>
	{:else}
		<FindingsList
			{findings}
			{canEdit}
			emptyMessage="No vulnerability recorded on this asset."
			onHistory={(f) => {
				historyFinding = asCase(f);
				historyOpen = true;
			}}
			onEdit={(f) => openEdit(asCase(f))}
			onDelete={(f) => {
				deleteFinding = asCase(f);
				deleteOpen = true;
			}}
		/>
	{/if}
</div>

{#if canEdit}
	<CaseFindingDialog bind:open={addOpen} {caseId} presetAssetIds={[assetId]} onSaved={load} />
	<CaseFindingDialog bind:open={editOpen} {caseId} finding={editFinding} onSaved={load} />
{/if}

{#if historyFinding}
	{@const target = historyFinding}
	<FindingHistoryDialog
		bind:open={historyOpen}
		title={`${target.vulnerability.identifier} on ${target.asset_name}`}
		load={() => VulnerabilitiesService.caseHistory(caseId, target.finding_id)}
	/>
{/if}

<ConfirmationDialog
	bind:open={deleteOpen}
	title="Delete finding"
	message={deleteFinding
		? `Remove ${deleteFinding.vulnerability.identifier} from ${deleteFinding.asset_name}? Its history goes with it.`
		: ''}
	confirmText="Delete"
	onConfirm={confirmDelete}
/>
