<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { FilePlus, FilePlusIcon, FolderPlusIcon } from 'lucide-svelte';
	import type { PageData } from './$types';
	import NotesTree from './notes-tree.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { Snippet } from 'svelte';

	let { data, children }: { data: PageData; children: Snippet } = $props();
</script>

<div class="flex h-full w-full flex-row overflow-hidden">
	<!-- Sidebar with folders -->
	<div class="h-full w-1/4 max-w-[250px] border-r bg-background/60">
		<div class="flex flex-row items-center px-4 pb-2 pt-4">
			<h2 class="w-full">Notes</h2>

			<Button variant="ghost" size="sm">
				<FilePlusIcon size={18} class="!stroke-[1.75]" />
				Add note
			</Button>
		</div>
		{#await data}
			<Skeleton></Skeleton>
		{:then { notes }}
			{#each notes.data.results as folder}
				<NotesTree name={folder.name} folders={folder.subdirectories} notes={folder.notes} />
			{/each}
			<Button variant="link" size="sm" class="w-full justify-start !px-4 text-muted-foreground"
				>Add folder</Button
			>
		{/await}
	</div>

	<!-- Note content -->
	<div class="h-full w-full overflow-hidden p-8">
		<div class="flex h-full w-full flex-col rounded border bg-background shadow">
			{@render children()}
		</div>
	</div>
</div>
