<!--
  Inline image renderer for a war-room chat attachment.

  The datastore content endpoint is bearer-authenticated, so a plain
  `<img src="/api/v2/...">` would 401. We fetch through
  `WarRoomDatastoreService.fetchFileBlobUrl` (which attaches the token
  via `Authorization: Bearer`) and swap the resulting object URL onto
  the `<img>`. The blob URL is revoked on unmount and whenever the
  file id changes so we don't leak.
-->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { WarRoomDatastoreService } from '$lib/services/war-room-datastore.service';
	import ChatImageLightbox from './ChatImageLightbox.svelte';

	type Props = {
		warRoomId: number;
		fileId: number;
		filename: string;
	};
	let { warRoomId, fileId, filename }: Props = $props();

	let blobUrl = $state<string | null>(null);
	let failed = $state(false);
	let lightboxOpen = $state(false);

	// Reactively (re)load whenever the (warRoomId, fileId) pair changes.
	// The teardown from the previous load runs first so we don't leak
	// the earlier blob URL.
	let currentUrl: string | null = null;
	$effect(() => {
		const id = fileId;
		const room = warRoomId;
		let cancelled = false;
		(async () => {
			const url = await WarRoomDatastoreService.fetchFileBlobUrl(room, id);
			if (cancelled) {
				if (url) URL.revokeObjectURL(url);
				return;
			}
			if (currentUrl) URL.revokeObjectURL(currentUrl);
			currentUrl = url;
			blobUrl = url;
			failed = url == null;
		})();
		return () => {
			cancelled = true;
			if (currentUrl) {
				URL.revokeObjectURL(currentUrl);
				currentUrl = null;
			}
		};
	});

	onDestroy(() => {
		if (currentUrl) URL.revokeObjectURL(currentUrl);
	});
</script>

{#if blobUrl}
	<!--
	  Thumbnail opens a full-viewport lightbox rather than navigating to
	  the raw datastore URL. That URL is bearer-authenticated, so a
	  browser-level navigation drops the token and 403s. The lightbox
	  reuses the same authenticated blob URL we already have here.
	-->
	<button
		type="button"
		class="block max-w-sm cursor-zoom-in"
		title={`${filename} — click to expand`}
		onclick={() => (lightboxOpen = true)}
	>
		<img
			src={blobUrl}
			alt={filename}
			class="max-h-64 max-w-full rounded-md border object-contain"
		/>
	</button>
	<ChatImageLightbox
		open={lightboxOpen}
		{warRoomId}
		{fileId}
		{filename}
		onOpenChange={(v) => (lightboxOpen = v)}
	/>
{:else if failed}
	<span class="text-xs text-muted-foreground">
		{filename} (could not load)
	</span>
{:else}
	<div
		class="h-32 w-48 animate-pulse rounded-md border bg-muted/60"
		aria-label={`Loading ${filename}`}
	></div>
{/if}
