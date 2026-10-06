<!--
  War-room section tabs. Same visual idiom as the case tab bar:
  underline-style active state with a subtle hover, icon + label, with
  an overflow scroll on small screens so the row never wraps.
-->
<script lang="ts">
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
		UserPlusIcon,
		UsersIcon,
		WaypointsIcon
	} from 'lucide-svelte';

	type Tab = {
		label: string;
		path: string;
		icon: typeof MessageSquareIcon;
	};

	const tabs: Tab[] = [
		{ label: 'Board', path: 'board', icon: LayoutDashboardIcon },
		{ label: 'Stream', path: 'chat', icon: MessageSquareIcon },
		{ label: 'Scope', path: 'scope', icon: BoxesIcon },
		{ label: 'Decisions', path: 'decisions', icon: GavelIcon },
		{ label: 'Summary', path: 'summary', icon: FileTextIcon },
		{ label: 'Timelines', path: 'timelines', icon: ClockIcon },
		{ label: 'Tasks', path: 'tasks', icon: ListChecksIcon },
		{ label: 'Notes', path: 'notes', icon: FileTextIcon },
		{ label: 'SitReps', path: 'sitreps', icon: FilesIcon },
		{ label: 'Cases', path: 'cases', icon: WaypointsIcon },
		{ label: 'Members', path: 'members', icon: UsersIcon },
		{ label: 'Teams', path: 'teams', icon: UserPlusIcon }
	];

	const warRoomId = $derived(Number(page.params.war_room_id));

	const isActive = (path: string) => {
		const base = `/war-rooms/${warRoomId}/${path}`;
		return page.url.pathname === base || page.url.pathname.startsWith(`${base}/`);
	};
</script>

<!-- The underline sits inside the bar (bottom-0, not -bottom-px) and the
     scrollbar is hidden: a 1px vertical overflow used to show a scrollbar.
     Narrow screens still scroll horizontally by swipe / shift+wheel. -->
<nav
	class="flex items-center gap-0.5 overflow-x-auto overflow-y-hidden border-b bg-background px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
	aria-label="War room sections"
>
	{#each tabs as tab (tab.path)}
		{@const active = isActive(tab.path)}
		<a
			href={`/war-rooms/${warRoomId}/${tab.path}`}
			class={[
				'group relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors',
				active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
			]}
			aria-current={active ? 'page' : undefined}
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
		</a>
	{/each}
</nav>
