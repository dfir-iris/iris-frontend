<!--
  Shared list-row primitive for the case sidebars (assets, IOCs, tasks,
  evidence).

  One row is three lines at most:
    1. identity  — icon (or state dot), title, right-aligned badges
    2. meta      — dot-separated facts: type, IP, domain, dates, description…
    3. tags      — the object's tags, never truncated away

  Every fact the analyst triages on stays on screen; what the old per-object
  cards spent height on was the packaging around those facts — a 28px avatar
  circle, boxed IP/domain chips, a padded description block and an 8px gap
  between cards. Rows here are separated by a hairline instead, like a mail
  client, so a full triage payload costs ~60px instead of ~110px.

  Meta items must each be a *single* element (a <span>, a badge, …) — the
  bullet separator is drawn with ::before on every child but the first.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ServerIcon } from 'lucide-svelte';
	import { cn } from '$lib/utils';
	import type { TagInput } from '$lib/types/resources/tag';
	import { normalizeTags } from '$lib/utils/tags';
	import TagDisplay from '$lib/components/common/tag/TagDisplay.svelte';

	type IconComponent = typeof ServerIcon;

	type Props = {
		title: string;
		/** Leading glyph. Falls back to a neutral state dot when omitted. */
		Icon?: IconComponent | null;
		/** Render the title in monospace — IOC values, hashes, filenames. */
		mono?: boolean;
		isSelected?: boolean;
		/**
		 * Left-edge accent for state that must be readable without reading:
		 * 'danger' for a compromised asset, 'warning' for a task assigned to
		 * the current user. Selection always wins over both.
		 */
		accent?: 'none' | 'danger' | 'warning';
		tags?: TagInput;
		/** Right-aligned status badges on the identity line. */
		badges?: Snippet;
		/** Inline elements appended right after the title (copy button, pivots). */
		titleSuffix?: Snippet;
		/** Dot-separated secondary facts. One element per item. */
		meta?: Snippet;
		id?: string;
		class?: string;
	};

	let {
		title,
		Icon = null,
		mono = false,
		isSelected = false,
		accent = 'none',
		tags,
		badges,
		titleSuffix,
		meta,
		id,
		class: className
	}: Props = $props();

	const hasTags = $derived(normalizeTags(tags ?? []).length > 0);
</script>

<div
	{id}
	class={cn(
		'group relative w-full border-b border-l-[3px] border-b-border/50 border-l-transparent px-2.5 py-1.5 text-left transition-colors',
		isSelected
			? 'border-l-primary bg-accent text-foreground'
			: cn(
					'hover:bg-muted/40',
					accent === 'danger' && 'border-l-destructive/70',
					accent === 'warning' && 'border-l-amber-500'
				),
		className
	)}
>
	<div class="flex min-w-0 items-center gap-1.5">
		{#if Icon}
			<Icon
				class={cn(
					'h-3.5 w-3.5 shrink-0',
					accent === 'danger'
						? 'text-destructive'
						: accent === 'warning'
							? 'text-amber-600 dark:text-amber-400'
							: isSelected
								? 'text-primary'
								: 'text-muted-foreground'
				)}
			/>
		{:else}
			<span
				class={cn(
					'h-1.5 w-1.5 shrink-0 rounded-full',
					accent === 'danger'
						? 'bg-destructive'
						: accent === 'warning'
							? 'bg-amber-500'
							: isSelected
								? 'bg-primary'
								: 'bg-muted-foreground/40'
				)}
			></span>
		{/if}

		<span
			class={cn('truncate font-semibold leading-tight', mono ? 'font-mono text-xs' : 'text-sm')}
			{title}
		>
			{title}
		</span>

		{@render titleSuffix?.()}

		{#if badges}
			<span class="ml-auto flex shrink-0 items-center gap-1">
				{@render badges()}
			</span>
		{/if}
	</div>

	{#if meta}
		<div
			class="meta flex flex-wrap items-center gap-x-1.5 pl-5 text-xs leading-snug text-muted-foreground"
		>
			{@render meta()}
		</div>
	{/if}

	{#if hasTags}
		<div class="pl-5 pt-0.5">
			<TagDisplay tags={tags ?? []} size="xs" />
		</div>
	{/if}
</div>

<style>
	/*
	  Bullet separators are drawn rather than authored so callers can emit a
	  variable number of meta items without threading separator logic — and
	  so an item that renders nothing still doesn't leave a dangling bullet.
	  :global() is required: snippet content belongs to the caller's scope.
	*/
	.meta > :global(*:not(:first-child))::before {
		content: '•';
		margin-right: 0.375rem;
		opacity: 0.45;
	}
</style>
