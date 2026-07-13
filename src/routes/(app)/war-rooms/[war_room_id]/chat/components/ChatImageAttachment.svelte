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

	type Props = {
		warRoomId: number;
		fileId: number;
		filename: string;
	};
	let { warRoomId, fileId, filename }: Props = $props();

	let blobUrl = $state<string | null>(null);
	let failed = $state(false);

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
	<a
		href={WarRoomDatastoreService.downloadUrl(warRoomId, fileId)}
		target="_blank"
		rel="noopener noreferrer"
		class="block max-w-sm"
		title={`${filename} — open in a new tab`}
	>
		<img
			src={blobUrl}
			alt={filename}
			class="max-h-64 max-w-full rounded-md border object-contain"
		/>
	</a>
{:else if failed}
	<a
		href={WarRoomDatastoreService.downloadUrl(warRoomId, fileId)}
		target="_blank"
		rel="noopener noreferrer"
		class="text-xs text-muted-foreground underline underline-offset-2"
	>
		{filename}
	</a>
{:else}
	<div
		class="h-32 w-48 animate-pulse rounded-md border bg-muted/60"
		aria-label={`Loading ${filename}`}
	></div>
{/if}
