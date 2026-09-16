<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import {
		AlertResolutionService,
		type AlertResolution
	} from '$lib/services/alert-resolutions.service';
	import type { RequestResponse } from '$lib/services/api.service';
	import type { UpdateAlertBody } from '$lib/services/alerts.service';
	import * as Dialog from '$lib/components/ui/dialog';
	import Button from '$lib/components/ui/button/button.svelte';
	import Label from '$lib/components/ui/label/label.svelte';
	import Textarea from '$lib/components/ui/textarea/textarea.svelte';
	import type { SegmentedSelectOption } from '$lib/components/ui/segmented-select';
	import SegmentedSelect from '$lib/components/ui/segmented-select/segmented-select.svelte';
	import TagInput from '$lib/components/common/tag/TagInput.svelte';
	import type { ClosableAlert } from '../helpers/alerts-close';

	type Props = {
		open: boolean;
		/**
		 * The alerts about to be closed — the objects, not just their ids,
		 * because the tag box is seeded from them. Closing used to send an
		 * empty `alert_tags` and the API takes that as "replace with
		 * nothing", so every tag on the alert was lost on close.
		 */
		selectedAlerts: ClosableAlert[];
		onConfirm: (payload: UpdateAlertBody) => void;
	};

	let { open = $bindable(), selectedAlerts, onConfirm }: Props = $props();

	let alertResolutions = $state<AlertResolution[]>([]);
	let resolutionStatusId = $state<number | null>(null);
	let note = $state('');
	let tags = $state('');

	const resolutionOptions = $derived.by<SegmentedSelectOption[]>(() =>
		alertResolutions.map((resolution) => ({
			value: resolution.resolution_status_id,
			label: resolution.resolution_status_name
		}))
	);

	const isBulk = $derived(selectedAlerts.length > 1);

	const getTitle = () => `Close ${isBulk ? 'multiple alerts' : 'alert'}`;

	const getConfirmLabel = () => `Close alert${isBulk ? 's' : ''}`;

	const resetForm = () => {
		resolutionStatusId =
			alertResolutions.length > 0 ? alertResolutions[0].resolution_status_id : null;
		note = '';
		// Seeded with what the alert already carries so closing it keeps its
		// tags, and so removing one here is a deliberate act rather than a
		// side effect of the box having started empty. With several alerts
		// selected there is no single set to seed with — whatever is typed is
		// added to each of them instead. See `resolveCloseTags`.
		tags = selectedAlerts.length === 1 ? (selectedAlerts[0].alert_tags ?? '') : '';
	};

	$effect(() => {
		if (!open) return;

		// `untrack` so this stays "reset when the dialog opens": resetForm
		// reads the resolutions and the selection, and without it either one
		// arriving late would wipe what the analyst has already typed.
		untrack(() => resetForm());
	});

	$effect(() => {
		if (open && resolutionStatusId === null && alertResolutions.length > 0) {
			resolutionStatusId = alertResolutions[0].resolution_status_id;
		}
	});

	onMount(async () => {
		const alertResolutionResponse = (await AlertResolutionService.list())
			.data as unknown as RequestResponse<AlertResolution[]>;

		alertResolutions = alertResolutionResponse.data as AlertResolution[];
	});
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-w-[980px] p-0">
		<Dialog.Header class="border-b px-6 py-4">
			<Dialog.Title class="text-base font-medium">{getTitle()}</Dialog.Title>
		</Dialog.Header>

		<div class="flex flex-col gap-6 px-6 py-6">
			<div class="flex flex-col gap-3">
				<Label class="text-sm font-medium">Resolution status</Label>

				<SegmentedSelect
					options={resolutionOptions}
					value={resolutionStatusId}
					onChange={(value) => (resolutionStatusId = Number(value))}
				/>
			</div>

			<div class="flex flex-col gap-2">
				<Label for="close-alert-note" class="text-sm font-medium">Note</Label>

				<Textarea id="close-alert-note" bind:value={note} class="min-h-24 resize-none" />
			</div>

			<div class="flex flex-col gap-2">
				<Label for="close-alert-tags" class="text-sm font-medium">Tags</Label>

				<TagInput
					bind:tags
					outputFormat="string"
					placeholder={isBulk ? 'Tags to add to every selected alert...' : 'Add tags...'}
					maxTags={20}
				/>

				{#if isBulk}
					<p class="text-xs text-muted-foreground">
						Added to each alert. Tags already on them are kept.
					</p>
				{/if}
			</div>
		</div>

		<Dialog.Footer class="border-t px-6 py-4 sm:justify-end">
			<div class="flex gap-2">
				<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>

				<Button
					onclick={() =>
						onConfirm({
							alert_resolution_status_id: resolutionStatusId,
							alert_note: note.trim(),
							alert_tags: tags.trim()
						})}
					disabled={resolutionStatusId === null}
				>
					{getConfirmLabel()}
				</Button>
			</div>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
