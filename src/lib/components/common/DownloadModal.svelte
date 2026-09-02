<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import { Label } from '$lib/components/ui/label';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { RefreshCwIcon } from 'lucide-svelte';

	export interface ModalColumn {
		key: string;
		header: string;
		defaultSelected?: boolean;
	}

	type DownloadModalProps = {
		open: boolean;
		title?: string;
		itemNounPlural?: string;
		availableColumns: ModalColumn[];
		countVisible: number;
		countAll: number;
		isProcessing?: boolean;
		processingMessage?: string;
		onConfirm: (downloadType: 'visible' | 'all', selectedColumnKeys: Set<string>) => void;
		onOpenChange: (open: boolean) => void;
	};

	let {
		open,
		title = 'Download Options',
		itemNounPlural = 'items',
		availableColumns,
		countVisible,
		countAll,
		isProcessing = false,
		processingMessage = 'Processing...',
		onConfirm,
		onOpenChange
	}: DownloadModalProps = $props();

	let selectedDownloadType = $state<'visible' | 'all'>('visible');
	let selectedColumnKeys = $state<Set<string>>(new Set<string>());

	function toggleExportColumn(key: string, newCheckedState: boolean) {
		if (newCheckedState) {
			selectedColumnKeys.add(key);
		} else {
			selectedColumnKeys.delete(key);
		}
		selectedColumnKeys = new Set(selectedColumnKeys); // Trigger reactivity
	}

	function handleConfirm() {
		if (selectedColumnKeys.size === 0) {
			// Optionally, show a toast or inline message here
			console.warn('No columns selected for download.');
			return;
		}
		onConfirm(selectedDownloadType, new Set(selectedColumnKeys));
	}

	// Effect to reset selections when modal reopens, if desired, or based on props
	$effect(() => {
		if (open) {
			// Reset to defaults or last state based on preference.
			// For now, re-initialize based on defaultSelected.
			selectedColumnKeys = new Set(
				availableColumns.filter((c) => c.defaultSelected).map((c) => c.key)
			);
			selectedDownloadType = 'visible'; // Default to visible
		}
	});
</script>

<Dialog.Root bind:open {onOpenChange}>
	<Dialog.Content class="sm:max-w-[525px]">
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
			<Dialog.Description>
				Select what you want to download and which columns to include.
			</Dialog.Description>
		</Dialog.Header>

		{#if isProcessing}
			<div class="flex flex-col items-center justify-center gap-2 p-8">
				<RefreshCwIcon class="h-8 w-8 animate-spin text-primary" />
				<p class="text-muted-foreground">{processingMessage}</p>
			</div>
		{:else}
			<div class="grid gap-4 py-4">
				<div class="flex flex-col gap-2">
					<Label class="font-semibold">Download Scope</Label>
					<RadioGroup.Root bind:value={selectedDownloadType} class="flex flex-col gap-2">
						<div class="flex items-center space-x-2">
							<RadioGroup.Item value="visible" id="r-visible" />
							<Label for="r-visible">
								Visible {itemNounPlural} ({countVisible})
							</Label>
						</div>
						<div class="flex items-center space-x-2">
							<RadioGroup.Item value="all" id="r-all" />
							<Label for="r-all">
								All matching {itemNounPlural} ({countAll})
							</Label>
						</div>
					</RadioGroup.Root>
				</div>

				<div class="flex flex-col gap-2">
					<Label class="font-semibold">Columns to Export</Label>
					<div class="max-h-60 overflow-y-auto rounded-md border p-2">
						{#each availableColumns as column (column.key)}
							<div class="flex items-center space-x-2 rounded p-1 hover:bg-muted/50">
								<Checkbox
									id={`col-${column.key}`}
									checked={selectedColumnKeys.has(column.key)}
									onCheckedChange={(isChecked) => {
										if (typeof isChecked === 'boolean') {
											toggleExportColumn(column.key, isChecked);
										}
									}}
								/>
								<Label for={`col-${column.key}`} class="w-full cursor-pointer text-sm font-normal">
									{column.header}
								</Label>
							</div>
						{/each}
					</div>
					{#if selectedColumnKeys.size === 0}
						<p class="text-xs text-destructive">Please select at least one column.</p>
					{/if}
				</div>
			</div>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => onOpenChange(false)}>Cancel</Button>
				<Button onclick={handleConfirm} disabled={selectedColumnKeys.size === 0 || isProcessing}>
					{#if isProcessing}
						<RefreshCwIcon class="mr-2 h-4 w-4 animate-spin" />
					{/if}
					Download
				</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
