<script lang="ts">
	import DOMPurify from 'dompurify';
	import { cn } from '$lib/utils';
	import { converter } from './converter';
	import { authenticateDatastoreImages } from './authenticate-datastore-images';
	import { decorateMentionChips } from './decorate-mention-chips';
	import { normalizeLegacyContent } from './legacy-content';

	// `class` tunes the prose container for a caller whose surroundings
	// disagree with the defaults below — war-room chat, for one, is denser
	// than a note pane and needs the inherited font size back.
	let { markdown = '', class: className = '' }: { markdown?: string; class?: string } = $props();

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

	// Chips the backend wrote (alert links appended by escalate/merge) carry
	// the data attributes but none of the utility classes tiptap bakes in,
	// so they'd render as bare text here. Decorate them post-render, which
	// also makes them visible to any enclosing ChipHoverHost.
	$effect(() => {
		void safeHtml;
		if (!containerEl) return;
		decorateMentionChips(containerEl);
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
	class={cn(
		'prose prose-sm dark:prose-invert min-w-0 max-w-none break-words [&_blockquote]:my-2 [&_h1]:mb-2 [&_h1]:mt-4 [&_h2]:mb-1.5 [&_h2]:mt-3 [&_h3]:mb-1 [&_h3]:mt-2 [&_img]:h-auto [&_img]:max-w-full [&_li]:my-0.5 [&_ol]:my-1.5 [&_p]:my-1.5 [&_pre]:my-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_ul]:my-1.5',
		className
	)}
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html safeHtml}
</div>
