<script lang="ts">
	import { getContext } from 'svelte';
	import { CoffeeIcon } from 'lucide-svelte';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import NotesNewFolderDialog from './components/notes-new-folder-dialog.svelte';
	import {
		WAR_ROOM_NOTES_CTX,
		type WarRoomNotesContext
	} from '$lib/contexts/war-room-notes.context.svelte';

	const notes = getContext<WarRoomNotesContext>(WAR_ROOM_NOTES_CTX);

	let showNewFolder = $state<boolean>(false);

	const newFolder = async (name: string) => {
		await notes.createFolder({ name });
		notes.loadTree();
		showNewFolder = false;
	};
</script>

<svelte:head>
	<title>War room #{page.params.war_room_id} - Notes</title>
</svelte:head>

<div class="flex h-full w-full flex-col items-center gap-2 bg-white pt-8 text-lg dark:bg-black/80">
	<p class="flex gap-2">It looks pretty empty <CoffeeIcon /></p>

	<Button variant="link" size="lg" onclick={() => (showNewFolder = true)}>
		<p class="text-lg">Select a note on the left pane or click here to add a folder</p>
	</Button>

	<p>Right-click on a folder to add a note</p>
</div>

<NotesNewFolderDialog
	bind:open={showNewFolder}
	onSubmit={(name) => newFolder(name)}
	onCancel={() => (showNewFolder = false)}
/>
