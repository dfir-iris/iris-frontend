<script lang="ts">
	import DOMPurify from 'dompurify';
	import { converter } from './converter';

	let { markdown = '' }: { markdown?: string } = $props();

	const safeHtml = $derived(DOMPurify.sanitize(converter.makeHtml(markdown ?? '')));
</script>

<div class="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1.5 [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h3]:mt-2 [&_h3]:mb-1 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_blockquote]:my-2 [&_pre]:my-2">
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html safeHtml}
</div>
