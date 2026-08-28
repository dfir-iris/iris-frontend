<!--
  Wraps the substring(s) of `text` that case-insensitively match `query`
  in a <mark> element. Used by the timeline quick-search to make matching
  words pop on the cards. Falls back to plain text when there is no query.
-->
<script lang="ts">
	let {
		text,
		query,
		class: className = ''
	}: {
		text: string | null | undefined;
		query: string;
		class?: string;
	} = $props();

	const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

	const segments = $derived.by<Array<{ text: string; match: boolean }>>(() => {
		const t = text ?? '';
		const q = query.trim();
		if (!t || !q) return [{ text: t, match: false }];

		const re = new RegExp(`(${escapeRegExp(q)})`, 'gi');
		const parts = t.split(re);
		return parts.map((part, i) => ({ text: part, match: i % 2 === 1 }));
	});
</script>

<span class={className}>
	{#each segments as seg, i (i)}
		{#if seg.match}
			<mark
				class="rounded-sm bg-yellow-300/60 px-0.5 text-foreground dark:bg-yellow-400/40 dark:text-yellow-50"
				>{seg.text}</mark
			>
		{:else}
			{seg.text}
		{/if}
	{/each}
</span>
