<!--
  In-body reference to a war-room datastore file, inserted by the `#`
  picker in the composer. Images render inline through the bearer-
  authenticated loader; everything else becomes a download chip.

  Mounted imperatively by <ChatMessageBody> into a placeholder inside the
  rendered markdown, so it takes plain props rather than reading context.
-->
<script lang="ts">
	import { DownloadIcon, FileIcon } from 'lucide-svelte';
	import { WarRoomDatastoreService } from '$lib/services/war-room-datastore.service';
	import ChatImageAttachment from './ChatImageAttachment.svelte';

	type Props = {
		isImage: boolean;
		label: string;
		warRoomId: number;
		fileId: number;
	};

	let { isImage, label, warRoomId, fileId }: Props = $props();
</script>

{#if isImage}
	<span class="my-1 block">
		<ChatImageAttachment {warRoomId} {fileId} filename={label} />
	</span>
{:else}
	<a
		href={WarRoomDatastoreService.downloadUrl(warRoomId, fileId)}
		target="_blank"
		rel="noopener noreferrer"
		class="mx-0.5 inline-flex max-w-[24rem] items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 align-middle text-2xs font-medium text-amber-700 no-underline transition-colors hover:brightness-110 dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-200"
		title={`Datastore file: ${label}`}
	>
		<FileIcon class="h-3 w-3 shrink-0" />
		<span class="truncate">{label}</span>
		<DownloadIcon class="h-2.5 w-2.5 shrink-0 opacity-60" />
	</a>
{/if}
