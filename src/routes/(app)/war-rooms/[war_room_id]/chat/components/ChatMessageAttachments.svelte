<!--
  File attachments (inline uploads) hanging off a chat message. Images
  render inline, everything else as a download chip.

  Split out of <ChatMessageBody> so the inline editor can keep the
  attachments on screen while the operator rewrites the text — editing
  a message never touches its uploads, so hiding them would misreport
  what the message actually contains.
-->
<script lang="ts">
	import { DownloadIcon, FileIcon } from 'lucide-svelte';
	import { WarRoomDatastoreService } from '$lib/services/war-room-datastore.service';
	import type { ChatAttachment } from '$lib/services/war-room-chat.service';
	import ChatImageAttachment from './ChatImageAttachment.svelte';

	type Props = {
		attachments?: ChatAttachment[] | null;
		warRoomId?: number;
	};
	let { attachments, warRoomId }: Props = $props();

	const humanBytes = (n: number): string => {
		if (n < 1024) return `${n} B`;
		if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
		if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
		return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
	};

	const isImage = (mime: string | null | undefined): boolean =>
		typeof mime === 'string' && mime.toLowerCase().startsWith('image/');
</script>

{#if attachments && attachments.length > 0 && warRoomId != null}
	<div class="mt-1.5 flex flex-col gap-1.5">
		{#each attachments as att (att.file_id)}
			{#if isImage(att.mime_type)}
				<ChatImageAttachment {warRoomId} fileId={att.file_id} filename={att.filename} />
			{:else}
				<a
					href={WarRoomDatastoreService.downloadUrl(warRoomId, att.file_id)}
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex max-w-[24rem] items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5 text-xs no-underline hover:bg-muted"
				>
					<FileIcon class="h-4 w-4 shrink-0 text-muted-foreground" />
					<span class="flex min-w-0 flex-col">
						<span class="truncate font-medium">{att.filename}</span>
						<span class="text-2xs text-muted-foreground">
							{humanBytes(att.size_bytes)}
							{att.mime_type ? ` · ${att.mime_type}` : ''}
						</span>
					</span>
					<DownloadIcon class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
				</a>
			{/if}
		{/each}
	</div>
{/if}
