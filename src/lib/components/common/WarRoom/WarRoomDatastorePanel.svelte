<!--
  Sliding side panel that surfaces the war-room datastore from any
  sub-page in the workspace. Mirrors CaseDatastorePanel's chrome but
  is intentionally simpler — the war-room datastore is a flat list
  rather than a tree (folders aren't modelled yet).

  Drag-and-drop upload is supported: drop one or more files anywhere
  on the panel and they're uploaded into the war-room datastore.
-->
<script lang="ts">
	import { getContext, onDestroy } from 'svelte';
	import {
		DatabaseIcon,
		Download,
		RefreshCwIcon,
		Trash2,
		UploadIcon,
		XIcon,
		File as FileIcon
	} from 'lucide-svelte';
	import { page } from '$app/state';
	import {
		WAR_ROOM_DATASTORE_PANEL_CTX,
		type WarRoomDatastorePanelContext
	} from '$lib/contexts/war-room-panels.context.svelte';
	import {
		WarRoomDatastoreService,
		type WarRoomDatastoreFile
	} from '$lib/services/war-room-datastore.service';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from '$lib/components/ui/toast';

	const panel = getContext<WarRoomDatastorePanelContext>(WAR_ROOM_DATASTORE_PANEL_CTX);

	let files = $state<WarRoomDatastoreFile[]>([]);
	let attachedCaseIds = $state<number[]>([]);
	let loading = $state(false);
	let isRefreshing = $state(false);
	let uploading = $state(false);
	let dragOver = $state(false);
	let inputEl: HTMLInputElement | null = $state(null);

	const warRoomId = $derived(Number(page.params.war_room_id));

	let lastWarRoomId: number | null = null;

	const load = async () => {
		if (!warRoomId) return;
		loading = true;
		try {
			const res = await WarRoomDatastoreService.list(warRoomId);
			if (res.ok && res.data && typeof res.data !== 'string') {
				const payload = res.data as {
					files: WarRoomDatastoreFile[];
					attached_case_ids: number[];
				};
				files = payload.files ?? [];
				attachedCaseIds = payload.attached_case_ids ?? [];
			}
		} finally {
			loading = false;
		}
	};

	const refresh = async () => {
		if (isRefreshing) return;
		isRefreshing = true;
		try {
			await load();
		} finally {
			isRefreshing = false;
		}
	};

	$effect(() => {
		if (!panel.state.open) return;
		if (warRoomId !== lastWarRoomId) {
			lastWarRoomId = warRoomId;
			void load();
		} else if (files.length === 0 && !loading) {
			void load();
		}
	});

	const uploadFiles = async (picked: FileList | File[]) => {
		const list = Array.from(picked);
		if (list.length === 0) return;
		uploading = true;
		try {
			for (const f of list) {
				const res = await WarRoomDatastoreService.upload(warRoomId, f);
				if (!res.ok) {
					toast({
						title: `Could not upload ${f.name}`,
						description: typeof res.data === 'string' ? res.data : undefined,
						variant: 'destructive'
					});
				}
			}
			await load();
		} finally {
			uploading = false;
		}
	};

	const onPick = (e: Event) => {
		const target = e.target as HTMLInputElement;
		if (!target.files) return;
		void uploadFiles(target.files);
		target.value = '';
	};

	const onDrop = (e: DragEvent) => {
		e.preventDefault();
		dragOver = false;
		if (!e.dataTransfer?.files?.length) return;
		void uploadFiles(e.dataTransfer.files);
	};

	const remove = async (f: WarRoomDatastoreFile) => {
		if (!confirm(`Delete file "${f.filename}"?`)) return;
		const res = await WarRoomDatastoreService.remove(warRoomId, f.file_id);
		if (res.ok) {
			files = files.filter((x) => x.file_id !== f.file_id);
		} else {
			toast({ title: 'Could not delete file', variant: 'destructive' });
		}
	};

	const humanSize = (bytes: number) => {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
	};
</script>

<div
	class="flex h-full flex-col"
	role="region"
	aria-label="War room datastore"
	ondragenter={(e) => {
		e.preventDefault();
		dragOver = true;
	}}
	ondragover={(e) => {
		e.preventDefault();
		dragOver = true;
	}}
	ondragleave={() => (dragOver = false)}
	ondrop={onDrop}
>
	<header class="flex items-center justify-between gap-2 border-b px-3 py-2">
		<div class="flex items-center gap-2">
			<DatabaseIcon class="h-3.5 w-3.5 text-muted-foreground" />
			<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				Datastore
			</h3>
		</div>
		<div class="flex items-center gap-1">
			<input
				bind:this={inputEl}
				type="file"
				multiple
				class="hidden"
				onchange={onPick}
				aria-label="Upload"
			/>
			<Button
				variant="ghost"
				size="icon"
				class="h-7 w-7"
				onclick={() => inputEl?.click()}
				disabled={uploading}
				aria-label="Upload files"
			>
				<UploadIcon class="h-3.5 w-3.5" />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				class="h-7 w-7"
				onclick={refresh}
				disabled={isRefreshing}
				aria-label="Refresh"
			>
				<RefreshCwIcon
					class={isRefreshing ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'}
				/>
			</Button>
			<Button
				variant="ghost"
				size="icon"
				class="h-7 w-7"
				onclick={() => panel.close()}
				aria-label="Close datastore panel"
			>
				<XIcon class="h-3.5 w-3.5" />
			</Button>
		</div>
	</header>

	<div
		class={[
			'flex-1 overflow-y-auto transition-colors',
			dragOver ? 'bg-primary/10' : ''
		]}
	>
		{#if loading}
			<div class="flex flex-col gap-2 p-3">
				{#each Array(3) as _}
					<Skeleton class="h-10 w-full" />
				{/each}
			</div>
		{:else if files.length === 0}
			<p class="px-3 py-6 text-center text-xs text-muted-foreground">
				No files yet. Drop a file here to upload.
			</p>
		{:else}
			<ul class="flex flex-col">
				{#each files as f (f.file_id)}
					<li class="group flex items-center gap-2 border-b px-3 py-2 last:border-b-0">
						<FileIcon class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
						<div class="min-w-0 flex-1">
							<p class="truncate text-xs font-medium">{f.filename}</p>
							<p class="text-2xs text-muted-foreground">
								{humanSize(f.size_bytes)}
								{#if f.uploaded_at}
									· {new Date(f.uploaded_at).toLocaleString()}
								{/if}
							</p>
						</div>
						<a
							href={WarRoomDatastoreService.downloadUrl(warRoomId, f.file_id)}
							class="rounded p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
							title="Download"
						>
							<Download class="h-3 w-3" />
						</a>
						<button
							type="button"
							class="rounded p-1 text-muted-foreground opacity-0 transition hover:bg-muted/50 hover:text-destructive group-hover:opacity-100"
							onclick={() => remove(f)}
							aria-label="Delete"
						>
							<Trash2 class="h-3 w-3" />
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	{#if attachedCaseIds.length > 0}
		<footer class="border-t px-3 py-2">
			<p class="mb-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
				Attached cases
			</p>
			<ul class="flex flex-col gap-0.5">
				{#each attachedCaseIds as caseId (caseId)}
					<li>
						<a
							class="block truncate rounded px-1.5 py-0.5 text-2xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
							href={`/case/${caseId}/datastore`}
						>
							Case #{caseId} datastore →
						</a>
					</li>
				{/each}
			</ul>
		</footer>
	{/if}
</div>
