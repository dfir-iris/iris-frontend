<script lang="ts">
	import { onMount } from 'svelte';
	import type { Alert } from '$lib/types/resources/alert';
	import {
		AlertResolutionService,
		type AlertResolution
	} from '$lib/services/alert-resolutions.service';
	import type { UpdateAlertBody } from '$lib/services/alerts.service';
	import type { RequestResponse } from '$lib/services/api.service';
	import {
		type CaseClassification,
		CaseClassificationsService
	} from '$lib/services/case-classifications.service';
	import { SeveritiesService, type Severity } from '$lib/services/severities.service';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import Label from '$lib/components/ui/label/label.svelte';
	import SearchSelect, {
		type SelectOption
	} from '$lib/components/common/selects/SearchSelect.svelte';
	import { SegmentedSelect, type SegmentedSelectOption } from '$lib/components/ui/segmented-select';
	import TagInput from '$lib/components/common/tag/TagInput.svelte';

	type Props = {
		open: boolean;
		onClose: () => void;
		alert: Alert;
		onSave: (changes: UpdateAlertBody) => void;
	};

	let { open = $bindable(), onClose, alert, onSave }: Props = $props();

	let alertResolutions = $state<AlertResolution[]>([]);
	let resolutionStatusId = $state<number | null>(null);

	let note = $state('');
	let tags = $state('');
	let classificationId = $state('');
	let caseClassifications = $state<CaseClassification[]>([]);
	let severityId = $state('');
	let severities = $state<Severity[]>([]);

	const classificationOptions = $derived.by<SelectOption[]>(() =>
		caseClassifications.map((c) => ({ value: String(c.id), label: c.name_expanded }))
	);

	const severityOptions = $derived.by<SelectOption[]>(() =>
		severities.map((s) => ({ value: String(s.severity_id), label: s.severity_name }))
	);

	const resolutionOptions = $derived.by<SegmentedSelectOption[]>(() =>
		alertResolutions.map((resolution) => ({
			value: resolution.resolution_status_id,
			label: resolution.resolution_status_name
		}))
	);

	$effect(() => {
		if (alert) {
			note = alert.alert_note;
			resolutionStatusId = alert.alert_resolution_status_id;
			classificationId = String(alert.alert_classification_id);
			severityId = String(alert.alert_severity_id);
			tags = alert.alert_tags;
		}
	});

	onMount(async () => {
		const alertResolutionResponse = (await AlertResolutionService.list())
			.data as unknown as RequestResponse<AlertResolution[]>;

		alertResolutions = alertResolutionResponse.data as AlertResolution[];

		const caseClassificationsResponse = (await CaseClassificationsService.list())
			.data as unknown as RequestResponse<CaseClassification[]>;

		caseClassifications = caseClassificationsResponse.data as CaseClassification[];

		const severitiesResponse = (await SeveritiesService.list()).data as unknown as RequestResponse<
			Severity[]
		>;

		severities = severitiesResponse.data as Severity[];
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
			<Dialog.Title class="text-base font-medium">Edit alert #{alert.alert_id}</Dialog.Title>
		</Dialog.Header>

		<div class="flex-1 overflow-auto px-6 py-5">
			<div class="space-y-5">
				<div class="space-y-2">
					<div class="flex flex-col gap-3">
						<Label class="text-sm font-medium">Resolution status</Label>

						<SegmentedSelect
							options={resolutionOptions}
							value={resolutionStatusId}
							onChange={(value) => (resolutionStatusId = Number(value))}
						/>
					</div>
				</div>

				<div class="space-y-2">
					<Label for="alert-note" class="block text-sm font-medium">Note</Label>
					<textarea
						id="alert-note"
						class="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-0 placeholder:text-muted-foreground focus:border-ring"
						bind:value={note}
					></textarea>
				</div>

				<div class="space-y-2">
					<Label for="alert-tags" class="block text-sm font-medium">Tags</Label>

					<TagInput bind:tags outputFormat="string" placeholder="Add tags..." maxTags={20} />
				</div>

				<div class="space-y-2">
					<Label class="block text-sm font-medium">Classification</Label>

					<SearchSelect
						value={classificationId}
						options={classificationOptions}
						placeholder="Classification"
						searchPlaceholder="Search classification..."
						onChange={(value) => (classificationId = value as string)}
					/>
				</div>

				<div class="space-y-2">
					<Label class="block text-sm font-medium">Severity</Label>

					<SearchSelect
						value={severityId}
						options={severityOptions}
						placeholder="Severity"
						searchPlaceholder="Search severity..."
						onChange={(value) => (severityId = value as string)}
					/>
				</div>
			</div>
		</div>

		<div class="flex items-center justify-end gap-2 border-t px-6 py-4">
			<Button
				variant="outline"
				onclick={() => {
					open = false;

					onClose();
				}}>Cancel</Button
			>
			<Button
				onclick={() =>
					onSave({
						alert_note: note,
						alert_tags: tags,
						alert_resolution_status_id: resolutionStatusId,
						alert_classification_id: Number(classificationId),
						alert_severity_id: Number(severityId)
					})}>Save</Button
			>
		</div>
	</Dialog.Content>
</Dialog.Root>
