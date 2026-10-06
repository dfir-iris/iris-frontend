<!--
  Shown above a case note that mirrors a war-room note. Mirrors are
  read-only (the backend refuses every write path); the banner points
  at the source and offers an editable fork via the regular
  create-note API.
-->
<script lang="ts">
	import { CopyIcon, ExternalLinkIcon, LockIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';

	type Props = {
		warRoomName: string;
		/** War-room source URL; null when the room is unknown. */
		sourceUrl: string | null;
		/** Offer "Make a local copy" (needs write access on the case). */
		canCopy: boolean;
		copying?: boolean;
		onMakeCopy?: () => void;
	};

	let { warRoomName, sourceUrl, canCopy, copying = false, onMakeCopy }: Props = $props();
</script>

<div
	class="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
	role="status"
	data-testid="note-mirror-banner"
>
	<LockIcon class="size-3.5 shrink-0" aria-hidden="true" />
	<span class="min-w-0 flex-1">
		Mirrored from war room
		{#if sourceUrl}
			<a href={sourceUrl} class="inline-flex items-center gap-0.5 font-semibold hover:underline">
				{warRoomName}<ExternalLinkIcon class="size-3" aria-hidden="true" />
			</a>
		{:else}
			<b>{warRoomName}</b>
		{/if}
		— read-only
	</span>
	{#if canCopy}
		<Button
			variant="outline"
			size="xs"
			class="h-7 gap-1 bg-background"
			disabled={copying}
			onclick={() => onMakeCopy?.()}
		>
			<CopyIcon class="size-3" />
			{copying ? 'Copying…' : 'Make a local copy'}
		</Button>
	{/if}
</div>
