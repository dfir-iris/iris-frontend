<!--
  One-line summary under the war-room note header: which cases this
  note is published to (directly, or through an ancestor folder share)
  and whether every live mirror is in sync. Clicking "Manage" opens
  the shared dialog owned by the notes layout.
-->
<script lang="ts">
	import { RefreshCwIcon, Share2Icon } from 'lucide-svelte';
	import type { NoteShare } from '$lib/services/war-room-note-shares.service';

	type Props = {
		direct: NoteShare[];
		/** Shares inherited from an ancestor folder (name for the hint). */
		viaFolder: { share: NoteShare; folderName: string }[];
		onManage?: () => void;
	};

	let { direct, viaFolder, onManage }: Props = $props();

	const all = $derived([...direct, ...viaFolder.map((v) => v.share)]);
	const caseCount = $derived(new Set(all.flatMap((s) => s.targets.map((t) => t.case_id))).size);
	const pending = $derived(
		all.some(
			(s) =>
				s.delivery === 'mirror' &&
				s.targets.some((t) => t.status === 'pending' || t.status === 'error')
		)
	);
	const hasMirror = $derived(all.some((s) => s.delivery === 'mirror'));
	const folderNames = $derived([...new Set(viaFolder.map((v) => v.folderName))]);
</script>

{#if all.length > 0}
	<div
		class="mt-3 flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5 text-xs"
		data-testid="note-share-strip"
	>
		<Share2Icon class="size-3.5 text-primary" aria-hidden="true" />
		<span>
			Shared with <b>{caseCount} case{caseCount === 1 ? '' : 's'}</b>
			{#if hasMirror}· live mirror{/if}
			{#if folderNames.length > 0}
				<span class="text-muted-foreground">· via folder {folderNames.join(', ')}</span>
			{/if}
		</span>
		{#if hasMirror}
			{#if pending}
				<span class="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
					<RefreshCwIcon class="size-3" aria-hidden="true" />sync pending
				</span>
			{:else}
				<span class="text-emerald-700 dark:text-emerald-400">in sync</span>
			{/if}
		{/if}
		{#if onManage}
			<button
				type="button"
				class="ml-auto font-medium text-primary hover:underline"
				onclick={onManage}
			>
				Manage
			</button>
		{/if}
	</div>
{/if}
