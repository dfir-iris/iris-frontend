<script lang="ts">
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

	export type MergeMode = 'new' | 'existing';

	export type MergeAlertsPayload = {
		merge_mode: MergeMode;
		target_case_id: number | null;
		case_title: string;
		case_template_id: number | null;
		escalation_note: string;
		case_tags: string;
		add_as_event: boolean;
	};

	type ItemOption = {
		value: number;
		label: string;
	};

	type Props = {
		open: boolean;
		selectedAlertIds: number[];
		caseTemplates?: ItemOption[];
		existingCases?: ItemOption[];
		onClose: () => void;
		onConfirm: (payload: MergeAlertsPayload) => void;
	};

	let {
		open = $bindable(),
		selectedAlertIds,
		caseTemplates = [],
		existingCases = [],
		onClose,
		onConfirm
	}: Props = $props();

	let mergeMode = $state<MergeMode>('new');
	let targetCaseId = $state('');
	let caseTitle = $state('');
	let caseTemplateId = $state('');
	let escalationNote = $state('');
	let tags = $state('');
	let addAsEvent = $state(true);

	const mergeOptions = $derived.by<SegmentedSelectOption[]>(() => [
		{ value: 'new', label: 'Merge into a new case' },
		{ value: 'existing', label: 'Merge into existing case' }
	]);

	const caseTemplateOptions = $derived.by<SelectOption[]>(() =>
		caseTemplates.map((template) => ({
			value: String(template.value),
			label: template.label
		}))
	);

	const existingCaseOptions = $derived.by<SelectOption[]>(() =>
		existingCases.map((item) => ({
			value: String(item.value),
			label: item.label
		}))
	);

	const getTitle = () =>
		mergeMode === 'existing'
			? 'Merge multiple alerts in an existing case'
			: 'Merge multiple alerts in a new case';

	const resetForm = () => {
		mergeMode = 'new';
		targetCaseId = '';
		caseTitle = `[ALERT] Escalation of ${selectedAlertIds.length} alert${selectedAlertIds.length > 1 ? 's' : ''}`;
		caseTemplateId = '';
		escalationNote = '';
		tags = '';
		addAsEvent = true;
	};

	$effect(() => {
		if (open) {
			resetForm();
		}
	});
</script>

<Dialog.Root
	bind:open
	onOpenChange={(nextOpen) => {
		if (!nextOpen) {
			onClose();
		}
	}}
>
	<Dialog.Content class="flex max-h-[80vh] max-w-[980px] flex-col p-0">
		<Dialog.Header class="border-b px-6 py-4">
			<Dialog.Title class="text-base font-medium">{getTitle()}</Dialog.Title>
		</Dialog.Header>

		<div class="flex-1 overflow-auto px-6 py-5">
			<div class="space-y-5">
				<div class="space-y-2">
					<div class="flex flex-col gap-3">
						<Label class="text-sm font-medium">Merge options</Label>

						<SegmentedSelect
							options={mergeOptions}
							value={mergeMode}
							onChange={(value) => (mergeMode = value as MergeMode)}
						/>
					</div>
				</div>

				{#if mergeMode === 'new'}
					<div class="space-y-2">
						<p class="text-sm text-muted-foreground">
							These alerts will be merged into a new case. Set the case title and select the IOCs
							and Assets to escalate into the case.
						</p>
					</div>

					<div class="space-y-2">
						<Label for="merge-alert-case-title" class="block text-sm font-medium">
							New case title *
						</Label>

						<Input id="merge-alert-case-title" bind:value={caseTitle} />
					</div>

					<div class="space-y-2">
						<Label class="block text-sm font-medium">Select case template</Label>

						<SearchSelect
							value={caseTemplateId}
							options={caseTemplateOptions}
							placeholder="Select a template"
							searchPlaceholder="Search template..."
							onChange={(value) => (caseTemplateId = value as string)}
						/>
					</div>
				{:else}
					<div class="space-y-2">
						<Label class="block text-sm font-medium">Existing case *</Label>

						<SearchSelect
							value={targetCaseId}
							options={existingCaseOptions}
							placeholder="Select a case"
							searchPlaceholder="Search case..."
							onChange={(value) => (targetCaseId = value as string)}
						/>
					</div>
				{/if}

				<div class="space-y-2">
					<Label for="merge-alert-note" class="block text-sm font-medium">Escalation note</Label>
					<textarea
						id="merge-alert-note"
						class="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-0 placeholder:text-muted-foreground focus:border-ring"
						bind:value={escalationNote}
					></textarea>
				</div>

				<div class="space-y-2">
					<Label for="merge-alert-tags" class="block text-sm font-medium">Case tags</Label>

					<TagInput bind:tags outputFormat="string" placeholder="Add tags..." maxTags={20} />
				</div>

				<div class="flex items-center gap-2">
					<Checkbox
						id="merge-alert-add-event"
						checked={addAsEvent}
						onCheckedChange={(checked) => (addAsEvent = checked === true)}
					/>
					<Label for="merge-alert-add-event" class="text-sm font-normal">
						Add alert as event in the timeline
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
				onclick={() =>
					onConfirm({
						merge_mode: mergeMode,
						target_case_id: mergeMode === 'existing' ? Number(targetCaseId) : null,
						case_title: caseTitle,
						case_template_id: mergeMode === 'new' && caseTemplateId ? Number(caseTemplateId) : null,
						escalation_note: escalationNote,
						case_tags: tags,
						add_as_event: addAsEvent
					})}
				disabled={(mergeMode === 'new' && caseTitle.trim().length === 0) ||
					(mergeMode === 'existing' && targetCaseId === '')}
			>
				Merge
			</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
