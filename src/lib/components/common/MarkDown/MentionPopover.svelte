<script lang="ts">
	import { onMount } from 'svelte';
	import {
		UserIcon,
		BoxIcon,
		ShieldAlertIcon,
		FileTextIcon,
		ClipboardListIcon,
		DatabaseIcon,
		DownloadIcon,
		ExternalLinkIcon,
		CopyIcon
	} from 'lucide-svelte';
	import type { MentionKind } from './MentionList.svelte';

	type UserPayload = {
		kind: 'user';
		id: string;
		label: string;
		user_login?: string | null;
	};

	type AssetPayload = {
		kind: 'asset';
		id: string;
		label: string;
		asset_type?: string | null;
		asset_ip?: string | null;
		asset_domain?: string | null;
		onOpen?: () => void;
	};

	type IocPayload = {
		kind: 'ioc';
		id: string;
		label: string;
		ioc_type?: string | null;
		ioc_description?: string | null;
		onOpen?: () => void;
	};

	type NotePayload = {
		kind: 'note';
		id: string;
		label: string;
		directory?: string | null;
		onOpen?: () => void;
	};

	type TaskPayload = {
		kind: 'task';
		id: string;
		label: string;
		status?: string | null;
		assignees?: string | null;
		onOpen?: () => void;
	};

	type DatastorePayload = {
		kind: 'datastore';
		id: string;
		label: string;
		file_size?: number | null;
		file_url?: string | null;
		onPreview?: () => void;
		onDownload?: () => void;
		onCopyMarkdown?: () => void;
	};

	export type MentionPopoverPayload =
		| UserPayload
		| AssetPayload
		| IocPayload
		| NotePayload
		| TaskPayload
		| DatastorePayload;

	let {
		payload,
		onClose
	}: {
		payload: MentionPopoverPayload;
		onClose: () => void;
	} = $props();

	const styleFor = (kind: MentionKind) => {
		if (kind === 'asset') return { Icon: BoxIcon, bg: 'bg-amber-500/15', fg: 'text-amber-600 dark:text-amber-300' };
		if (kind === 'ioc') return { Icon: ShieldAlertIcon, bg: 'bg-red-500/15', fg: 'text-red-600 dark:text-red-300' };
		if (kind === 'note') return { Icon: FileTextIcon, bg: 'bg-emerald-500/15', fg: 'text-emerald-600 dark:text-emerald-300' };
		if (kind === 'task') return { Icon: ClipboardListIcon, bg: 'bg-violet-500/15', fg: 'text-violet-600 dark:text-violet-300' };
		if (kind === 'datastore')
			return { Icon: DatabaseIcon, bg: 'bg-cyan-500/15', fg: 'text-cyan-600 dark:text-cyan-300' };
		return { Icon: UserIcon, bg: 'bg-blue-500/15', fg: 'text-blue-600 dark:text-blue-300' };
	};

	const openLabel = (kind: MentionKind) => {
		if (kind === 'ioc') return 'Open IOC';
		if (kind === 'note') return 'Open note';
		if (kind === 'task') return 'Open task';
		return 'Open asset';
	};

	const formatFileSize = (bytes?: number | null): string => {
		if (bytes == null || bytes <= 0) return '—';
		const units = ['B', 'KB', 'MB', 'GB'];
		let v = bytes;
		let u = 0;
		while (v >= 1024 && u < units.length - 1) {
			v /= 1024;
			u++;
		}
		return `${v.toFixed(v >= 10 || u === 0 ? 0 : 1)} ${units[u]}`;
	};

	const style = $derived(styleFor(payload.kind));

	let rootEl = $state<HTMLDivElement | null>(null);

	// Close on outside click. The parent mount() positions us absolutely
	// in document.body and registers the click handler after a tick so the
	// triggering click itself doesn't immediately close.
	onMount(() => {
		const onClick = (e: MouseEvent) => {
			if (!rootEl) return;
			if (!rootEl.contains(e.target as Node)) onClose();
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		setTimeout(() => document.addEventListener('mousedown', onClick), 0);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onClick);
			document.removeEventListener('keydown', onKey);
		};
	});
</script>

<div
	bind:this={rootEl}
	class="w-64 rounded-md border border-border bg-popover p-3 text-xs shadow-lg"
	role="dialog"
