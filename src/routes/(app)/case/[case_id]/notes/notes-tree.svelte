<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import type { Note, NoteFolder } from '$lib/types/resources/note';
	import { FolderIcon, FolderOpenIcon } from 'lucide-svelte';
	import Self from './notes-tree.svelte';
	import { page } from '$app/state';

	let {
		name,
		folders = [],
		notes = []
	}: {
		name: string;
		folders: NoteFolder[];
		notes: Note[];
	} = $props();

	/** if this folder is open */
	let open = $state(false);
</script>

<Button
	on:click={() => {
		open = !open;
	}}
	variant={open ? 'default' : 'ghost'}
	class="w-full justify-start gap-x-1.5 rounded-none"
>
	{@const Icon = open ? FolderOpenIcon : FolderIcon}
	<Icon size={22} />
	<span>{name}</span>
</Button>
{#if open}
	<div class="border-b pb-4 pl-2">
		{#each folders as folder}
			<Self name={folder.name} folders={folder.subdirectories} notes={folder.notes}></Self>
		{/each}
		{#each notes as note}
			<Button
				variant="ghost"
				class="w-full justify-start !text-sm"
				href="/case/{page.params.case_id}/notes/{note.id}"
			>
				{note.title}
			</Button>
		{/each}
	</div>
{/if}
