<!--
  Case finding dialog: add (one catalogue entry on several case assets)
  or edit (statuses, dates, linked events / IOCs) a finding of a case.
  Used by the Vulnerabilities tab of the case asset detail.
-->
<script lang="ts">
	import { toast } from '$lib/components/ui/toast';
	import { Label } from '$lib/components/ui/label';
	import { CaseAssetsService } from '$lib/services/case-assets.service';
	import { CaseIocsService } from '$lib/services/case-iocs.service';
	import { CaseTimelineService } from '$lib/services/case-timeline.service';
	import { VulnerabilitiesService, type CaseFinding } from '$lib/services/vulnerabilities.service';
	import FindingDialog from './FindingDialog.svelte';
	import IdChecklist from './IdChecklist.svelte';
	import {
		buildCaseCreatePayload,
		buildFindingPayload,
		choiceIdentifier,
		emptyFindingForm,
		findingToForm,
		type FindingFormState,
		type VulnerabilityChoice
	} from './finding-form';

	type Item = { id: number; label: string; hint?: string | null };

	let {
		open = $bindable(false),
		caseId,
		finding = null,
		presetAssetIds = [],
		initialChoice = null,
		onSaved
	}: {
		open: boolean;
		caseId: number;
		/** Set to edit this finding; leave `null` to add. */
		finding?: CaseFinding | null;
		/** Assets ticked when adding (e.g. from an asset's detail). */
		presetAssetIds?: number[];
		initialChoice?: VulnerabilityChoice | null;
		onSaved?: () => void;
	} = $props();

	const mode = $derived<'create' | 'edit'>(finding ? 'edit' : 'create');
	const initial = $derived<FindingFormState>(finding ? findingToForm(finding) : emptyFindingForm());

	let assetIds = $state<number[]>([]);
	let assets = $state<Item[]>([]);
	let iocs = $state<Item[]>([]);
	let events = $state<Item[]>([]);
	let loadingAssets = $state(false);
	let loadingEvidence = $state(false);
	let wasOpen = false;

	const withLinked = (items: Item[], linked: Item[]): Item[] => {
		const known = new Set(items.map((i) => i.id));
		return [...linked.filter((i) => !known.has(i.id)), ...items];
	};

	const loadAssets = async () => {
		loadingAssets = true;
		try {
			const res = await CaseAssetsService.list(caseId, { per_page: 1000 });
			const rows = res.ok && res.data && typeof res.data === 'object' ? res.data.data : [];
			assets = rows.map((a) => ({
				id: a.asset_id,
				label: a.asset_name,
				hint: a.asset_type?.asset_name ?? null
			}));
		} finally {
			loadingAssets = false;
		}
	};

	const loadEvidence = async () => {
		loadingEvidence = true;
		try {
			const [iocRes, eventRes] = await Promise.all([
				CaseIocsService.list(caseId, { per_page: 1000 }),
				CaseTimelineService.listEvents(caseId, {}, {}, { page: 1, per_page: 500 })
			]);
			const iocRows =
				iocRes.ok && iocRes.data && typeof iocRes.data === 'object' ? iocRes.data.data : [];
			const eventRows =
				eventRes.ok && eventRes.data && typeof eventRes.data === 'object'
					? (eventRes.data.timeline ?? eventRes.data.tim ?? [])
					: [];
			iocs = withLinked(
				iocRows.map((i) => ({ id: i.ioc_id, label: i.ioc_value, hint: i.ioc_type?.type_name })),
				(finding?.iocs ?? []).map((i) => ({
					id: i.ioc_id,
					label: i.ioc_value,
					hint: i.ioc_type_name
				}))
			);
			events = withLinked(
				eventRows.map((e) => ({
					id: e.event_id,
					label: e.event_title,
					hint: e.event_date?.slice(0, 16).replace('T', ' ')
				})),
				(finding?.events ?? []).map((e) => ({
					id: e.event_id,
					label: e.event_title,
					hint: e.event_date?.slice(0, 16).replace('T', ' ')
				}))
			);
		} finally {
			loadingEvidence = false;
		}
	};

	$effect(() => {
		if (open && !wasOpen) {
			assetIds = [...presetAssetIds];
			if (!finding) void loadAssets();
			void loadEvidence();
		}
		wasOpen = open;
	});

	const extraError = $derived(
		mode === 'create' && assetIds.length === 0 ? 'Select at least one asset.' : null
	);

	const submit = async ({
		choice,
		form
	}: {
		choice: VulnerabilityChoice | null;
		form: FindingFormState;
	}): Promise<boolean> => {
		if (finding) {
			const payload = buildFindingPayload(form, { evidence: true, initial });
			if (Object.keys(payload).length === 0) return true;
			const res = await VulnerabilitiesService.updateCase(caseId, finding.finding_id, payload);
			if (!res.ok) {
				toast({
					title: 'Failed to update the finding',
					description: res.error?.message,
					variant: 'destructive'
				});
				return false;
			}
			toast({ title: `${finding.vulnerability.identifier} updated`, variant: 'success' });
			onSaved?.();
			return true;
		}

		if (!choice) return false;
		const res = await VulnerabilitiesService.createCase(
			caseId,
			buildCaseCreatePayload(choice, form, assetIds)
		);
		if (!res.ok || !res.data || typeof res.data !== 'object') {
			toast({
				title: 'Failed to record the vulnerability',
				description: res.error?.message,
				variant: 'destructive'
			});
			return false;
		}
		const { created, skipped_asset_ids, vulnerability } = res.data;
		const skipped = skipped_asset_ids.length;
		toast({
			title: `${vulnerability?.identifier ?? choiceIdentifier(choice)} recorded on ${created.length} asset${created.length === 1 ? '' : 's'}`,
			description: skipped
				? `${skipped} asset${skipped === 1 ? '' : 's'} already tracked it and ${skipped === 1 ? 'was' : 'were'} skipped.`
				: undefined,
			variant: created.length ? 'success' : 'default'
		});
		onSaved?.();
		return true;
	};