>
	<div class="flex items-center gap-2 border-b border-border/50 pb-2">
		<div class={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${style.bg}`}>
			<style.Icon size="12" class={style.fg} />
		</div>
		<div class="min-w-0 flex-1">
			<div class="truncate text-sm font-semibold">{payload.label}</div>
			<div class="text-2xs uppercase tracking-wide text-muted-foreground">
				{payload.kind}
			</div>
		</div>
	</div>

	<div class="mt-2 space-y-1">
		{#if payload.kind === 'user'}
			{#if payload.user_login}
				<div class="flex items-baseline gap-2">
					<span class="text-2xs text-muted-foreground">login</span>
					<span class="truncate font-mono">{payload.user_login}</span>
				</div>
			{:else}
				<div class="italic text-muted-foreground">No additional details.</div>
			{/if}
		{:else if payload.kind === 'asset'}
			{#if payload.asset_type}
				<div class="flex items-baseline gap-2">
					<span class="text-2xs text-muted-foreground">type</span>
					<span class="truncate">{payload.asset_type}</span>
				</div>
			{/if}
			{#if payload.asset_ip}
				<div class="flex items-baseline gap-2">
					<span class="text-2xs text-muted-foreground">ip</span>
					<span class="truncate font-mono">{payload.asset_ip}</span>
				</div>
			{/if}
			{#if payload.asset_domain}
				<div class="flex items-baseline gap-2">
					<span class="text-2xs text-muted-foreground">domain</span>
					<span class="truncate font-mono">{payload.asset_domain}</span>
				</div>
			{/if}
			{#if !payload.asset_type && !payload.asset_ip && !payload.asset_domain}
				<div class="italic text-muted-foreground">No additional details loaded.</div>
			{/if}
		{:else if payload.kind === 'ioc'}
			{#if payload.ioc_type}
				<div class="flex items-baseline gap-2">
					<span class="text-2xs text-muted-foreground">type</span>
					<span class="truncate">{payload.ioc_type}</span>
				</div>
			{/if}
			{#if payload.ioc_description}
				<div class="text-2xs text-muted-foreground">
					<span class="line-clamp-3">{payload.ioc_description}</span>
				</div>
			{/if}
			{#if !payload.ioc_type && !payload.ioc_description}
				<div class="italic text-muted-foreground">No additional details loaded.</div>
			{/if}
		{:else if payload.kind === 'note'}
			{#if payload.directory}
				<div class="flex items-baseline gap-2">
					<span class="text-2xs text-muted-foreground">folder</span>
					<span class="truncate">{payload.directory}</span>
				</div>
			{:else}
				<div class="italic text-muted-foreground">No additional details loaded.</div>
			{/if}
		{:else if payload.kind === 'task'}
			{#if payload.status}
				<div class="flex items-baseline gap-2">
					<span class="text-2xs text-muted-foreground">status</span>
					<span class="truncate">{payload.status}</span>
				</div>
			{/if}
			{#if payload.assignees}
				<div class="flex items-baseline gap-2">
					<span class="text-2xs text-muted-foreground">assignees</span>
					<span class="truncate">{payload.assignees}</span>
				</div>
			{/if}
			{#if !payload.status && !payload.assignees}
				<div class="italic text-muted-foreground">No additional details loaded.</div>
			{/if}
		{:else if payload.kind === 'datastore'}
			<div class="flex items-baseline gap-2">
				<span class="text-2xs text-muted-foreground">size</span>
				<span class="truncate">{formatFileSize(payload.file_size)}</span>
			</div>
			<div class="mt-2 grid grid-cols-3 gap-1">
				<button
					type="button"
					class="inline-flex items-center justify-center gap-1 rounded border border-border bg-muted/50 px-1.5 py-1 text-2xs font-medium hover:bg-muted"
					onclick={() => {
						payload.onPreview?.();
						onClose();
					}}
					disabled={!payload.onPreview}
				>
					<ExternalLinkIcon size={10} />
					Preview
				</button>
				<button
					type="button"
					class="inline-flex items-center justify-center gap-1 rounded border border-border bg-muted/50 px-1.5 py-1 text-2xs font-medium hover:bg-muted"
					onclick={() => {
						payload.onDownload?.();
						onClose();
					}}
					disabled={!payload.onDownload}
				>
					<DownloadIcon size={10} />
					Download
				</button>
				<button
					type="button"
					class="inline-flex items-center justify-center gap-1 rounded border border-border bg-muted/50 px-1.5 py-1 text-2xs font-medium hover:bg-muted"
					onclick={() => {
						payload.onCopyMarkdown?.();
						onClose();
					}}
					disabled={!payload.onCopyMarkdown}
				>
					<CopyIcon size={10} />
					Markdown
				</button>
			</div>
		{/if}

		{#if payload.kind !== 'user' && payload.kind !== 'datastore' && payload.onOpen}
			<button
				type="button"
				class="mt-2 inline-flex w-full items-center justify-center gap-1 rounded border border-primary/30 bg-primary/10 px-2 py-1 text-2xs font-medium text-primary hover:bg-primary/20"
				onclick={() => {
					payload.onOpen?.();
					onClose();
				}}
			>
				<ExternalLinkIcon size="10" />
				{openLabel(payload.kind)}
			</button>
		{/if}
	</div>
</div>
