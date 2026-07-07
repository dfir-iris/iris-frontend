<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import Button from '$lib/components/ui/button/button.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import Label from '$lib/components/ui/label/label.svelte';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import SearchSelect, {
		type SelectOption
	} from '$lib/components/common/selects/SearchSelect.svelte';
	import { SegmentedSelect, type SegmentedSelectOption } from '$lib/components/ui/segmented-select';
	import TagInput from '$lib/components/common/tag/TagInput.svelte';
	import { CaseService } from '$lib/services/case.service';
	import type { Case } from '$lib/types/resources/case';

	// The dialog collects everything the caller needs to hit either
	// `POST /api/v2/incidents/{id}/escalate` (new case) or
	// `POST /api/v2/incidents/{id}/merge` (existing case). Bodies are
	// shaped for those two endpoints — the parent handler picks which
	// service call to fire based on `mode`.
	export type IncidentEscalatePayload =
		| {
				mode: 'new';
				case_title: string;
				note: string;
				case_tags: string;
				import_as_event: boolean;
		  }
		| {
				mode: 'existing';
				target_case_id: number;
				note: string;
				case_tags: string;
				import_as_event: boolean;
		  };

	type Props = {
		open: boolean;
		incidentTitle: string;
		incidentDescription: string;
		incidentCustomerId: number | null;
		onClose: () => void;
		onConfirm: (payload: IncidentEscalatePayload) => void;
	};

	let {
		open = $bindable(),
		incidentTitle,
		incidentDescription,
		incidentCustomerId,
		onClose,
		onConfirm
	}: Props = $props();

	type Mode = 'new' | 'existing';
	let mode = $state<Mode>('new');
	let targetCaseId = $state('');
	let caseTitle = $state('');
	let note = $state('');
	let tags = $state('');
	let importAsEvent = $state(true);

	// Existing-case list is fetched lazily on dialog open. Scoped to the
	// incident's customer so analysts can't accidentally merge a tenant's
	// incident into another tenant's case (the backend also enforces this,
	// but filtering the picker prevents 400s at submit time).
	let cases = $state<Case[]>([]);
	let loadingCases = $state(false);

	const modeOptions = $derived.by<SegmentedSelectOption[]>(() => [
		{ value: 'new', label: 'Escalate into a new case' },
		{ value: 'existing', label: 'Merge into existing case' }
	]);

	const caseOptions = $derived.by<SelectOption[]>(() =>
		cases.map((c) => ({ value: String(c.case_id), label: c.case_name }))
	);

	const getTitle = () =>
		mode === 'existing' ? 'Merge incident into an existing case' : 'Escalate incident to a new case';

	const resetForm = () => {
		mode = 'new';
		targetCaseId = '';
		caseTitle = incidentTitle;
		note = incidentDescription ?? '';
		tags = '';
		importAsEvent = true;
	};

	const loadCases = async () => {
		loadingCases = true;
		try {
			const params: Record<string, unknown> = { per_page: 200 };
			if (incidentCustomerId != null) params.case_customer_id = incidentCustomerId;
			const res = await CaseService.list(params);
			if (res.ok && res.data && typeof res.data === 'object') {
				const body = res.data as { data?: Case[] };
				cases = Array.isArray(body.data) ? body.data : [];
			} else {
				cases = [];
			}
		} finally {
			loadingCases = false;
		}
	};

	// Fire once per open→true transition. `$effect` re-runs on any reactive
	// read inside its body, so calling `loadCases()` (which mutates
	// `cases`/`loadingCases`) directly here caused an infinite fetch loop —
	// the mutations extended the tracking scope through the function call
	// and every fetch resolution retriggered the effect. `untrack()` scopes
	// the resetForm+load work outside the reactive graph so we only re-fire
	// when `open` actually flips. `lastOpen` prevents re-firing when other
	// prop reads (unlikely, but the `incident*` props are captured on read)
	// happen while the dialog is open.
	let lastOpen = false;
	$effect(() => {
		if (open && !lastOpen) {
			lastOpen = true;
			untrack(() => {
				resetForm();
				void loadCases();
			});
		} else if (!open) {
			lastOpen = false;
		}
	});

	onMount(async () => {});
