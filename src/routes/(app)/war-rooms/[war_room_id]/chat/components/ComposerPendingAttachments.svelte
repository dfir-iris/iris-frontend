<!--
  Chip row for files queued on a chat composer (dropped or pasted),
  shown above the input until the message is sent. Images get a small
  thumbnail so a pasted screenshot can be checked before it goes out.
-->
<script lang="ts">
	import { Paperclip, X } from 'lucide-svelte';
	import { humanBytes, type ComposerAttachments } from './composer-attachments.svelte';

	type Props = { attachments: ComposerAttachments };
	let { attachments }: Props = $props();
</script>

{#if attachments.pending.length > 0}
	<div class="mb-2 flex flex-wrap gap-1.5 px-1">
		{#each attachments.pending as p (p.id)}
			<div class="flex items-center gap-1.5 rounded border bg-muted/50 px-2 py-1 text-2xs">
				{#if p.previewUrl}
					<img src={p.previewUrl} alt={p.file.name} class="h-8 w-8 rounded object-cover" />
				{:else}
					<Paperclip class="h-3 w-3 text-muted-foreground" />
				{/if}
				<span class="max-w-[16rem] truncate">{p.file.name}</span>
				<span class="text-muted-foreground">
					{humanBytes(p.file.size)}
				</span>
				<button
					type="button"
					class="text-muted-foreground hover:text-destructive"
					onclick={() => attachments.remove(p.id)}
					aria-label="Remove attachment"
				>
					<X class="h-3 w-3" />
				</button>
			</div>
		{/each}
	</div>
{/if}
