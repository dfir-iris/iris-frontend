<!--
  Saved-filter dropdown for the cases overview page. Mirrors the
  alerts saved-filter UX: pick a preset to apply it, hit the trash
  icon to delete it, hit Save to persist the current filter set as a
  new private / public preset.

  Two routes feed into this component:
    1. The dropdown lists every preset the user can see (their own
       private ones + everyone's public ones).
    2. The save button opens a small inline dialog that asks for a
       name + description + visibility before issuing the create
       call.
-->
<script lang="ts">
	import { BookmarkIcon, ChevronDownIcon, TrashIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuLabel,
		DropdownMenuSeparator,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import * as Dialog from '$lib/components/ui/dialog';
	import type { CasesSavedFilter } from '$lib/services/cases-filters.service';

	type SaveMeta = { name: string; description: string; isPrivate: boolean };

	type Props = {
		presets: CasesSavedFilter[];
		selectedId: string;
		hasActiveFilter: boolean;
		saving?: boolean;
		onSelect: (id: number) => void;
		onClear: () => void;
		onDelete: (id: number) => void;
		onSave: (meta: SaveMeta) => void;
	};

	let {
		presets,
		selectedId,
		hasActiveFilter,
		saving = false,
		onSelect,
		onClear,
		onDelete,
		onSave
	}: Props = $props();

	let saveOpen = $state(false);
	let saveName = $state('');
	let saveDescription = $state('');
	let savePrivate = $state(true);

	const selectedPresetName = $derived(() => {
		const id = Number(selectedId);
		if (!Number.isFinite(id)) return null;
		return presets.find((p) => p.filter_id === id)?.filter_name ?? null;
	});

	const openSave = () => {
		saveName = selectedPresetName() ?? '';
		saveDescription = '';
		savePrivate = true;
		saveOpen = true;
	};

	const submitSave = () => {
		const name = saveName.trim();
		if (!name) return;
		onSave({ name, description: saveDescription.trim(), isPrivate: savePrivate });
		saveOpen = false;
	};
</script>

<div class="flex items-center gap-2">
	<DropdownMenu>
		<DropdownMenuTrigger>
			<Button variant="outline" size="sm" class="gap-1">
				<BookmarkIcon class="size-4" />
				<span class="max-w-[160px] truncate">
					{selectedPresetName() ?? 'Saved filters'}
				</span>
				<ChevronDownIcon class="size-3" />
			</Button>
		</DropdownMenuTrigger>

		<DropdownMenuContent align="start" class="w-72">
			<DropdownMenuLabel class="text-2xs uppercase tracking-wide text-muted-foreground">
				Apply a preset
			</DropdownMenuLabel>

			{#if presets.length === 0}
				<div class="px-2 py-3 text-xs text-muted-foreground">
					No saved filters yet. Build a filter and hit <span class="font-semibold">Save filter</span
					> to keep it.
				</div>
			{:else}
				{#each presets as preset (preset.filter_id)}
					<DropdownMenuItem
						class="flex items-center justify-between gap-2 pr-1"
						onclick={() => onSelect(preset.filter_id)}
					>
						<div class="flex min-w-0 flex-1 flex-col">
							<span class="truncate text-sm">{preset.filter_name}</span>
							<span class="text-2xs text-muted-foreground">
								{preset.filter_is_private ? 'Private' : 'Public'}
								{#if preset.filter_description}· {preset.filter_description}{/if}
							</span>
						</div>
						<button
							type="button"
							class="rounded p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
							aria-label={`Delete ${preset.filter_name}`}
							onclick={(e) => {
								e.stopPropagation();
								onDelete(preset.filter_id);
							}}
						>
							<TrashIcon class="size-3.5" />
						</button>
					</DropdownMenuItem>
				{/each}
			{/if}

			<DropdownMenuSeparator />
			<DropdownMenuItem onclick={onClear} disabled={!selectedId && !hasActiveFilter}>
				Clear filter
			</DropdownMenuItem>
		</DropdownMenuContent>
	</DropdownMenu>

	<Button
		variant="outline"
		size="sm"
		disabled={!hasActiveFilter || saving}
		onclick={openSave}
		title={hasActiveFilter ? 'Save current filter' : 'Build a filter first'}
	>
		{saving ? 'Saving…' : 'Save filter'}
	</Button>
</div>

<Dialog.Root bind:open={saveOpen}>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>Save filter</Dialog.Title>
		</Dialog.Header>

		<div class="flex flex-col gap-3 py-2">
			<div class="flex flex-col gap-1">
				<Label for="saved-filter-name">Name</Label>
				<Input
					id="saved-filter-name"
					bind:value={saveName}
					placeholder="e.g. My open cases this month"
					autofocus
				/>
			</div>

			<div class="flex flex-col gap-1">
				<Label for="saved-filter-description">Description (optional)</Label>
				<Input
					id="saved-filter-description"
					bind:value={saveDescription}
					placeholder="What this filter is for"
				/>
			</div>

			<div class="flex items-center gap-2">
				<input
					id="saved-filter-private"
					type="checkbox"
					bind:checked={savePrivate}
					class="size-4 rounded border-border"
				/>
				<Label for="saved-filter-private" class="cursor-pointer text-sm font-normal">
					Private (only visible to you)
				</Label>
			</div>
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (saveOpen = false)}>Cancel</Button>
			<Button onclick={submitSave} disabled={!saveName.trim()}>Save</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