</script>

<Dialog.Root
	bind:open
	onOpenChange={(nextOpen) => {
		if (!nextOpen) onClose();
	}}
>
	<Dialog.Content class="flex max-h-[80vh] max-w-[820px] flex-col p-0">
		<Dialog.Header class="border-b px-6 py-4">
			<Dialog.Title class="text-base font-medium">{getTitle()}</Dialog.Title>
		</Dialog.Header>

		<div class="flex-1 overflow-auto px-6 py-5">
			<div class="space-y-5">
				<div class="space-y-2">
					<Label class="text-sm font-medium">Destination</Label>
					<SegmentedSelect
						options={modeOptions}
						value={mode}
						onChange={(v) => (mode = v as Mode)}
					/>
				</div>

				{#if mode === 'new'}
					<div class="space-y-2">
						<p class="text-sm text-muted-foreground">
							A new case will be created from this incident. Every alert on the incident is
							linked to the new case along with its IOCs and assets.
						</p>
					</div>
					<div class="space-y-2">
						<Label for="incident-escalate-case-title" class="block text-sm font-medium">
							New case title *
						</Label>
						<Input id="incident-escalate-case-title" bind:value={caseTitle} />
					</div>
				{:else}
					<div class="space-y-2">
						<p class="text-sm text-muted-foreground">
							Merge every alert on this incident into the selected case. IOCs and assets are
							deduped against what the case already holds.
						</p>
					</div>
					<div class="space-y-2">
						<Label class="block text-sm font-medium">Existing case *</Label>
						<SearchSelect
							value={targetCaseId}
							options={caseOptions}
							placeholder={loadingCases ? 'Loading cases…' : 'Select a case'}
							searchPlaceholder="Search case..."
							onChange={(value) => (targetCaseId = value as string)}
						/>
					</div>
				{/if}

				<div class="space-y-2">
					<Label for="incident-escalate-note" class="block text-sm font-medium">
						Escalation note
					</Label>
					<textarea
						id="incident-escalate-note"
						class="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-0 placeholder:text-muted-foreground focus:border-ring"
						bind:value={note}
					></textarea>
				</div>

				<div class="space-y-2">
					<Label for="incident-escalate-tags" class="block text-sm font-medium">Case tags</Label>
					<TagInput bind:tags outputFormat="string" placeholder="Add tags..." maxTags={20} />
				</div>

				<div class="flex items-center gap-2">
					<Checkbox
						id="incident-escalate-add-event"
						checked={importAsEvent}
						onCheckedChange={(checked) => (importAsEvent = checked === true)}
					/>
					<Label for="incident-escalate-add-event" class="text-sm font-normal">
						Add alerts as events in the case timeline
					</Label>
				</div>
			</div>
		</div>

		<div class="flex items-center justify-end gap-2 border-t px-6 py-4">
			<Button
				variant="outline"
				onclick={() => {
					open = false;
					onClose();
				}}
			>
				Cancel
			</Button>

			<Button
				onclick={() => {
					if (mode === 'new') {
						onConfirm({
							mode: 'new',
							case_title: caseTitle.trim(),
							note,
							case_tags: tags,
							import_as_event: importAsEvent
						});
					} else {
						onConfirm({
							mode: 'existing',
							target_case_id: Number(targetCaseId),
							note,
							case_tags: tags,
							import_as_event: importAsEvent
						});
					}
				}}
				disabled={(mode === 'new' && caseTitle.trim().length === 0) ||
					(mode === 'existing' && targetCaseId === '')}
			>
				{mode === 'existing' ? 'Merge' : 'Escalate'}
			</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
