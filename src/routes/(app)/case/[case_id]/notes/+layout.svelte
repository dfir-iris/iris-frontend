<script lang="ts">
	import { setContext, type Snippet } from 'svelte';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { FilePlusIcon, FolderPlusIcon } from 'lucide-svelte';
	import {
		CASE_NOTES_CTX,
		createCaseNotesContext,
		type CaseNotesContext
	} from '$lib/contexts/case-notes.context.svelte';
	import NotesTree from './notes-tree.svelte';

	let { children }: { children: Snippet } = $props();

	const notes = createCaseNotesContext(() => Number(page.params.case_id));

	setContext<CaseNotesContext>(CASE_NOTES_CTX, notes);

	$effect(() => {
		const caseId = Number(page.params.case_id);

		if (!Number.isFinite(caseId)) {
			notes.reset();
			return;
		}

		void notes.loadTree();

		return () => notes.reset();
	});
</script>

<div class="flex h-full w-full flex-row overflow-hidden">
	<div class="flex h-full min-h-0 w-1/4 max-w-[250px] flex-col border-r bg-background/60">
		<div class="flex flex-row items-center gap-2 px-4 pb-2 pt-4">
			<h2 class="w-full">Notes</h2>

			<Button variant="ghost" size="icon" aria-label="Add folder">
				<FolderPlusIcon size={18} class="!stroke-[1.75]" />
			</Button>

			<Button variant="ghost" size="icon" aria-label="Add note">
				<FilePlusIcon size={18} class="!stroke-[1.75]" />
			</Button>
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto pb-4">
			{#if notes.list.status === 'loading' && notes.list.tree.length === 0}
				<div class="space-y-2 px-4">
					<Skeleton class="h-8 w-full" />
					<Skeleton class="h-8 w-full" />
					<Skeleton class="h-8 w-full" />
				</div>
			{:else if notes.list.error}
				<div class="px-4 py-2 text-sm text-destructive">
					{notes.list.error}
				</div>
			{:else}
				{#each notes.list.tree as folder (folder.id)}
					<NotesTree {folder} />
				{/each}
			{/if}
		</div>
	</div>

	<div class="h-full w-full overflow-hidden p-8">
		<div class="flex h-full w-full flex-col rounded border bg-background shadow">
			{@render children()}
		</div>
	</div>
</div>
