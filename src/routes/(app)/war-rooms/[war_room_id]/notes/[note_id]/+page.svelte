<!--
  War-room note detail route. Thin shell around `NoteDetailView` so
  the same panel can eventually be reused from a modal (e.g. mention
  chip preview), matching the pattern used on the case-notes side.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import NoteDetailView from './NoteDetailView.svelte';

	const warRoomId = $derived(Number(page.params.war_room_id));
	const noteId = $derived(Number(page.params.note_id));

	const handleAfterDelete = () => {
		goto(`/war-rooms/${warRoomId}/notes`);
	};
</script>

<svelte:head>
	<title>War room #{warRoomId} - Note #{noteId}</title>
</svelte:head>

{#if Number.isFinite(noteId)}
	<NoteDetailView {warRoomId} {noteId} onAfterDelete={handleAfterDelete} />
{/if}
