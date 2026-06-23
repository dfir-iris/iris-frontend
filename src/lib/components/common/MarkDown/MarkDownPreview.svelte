<script lang="ts">
	import DOMPurify from 'dompurify';
	import { converter } from './converter';
	import { authenticateDatastoreImages } from './authenticate-datastore-images';

	let { markdown = '' }: { markdown?: string } = $props();

	const safeHtml = $derived(DOMPurify.sanitize(converter.makeHtml(markdown ?? '')));

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

<div
	bind:this={containerEl}
	class="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1.5 [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h3]:mt-2 [&_h3]:mb-1 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_blockquote]:my-2 [&_pre]:my-2"
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html safeHtml}
</div>
