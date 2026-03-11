<script lang="ts">
	import DOMPurify from 'dompurify';
	import { converter } from './converter';

	let { markdown = '' }: { markdown?: string } = $props();

	const safeHtml = $derived(DOMPurify.sanitize(converter.makeHtml(markdown ?? '')));
</script>

<div class="prose dark:prose-invert max-w-none">
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html safeHtml}
</div>
