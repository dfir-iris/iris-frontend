<!--
  War-room datastore side panel.

  Mirrors `CaseDatastorePanel` but aggregates two sources:
    1. The war room's *own* uploaded files (flat list, drag-drop upload).
    2. Each attached case's full datastore tree, embedded via
       `DatastoreTreeNode` so the look matches the case-side panel.

  Read-only on case datastores (clicking a file downloads it via the
  authenticated blob URL helper); the operator can still upload files
  directly to the war room from anywhere with the toolbar button or by
  dropping files on the panel.
-->
<script lang="ts">
	import { getContext } from 'svelte';
	import {
		ChevronDown,
		ChevronRight,
		DatabaseIcon,
		Download,
		HardDriveIcon,
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
	import {
		WarRoomsService,
		type WarRoomCaseAttachment
	} from '$lib/services/war-rooms.service';
	import { CaseDatastoreService } from '$lib/services/case-datastore.service';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from '$lib/components/ui/toast';
	import DatastoreTreeNode from '$lib/components/common/Datastore/DatastoreTreeNode.svelte';
	import type { DataStoreTree } from '$lib/types/resources/datastore';

	const panel = getContext<WarRoomDatastorePanelContext>(
		WAR_ROOM_DATASTORE_PANEL_CTX
	);

	const warRoomId = $derived(Number(page.params.war_room_id));

	// --- War-room files ----------------------------------------------------
	let files = $state<WarRoomDatastoreFile[]>([]);
	let attachedCases = $state<WarRoomCaseAttachment[]>([]);
	let loading = $state(false);
	let isRefreshing = $state(false);
	let uploading = $state(false);
	let dragOver = $state(false);
	let inputEl: HTMLInputElement | null = $state(null);
	let lastWarRoomId: number | null = null;

	const load = async () => {
		if (!warRoomId) return;
		loading = true;
		try {
			const [filesRes, casesRes] = await Promise.all([
				WarRoomDatastoreService.list(warRoomId),
				WarRoomsService.listCases(warRoomId)
			]);
			if (filesRes.ok && filesRes.data && typeof filesRes.data !== 'string') {
				const payload = filesRes.data as {
					files: WarRoomDatastoreFile[];
				};
				files = payload.files ?? [];
			}
			if (casesRes.ok && Array.isArray(casesRes.data)) {
				attachedCases = casesRes.data;
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
			// Refresh any already-expanded case tree so the operator sees
			// new uploads on the case without having to collapse + expand.
			for (const caseId of Object.keys(caseTrees).map(Number)) {
				if (caseTrees[caseId]?.expanded) {
					await loadCaseTree(caseId);
				}
			}
		} finally {
			isRefreshing = false;
		}
	};

	$effect(() => {
		if (!panel.state.open) return;
		if (warRoomId !== lastWarRoomId) {
			lastWarRoomId = warRoomId;
			void load();
		} else if (files.length === 0 && attachedCases.length === 0 && !loading) {
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
						description:
							typeof res.data === 'string' ? res.data : undefined,
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
		if (bytes < 1024 * 1024 * 1024)
			return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
	};

	// --- Embedded case datastores -----------------------------------------
	type CaseTreeState = {
		expanded: boolean;
		loading: boolean;
		error: string | null;
		tree: DataStoreTree;
		filter: string;
	};
	let caseTrees = $state<Record<number, CaseTreeState>>({});

	const ensureState = (caseId: number) => {
		if (!caseTrees[caseId]) {
			caseTrees[caseId] = {
				expanded: false,
				loading: false,
				error: null,
				tree: {},
				filter: ''
			};
		}
		return caseTrees[caseId];
	};

	const loadCaseTree = async (caseId: number) => {
		const s = ensureState(caseId);
		s.loading = true;
		s.error = null;
		const res = await CaseDatastoreService.getTree(caseId);
		s.loading = false;
		if (res.ok && res.data && typeof res.data !== 'string') {
			// Backend wraps in { data: <tree> } for v2 endpoints — same
			// indirection as the case-side context.
			const payload = res.data as unknown as
				| { data?: DataStoreTree }
				| DataStoreTree;
			const treeData =
				'data' in (payload as { data?: unknown }) &&
				(payload as { data?: unknown }).data
					? ((payload as { data: DataStoreTree }).data)
					: (payload as DataStoreTree);
			s.tree = treeData;
		} else {
			s.error =
				typeof res.data === 'string'
					? res.data
					: (res.error?.message ?? 'Failed to load datastore');
		}
	};

	const toggleCase = async (caseId: number) => {
		const s = ensureState(caseId);
		s.expanded = !s.expanded;
		if (s.expanded && Object.keys(s.tree).length === 0 && !s.loading) {
			await loadCaseTree(caseId);
		}
	};

	const downloadCaseFile = (caseId: number, fileId: number) => {
		// `fetchFileBlobUrl` resolves an authenticated blob URL — safe to
		// hand to window.open. A direct `<a href>` would 401 because the
		// bearer token isn't on the request.
		void (async () => {
			const url = await CaseDatastoreService.fetchFileBlobUrl(caseId, fileId);
			if (typeof url === 'string') {
				window.open(url, '_blank', 'noopener,noreferrer');
			}
		})();
	};

	const makeFolderAction =
		(_caseId: number) => (action: string, _folderId: number) => {
			// Embedded view is read-only — full controls live on the case page.
			if (action === 'select') return;
			toast({
				title: 'Manage folders on the case page',
				description: 'Open the case to make folder changes.'
			});
		};

	const makeFileAction =
		(caseId: number) => (action: string, fileId: number) => {
			if (action === 'download' || action === 'select' || action === 'preview') {
				downloadCaseFile(caseId, fileId);
				return;
			}
			toast({
				title: 'Manage files on the case page',
				description: 'Open the case to delete or move this file.'
			});
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
				aria-label="Upload to war room"
				title="Upload to war room"
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
		<!-- War room files -->
		<section class="border-b">
			<div class="flex items-center gap-2 bg-card/30 px-3 py-1.5">
				<HardDriveIcon class="h-3 w-3 text-red-500" />
				<span class="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
					War room
				</span>
				<span class="text-2xs text-muted-foreground tabular-nums">
					({files.length})
				</span>
			</div>
			{#if loading}
				<div class="flex flex-col gap-1 p-2">
					{#each Array(2) as _}
						<Skeleton class="h-9 w-full" />
					{/each}
				</div>
			{:else if files.length === 0}
				<p class="px-3 py-3 text-center text-2xs text-muted-foreground">
					Drop a file to stash a war-room-level artefact.
				</p>
			{:else}
				<ul class="flex flex-col">
					{#each files as f (f.file_id)}
						<li class="group flex items-center gap-2 px-3 py-1.5">
							<FileIcon class="h-3 w-3 shrink-0 text-muted-foreground" />
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
								href={WarRoomDatastoreService.downloadUrl(
									warRoomId,
									f.file_id
								)}
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
		</section>

		<!-- Per-case embedded trees -->
		{#if attachedCases.length > 0}
			<section>
				<div class="flex items-center gap-2 bg-card/30 px-3 py-1.5">
					<HardDriveIcon class="h-3 w-3 text-sky-500" />
					<span class="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
						Attached cases
					</span>
					<span class="text-2xs text-muted-foreground tabular-nums">
						({attachedCases.length})
					</span>
				</div>
				<div class="divide-y">
					{#each attachedCases as att (att.case_id)}
						{@const s = ensureState(att.case_id)}
						<div>
							<button
								type="button"
								class="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-muted/40"
								onclick={() => toggleCase(att.case_id)}
								aria-expanded={s.expanded}
							>
								{#if s.expanded}
									<ChevronDown class="h-3 w-3 shrink-0 text-muted-foreground" />
								{:else}
									<ChevronRight class="h-3 w-3 shrink-0 text-muted-foreground" />
								{/if}
								<span class="min-w-0 flex-1 truncate text-xs font-medium">
									{att.case_name}
								</span>
								<span class="shrink-0 text-2xs text-muted-foreground">
									#{att.case_id}
								</span>
							</button>

							{#if s.expanded}
								<div class="border-t bg-background px-2 py-2">
									<div class="mb-2 px-1">
										<Input
											value={s.filter}
											oninput={(e) =>
												(s.filter = (
													e.target as HTMLInputElement
												).value)}
											placeholder="Search files…"
											class="h-6 text-2xs"
										/>
									</div>

									{#if s.loading}
										<Skeleton class="mx-1 h-16 w-[calc(100%-0.5rem)]" />
									{:else if s.error}
										<p class="px-2 py-2 text-2xs text-destructive">
											{s.error}
										</p>
									{:else if Object.keys(s.tree).length === 0}
										<p class="px-2 py-2 text-2xs text-muted-foreground">
											Empty datastore.
										</p>
									{:else}
										<div class="text-2xs">
											<DatastoreTreeNode
												tree={s.tree}
												filter={s.filter}
												onFolderAction={makeFolderAction(att.case_id)}
												onFileAction={makeFileAction(att.case_id)}
											/>
										</div>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</section>
		{/if}
	</div>
</div>
