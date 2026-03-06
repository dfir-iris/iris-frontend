<script lang="ts">
	import { onMount } from 'svelte';
	import {
		AlertResolutionService,
		type AlertResolution
	} from '$lib/services/alert-resolutions.service';
	import type { RequestResponse } from '$lib/services/api.service';
	import type { UpdateAlertBody } from '$lib/services/alerts.service';
	import * as Dialog from '$lib/components/ui/dialog';
	import Button from '$lib/components/ui/button/button.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import Label from '$lib/components/ui/label/label.svelte';
	import Textarea from '$lib/components/ui/textarea/textarea.svelte';

	type Props = {
		open: boolean;
		selectedAlertIds: number[];
		onConfirm: (payload: UpdateAlertBody) => void;
	};

	let { open = $bindable(), selectedAlertIds, onConfirm }: Props = $props();

	let alertResolutions = $state<AlertResolution[]>([]);
	let resolutionStatusId = $state<number | null>(null);
	let note = $state('');
	let tags = $state('');

	const getTitle = () => `Close ${selectedAlertIds.length > 1 ? 'multiple alerts' : 'alert'}`;

	const getConfirmLabel = () => `Close alert${selectedAlertIds.length > 1 ? 's' : ''}`;

	const resetForm = () => {
		resolutionStatusId =
			alertResolutions.length > 0 ? alertResolutions[0].resolution_status_id : null;
		note = '';
		tags = '';
	};

	$effect(() => {
		if (open) {
			resetForm();
		}
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

				<div class="flex flex-wrap">
					{#each alertResolutions as resolution}
						<button
							type="button"
							class={`border px-4 py-2 text-sm first:rounded-l last:rounded-r ${
								resolutionStatusId === resolution.resolution_status_id
									? 'border-primary bg-accent text-foreground'
									: 'border-input bg-background text-muted-foreground hover:bg-accent'
							}`}
							onclick={() => (resolutionStatusId = resolution.resolution_status_id)}
						>
							{resolution.resolution_status_name}
						</button>
					{/each}
				</div>
			</div>

			<div class="flex flex-col gap-2">
				<Label for="close-alert-note" class="text-sm font-medium">Note</Label>

				<Textarea id="close-alert-note" bind:value={note} class="min-h-24 resize-none" />
			</div>

			<div class="flex flex-col gap-2">
				<Label for="close-alert-tags" class="text-sm font-medium">Tags</Label>

				<Input id="close-alert-tags" bind:value={tags} />
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
