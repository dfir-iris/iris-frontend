<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';
	import {
		BiohazardIcon,
		BlocksIcon,
		BookDashedIcon,
		BookIcon,
		BriefcaseIcon,
		ComputerIcon,
		DatabaseBackupIcon,
		FileLock2Icon,
		Icon,
		InfoIcon,
		NotepadTextDashed,
		PuzzleIcon,
		SettingsIcon,
		ShapesIcon,
		ShieldIcon,
		UserIcon,
		UsersIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<svelte:head>
	<title>Settings | DFIR-IRIS</title>
</svelte:head>

<div class="flex h-screen w-screen flex-row p-6">
	<!-- Sidebar -->
	<div class="flex w-1/3 flex-col items-start pr-2">
		<!-- Header -->
		<div class="flex flex-row items-center gap-x-2 px-3 pb-4">
			<SettingsIcon size={32} class="!stroke-2" />
			<h1>Manage IRIS</h1>
		</div>

		<!-- Data -->
		{@render link(BookIcon, 'Case Options', '/cases')}
		{@render link(ComputerIcon, 'Asset Options', '/assets')}
		{@render link(BiohazardIcon, 'IOC Options', '/iocs')}
		{@render link(FileLock2Icon, 'Evidence Options', '/evidence')}
		{@render link(ShapesIcon, 'Custom Attributes', '/custom-attributes')}

		<div class="my-2"></div>

		<!-- Templates -->

		{@render link(BookDashedIcon, 'Case Templates', '/cases/templates')}
		{@render link(NotepadTextDashed, 'Report Templates', '/reports-templates')}

		<div class="my-2"></div>

		<!-- Security & access links -->
		{@render link(UserIcon, 'Users', '/users')}
		{@render link(UsersIcon, 'Groups', '/groups')}
		{@render link(ShieldIcon, 'Security', '/security')}

		<div class="my-2"></div>

		<!-- System links -->
		{@render link(PuzzleIcon, 'Plugins', '/plugins')}
		{@render link(DatabaseBackupIcon, 'Backup & Restore', '/backup')}
		{@render link(InfoIcon, 'About IRIS', '/about')}
	</div>

	<!-- Main page content -->
	<div class="flex h-full w-full flex-col gap-y-2 rounded border bg-background shadow">
		{@render children()}
	</div>
</div>

<!-- Snippet for link -->
{#snippet link(LinkIcon: typeof Icon, label: string, href: string)}
	<Button
		href="/settings{href}"
		variant="ghost"
		class="w-full items-center justify-start gap-x-2 hover:!bg-foreground/10"
	>
		<LinkIcon />
		{label}
	</Button>
{/snippet}
