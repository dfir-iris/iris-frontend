<!--
  War-room section tabs. Same visual idiom as the case tab bar:
  underline-style active state with a subtle hover, icon + label, with
  an overflow scroll on small screens so the row never wraps.

  Users arrange the tabs as they wish — drag a tab, or Alt+Shift+←/→ on a
  focused one — and the order is saved in their preferences
  (`war_room_tab_order`), so it follows them across war rooms and browsers.
-->
<script lang="ts">
	import { getContext, tick } from 'svelte';
	import { page } from '$app/state';
	import {
		BoxesIcon,
		ClockIcon,
		GavelIcon,
		LayoutDashboardIcon,
		FileTextIcon,
		FilesIcon,
		ListChecksIcon,
		MessageSquareIcon,
		RotateCcwIcon,
		UserPlusIcon,
		UsersIcon,
		WaypointsIcon
	} from 'lucide-svelte';
	import { USER_CTX, type UserCtx } from '$lib/contexts/user-context.context.svelte';
	import { applyTabOrder, isDefaultTabOrder, moveTab } from '$lib/utils/tab-order';

	type Tab = {
		label: string;
		/** Route segment, also the key saved in the tab order. */
		key: string;
		icon: typeof MessageSquareIcon;
	};

	const tabs: Tab[] = [
		{ label: 'Board', key: 'board', icon: LayoutDashboardIcon },
		{ label: 'Stream', key: 'chat', icon: MessageSquareIcon },
		{ label: 'Scope', key: 'scope', icon: BoxesIcon },
		{ label: 'Decisions', key: 'decisions', icon: GavelIcon },
		{ label: 'Summary', key: 'summary', icon: FileTextIcon },
		{ label: 'Timelines', key: 'timelines', icon: ClockIcon },
		{ label: 'Tasks', key: 'tasks', icon: ListChecksIcon },
		{ label: 'Notes', key: 'notes', icon: FileTextIcon },
		{ label: 'SitReps', key: 'sitreps', icon: FilesIcon },
		{ label: 'Cases', key: 'cases', icon: WaypointsIcon },
		{ label: 'Members', key: 'members', icon: UsersIcon },
		{ label: 'Teams', key: 'teams', icon: UserPlusIcon }
	];

	const userCtx = getContext<UserCtx>(USER_CTX);

	const savedOrder = $derived(userCtx?.ctx?.preferences.war_room_tab_order);
	const orderedTabs = $derived(applyTabOrder(tabs, savedOrder));
	const customized = $derived(!isDefaultTabOrder(tabs, savedOrder));

	const warRoomId = $derived(Number(page.params.war_room_id));

	const isActive = (key: string) => {
		const base = `/war-rooms/${warRoomId}/${key}`;
		return page.url.pathname === base || page.url.pathname.startsWith(`${base}/`);
	};

	const saveOrder = (order: string[]) => {
		void userCtx?.setPreference('war_room_tab_order', order);
	};

	const move = (from: number, to: number) => {
		if (from === to || to < 0 || to >= orderedTabs.length) return;
		saveOrder(moveTab(orderedTabs, from, to));
	};

	let dragIndex = $state<number | null>(null);
	let dropIndex = $state<number | null>(null);

	const onDragStart = (e: DragEvent, index: number) => {
		dragIndex = index;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', orderedTabs[index]?.key ?? '');
		}
	};

	const onDragOver = (e: DragEvent, index: number) => {
		if (dragIndex === null) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dropIndex = index;
	};

	const onDrop = (e: DragEvent, index: number) => {
		e.preventDefault();
		const from = dragIndex;
		dragIndex = null;
		dropIndex = null;
		if (from !== null) move(from, index);
	};

	const onDragEnd = () => {
		dragIndex = null;
		dropIndex = null;
	};

	let nav: HTMLElement | undefined = $state();

	const onKeydown = async (e: KeyboardEvent, index: number) => {
		if (!e.altKey || !e.shiftKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
		e.preventDefault();
		const to = e.key === 'ArrowLeft' ? index - 1 : index + 1;
		const key = orderedTabs[index]?.key;
		move(index, to);
		// The keyed #each moves the element, but keep focus explicit so
		// repeated presses keep walking the same tab.
		await tick();
		nav?.querySelector<HTMLElement>(`[data-tab-key="${key}"]`)?.focus();
	};
</script>

<!-- The underline sits inside the bar (bottom-0, not -bottom-px) and the
     scrollbar is hidden: a 1px vertical overflow used to show a scrollbar.
     Narrow screens still scroll horizontally by swipe / shift+wheel. -->
<nav
	bind:this={nav}
	class="flex items-center gap-0.5 overflow-x-auto overflow-y-hidden border-b bg-background px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
	aria-label="War room sections"
>
	{#each orderedTabs as tab, index (tab.key)}
		{@const active = isActive(tab.key)}
		{@const dropBefore = dropIndex === index && dragIndex !== null && dragIndex > index}
		{@const dropAfter = dropIndex === index && dragIndex !== null && dragIndex < index}
		<a
			href={`/war-rooms/${warRoomId}/${tab.key}`}
			class={[
				'group relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors',
				active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
				dragIndex === index && 'opacity-50'
			]}
			aria-current={active ? 'page' : undefined}
			aria-keyshortcuts="Alt+Shift+ArrowLeft Alt+Shift+ArrowRight"
			title="Drag (or Alt+Shift+←/→) to reorder"
			draggable="true"
			data-tab-key={tab.key}
			ondragstart={(e) => onDragStart(e, index)}
			ondragover={(e) => onDragOver(e, index)}
			ondrop={(e) => onDrop(e, index)}
			ondragend={onDragEnd}
			onkeydown={(e) => onKeydown(e, index)}
		>
			<tab.icon class="h-3.5 w-3.5" />
			{tab.label}
			<span
				class={[
					'absolute inset-x-2 bottom-0 h-0.5 rounded-full transition-colors',
					active ? 'bg-primary' : 'bg-transparent group-hover:bg-border'
				]}
				aria-hidden="true"
			></span>
			{#if dropBefore || dropAfter}
				<span
					class={[
						'absolute inset-y-1.5 w-0.5 rounded-full bg-primary',
						dropBefore ? 'left-0' : 'right-0'
					]}
					aria-hidden="true"
				></span>
			{/if}
		</a>
	{/each}
	{#if customized}
		<button
			type="button"
			class="ml-auto flex shrink-0 items-center rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
			title="Reset tab order"
			aria-label="Reset tab order"
			onclick={() => saveOrder([])}
		>
			<RotateCcwIcon class="h-3.5 w-3.5" />
		</button>
	{/if}
</nav>
