<!--
  War-room section tabs. Same visual idiom as the case tab bar:
  underline-style active state with a subtle hover, icon + label, with
  an overflow scroll on small screens so the row never wraps.
-->
<script lang="ts">
	import { page } from '$app/state';
	import {
		ClockIcon,
		FileTextIcon,
		FilesIcon,
		HardDriveUploadIcon,
		ListChecksIcon,
		MessageSquareIcon,
		UsersIcon,
		WaypointsIcon
	} from 'lucide-svelte';

	type Tab = {
		label: string;
		path: string;
		icon: typeof MessageSquareIcon;
	};

	const tabs: Tab[] = [
		{ label: 'Chat', path: 'chat', icon: MessageSquareIcon },
		{ label: 'Graph', path: 'graph', icon: WaypointsIcon },
		{ label: 'Timelines', path: 'timelines', icon: ClockIcon },
		{ label: 'Tasks', path: 'tasks', icon: ListChecksIcon },
		{ label: 'Notes', path: 'notes', icon: FileTextIcon },
		{ label: 'SitReps', path: 'sitreps', icon: FilesIcon },
		{ label: 'Datastore', path: 'datastore', icon: HardDriveUploadIcon },
		{ label: 'Cases', path: 'cases', icon: WaypointsIcon },
		{ label: 'Members', path: 'members', icon: UsersIcon }
	];

	const warRoomId = $derived(Number(page.params.war_room_id));

	const isActive = (path: string) => {
		const base = `/war-rooms/${warRoomId}/${path}`;
		return page.url.pathname === base || page.url.pathname.startsWith(`${base}/`);
	};
</script>

<nav
	class="flex items-center gap-0.5 overflow-x-auto border-b bg-background px-3"
	aria-label="War room sections"
>
	{#each tabs as tab (tab.path)}
		{@const active = isActive(tab.path)}
		<a
			href={`/war-rooms/${warRoomId}/${tab.path}`}
			class={[
				'group relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors',
				active
					? 'text-foreground'
					: 'text-muted-foreground hover:text-foreground'
			]}
			aria-current={active ? 'page' : undefined}
		>
			<tab.icon class="h-3.5 w-3.5" />
			{tab.label}
			<span
				class={[
					'absolute inset-x-2 -bottom-px h-0.5 rounded-full transition-colors',
					active ? 'bg-primary' : 'bg-transparent group-hover:bg-border'
				]}
				aria-hidden="true"
			></span>
		</a>
	{/each}
</nav>
