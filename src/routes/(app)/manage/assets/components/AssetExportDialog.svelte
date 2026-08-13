<!--
  Export the registry.

  The file is produced server-side, never in the browser: the page only
  ever holds one access-filtered page of rows, and the server-side writer
  is the thing that neutralises spreadsheet formula injection. What the
  operator picks here is the format and whether the current filters apply
  — the row set is always intersected with what they are allowed to see.
-->
<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { toast } from '$lib/components/ui/toast';
	import { ManagedAssetsService } from '$lib/services/managed-assets.service';
	import type { ManagedAssetFilters, TransferFormat } from '$lib/types/resources/managed-asset';

	type Props = {
		open: boolean;
		/** The filters currently applied to the list, or null when none are. */
		filters: ManagedAssetFilters | null;
	};

	let { open = $bindable(false), filters }: Props = $props();

	let format = $state<TransferFormat>('csv');
	let useFilters = $state(true);
	let running = $state(false);

	const hasFilters = $derived(filters !== null && Object.keys(filters).length > 0);

	const submit = async () => {
		running = true;
		try {
			const result = await ManagedAssetsService.exportAssets({
				format,
				filters: useFilters && filters ? filters : undefined
			});

			if (!result.ok) {
				toast({ title: result.error.message, variant: 'destructive' });
				return;
			}

			ManagedAssetsService.saveFile(result.value);
			toast({ title: `Exported ${result.value.filename}`, variant: 'success' });
			open = false;
		} finally {
			running = false;
		}
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title class="text-base font-medium">Export assets</Dialog.Title>
			<Dialog.Description class="text-xs">
				Only assets you have access to are exported.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-4 py-2">
			<div class="flex flex-col gap-1.5">
				<Label for="export-format">Format</Label>
				<select
					id="export-format"
					bind:value={format}
					class="h-9 rounded-md border border-input bg-background px-2 text-sm"
				>
					<option value="csv">CSV</option>
					<option value="json">JSON</option>
				</select>
			</div>

			<label class="flex items-start gap-2 text-sm">
				<input
					type="checkbox"
					bind:checked={useFilters}
					disabled={!hasFilters}
					class="mt-0.5 h-4 w-4 rounded border-input"
				/>
				<span>
					Apply the current filters
					{#if !hasFilters}
						<span class="block text-xs text-muted-foreground">No filters are active.</span>
					{/if}
				</span>
			</label>

			<p class="text-xs text-muted-foreground">
				Sighting counts are not exported — they depend on who is looking, so a file containing them
				would be misleading the moment it is shared.
			</p>
		</div>

		<div class="flex justify-end gap-2">
			<Button variant="outline" onclick={() => (open = false)} disabled={running}>Cancel</Button>
			<Button onclick={submit} disabled={running}>
				{running ? 'Exporting…' : 'Export'}
			</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
