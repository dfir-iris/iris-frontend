<!--
  Context menu opened at a viewport position (canvas / node / edge right
  click). Arrow keys move, Enter activates, Escape or a click outside closes.
-->
<script lang="ts" module>
	import type { Component } from 'svelte';
	import type { Icon } from 'lucide-svelte';

	export type MenuEntry =
		| {
				type?: 'item';
				label: string;
				icon?: Component<{ class?: string }> | typeof Icon;
				shortcut?: string;
				disabled?: boolean;
				danger?: boolean;
				hint?: string;
				onSelect: () => void;
		  }
		| { type: 'separator' }
		| { type: 'label'; label: string };
</script>

<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { clampToViewport } from '../lib/canvas';

	interface Props {
		x: number;
		y: number;
		items: MenuEntry[];
		title?: string;
		onClose: () => void;
	}

	let { x, y, items, title, onClose }: Props = $props();

	let menu = $state<HTMLDivElement | null>(null);
	let pos = $state({ x: 0, y: 0 });

	$effect.pre(() => {
		pos = { x, y };
	});

	const buttons = () =>
		menu
			? [...menu.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not([disabled])')]
			: [];

	onMount(() => {
		void tick().then(() => {
			if (!menu) return;
			const r = menu.getBoundingClientRect();
			pos = clampToViewport({ x, y }, r.width, r.height, {
				width: window.innerWidth,
				height: window.innerHeight
			});
			buttons()[0]?.focus();
		});
		const onDown = (e: PointerEvent) => {
			if (menu && !menu.contains(e.target as Node)) onClose();
		};
		const onBlur = () => onClose();
		window.addEventListener('pointerdown', onDown, true);
		window.addEventListener('blur', onBlur);
		return () => {
			window.removeEventListener('pointerdown', onDown, true);
			window.removeEventListener('blur', onBlur);
		};
	});

	const onKeydown = (e: KeyboardEvent) => {
		const list = buttons();
		const i = list.indexOf(document.activeElement as HTMLButtonElement);
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			onClose();
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			list[(i + 1) % list.length]?.focus();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			list[(i - 1 + list.length) % list.length]?.focus();
		} else if (e.key === 'Home') {
			e.preventDefault();
			list[0]?.focus();
		} else if (e.key === 'End') {
			e.preventDefault();
			list.at(-1)?.focus();
		}
	};

	const select = (entry: Extract<MenuEntry, { onSelect: () => void }>) => {
		onClose();
		entry.onSelect();
	};
</script>

<div
	bind:this={menu}
	role="menu"
	tabindex="-1"
	aria-label={title ?? 'Graph menu'}
	class="fixed z-50 min-w-52 max-w-72 rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-lg"
	style:left="{pos.x}px"
	style:top="{pos.y}px"
	onkeydown={onKeydown}
	oncontextmenu={(e) => e.preventDefault()}
>
	{#if title}
		<div class="truncate px-2 py-1.5 text-xs font-semibold text-muted-foreground" {title}>
			{title}
		</div>
		<div class="-mx-1 my-1 h-px bg-border"></div>
	{/if}
	{#each items as entry, i (i)}
		{#if entry.type === 'separator'}
			<div class="-mx-1 my-1 h-px bg-border" role="separator"></div>
		{:else if entry.type === 'label'}
			<div class="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
				{entry.label}
			</div>
		{:else}
			<button
				type="button"
				role="menuitem"
				disabled={entry.disabled}
				title={entry.hint}
				class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left outline-none hover:bg-accent focus-visible:bg-accent disabled:pointer-events-none disabled:opacity-50 {entry.danger
					? 'text-destructive'
					: ''}"
				onclick={() => select(entry)}
			>
				{#if entry.icon}
					<entry.icon class="h-4 w-4 shrink-0 opacity-80" />
				{:else}
					<span class="w-4 shrink-0"></span>
				{/if}
				<span class="flex-1 truncate">{entry.label}</span>
				{#if entry.shortcut}
					<kbd class="ml-2 text-[10px] tracking-widest text-muted-foreground">{entry.shortcut}</kbd>
				{/if}
			</button>
		{/if}
	{/each}
</div>