</script>

<FindingDialog
	bind:open
	{mode}
	title={finding ? `Edit ${finding.vulnerability.identifier}` : 'Add a vulnerability'}
	description={finding
		? `${finding.vulnerability.title} — on ${finding.asset_name}`
		: 'Record a catalogue entry on one or more assets of this case.'}
	{initial}
	{initialChoice}
	ownerName={finding?.owner_name ?? null}
	{extraError}
	onSubmit={submit}
>
	{#snippet before()}
		{#if !finding}
			<section class="flex flex-col gap-2">
				<h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assets</h3>
				<IdChecklist
					items={assets}
					bind:selected={assetIds}
					loading={loadingAssets}
					emptyMessage="This case has no assets yet."
					filterPlaceholder="Filter assets…"
					showSelectAll
				/>
			</section>
		{/if}
	{/snippet}

	{#snippet after(form: FindingFormState)}
		<section class="flex flex-col gap-2">
			<h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Evidence</h3>
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div class="flex flex-col gap-1.5">
					<Label class="text-xs">Timeline events</Label>
					<IdChecklist
						items={events}
						selected={form.event_ids}
						onChange={(ids) => (form.event_ids = ids)}
						loading={loadingEvidence}
						emptyMessage="No timeline events."
						filterPlaceholder="Filter events…"
					/>
				</div>
				<div class="flex flex-col gap-1.5">
					<Label class="text-xs">IOCs</Label>
					<IdChecklist
						items={iocs}
						selected={form.ioc_ids}
						onChange={(ids) => (form.ioc_ids = ids)}
						loading={loadingEvidence}
						emptyMessage="No IOCs."
						filterPlaceholder="Filter IOCs…"
					/>
				</div>
			</div>
		</section>
	{/snippet}
</FindingDialog>
