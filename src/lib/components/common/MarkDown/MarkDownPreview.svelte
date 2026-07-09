<script lang="ts">
	import DOMPurify from 'dompurify';
	import { converter } from './converter';
	import { authenticateDatastoreImages } from './authenticate-datastore-images';
	import { normalizeLegacyContent } from './legacy-content';

	let { markdown = '' }: { markdown?: string } = $props();

	const safeHtml = $derived(
		DOMPurify.sanitize(converter.makeHtml(normalizeLegacyContent(markdown ?? '')))
	);

	let containerEl = $state<HTMLDivElement | null>(null);

	// Datastore-embedded images render as `<img src="/api/v2/.../files/N">`
	// which the browser fetches with no Authorization header → 401. Sweep
	// the container every time the rendered HTML changes and swap each
	// datastore image to a bearer-authenticated blob URL.
	$effect(() => {
		void safeHtml; // re-run on every render
		if (!containerEl) return;
		const dispose = authenticateDatastoreImages(containerEl);
		return dispose;
	});
</script>

<!--
  Containment for content wider than the available container. Without
  these:
    • pasted images at native size overflow and get clipped by an
      ancestor's `overflow:hidden`;
    • long code blocks push the panel horizontally;
    • unbreakable URLs / hashes do the same.
  `break-words` + `[&_pre]:overflow-x-auto` + `[&_img]:max-w-full` cover
  all three. `min-w-0` makes the prose container honour its flex/grid
  share instead of resolving to intrinsic content width.
-->
<div
	bind:this={containerEl}
	class="prose prose-sm dark:prose-invert max-w-none min-w-0 break-words [&_p]:my-1.5 [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h3]:mt-2 [&_h3]:mb-1 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_blockquote]:my-2 [&_pre]:my-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_img]:max-w-full [&_img]:h-auto"
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html safeHtml}
</div>
