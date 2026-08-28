<!--
  War-room datastore side panel.

  Visually identical to the case-side `CaseDatastorePanel` — same
  `DatastoreTreeNode` chrome, search box, click-to-preview/download —
  but the **root** is synthesised: one folder per attached case, each
  containing that case's tree as `children`. So the tree reads:

      ▼ Case #42 — [DATABREACH] Foo
          ▼ Evidences
          ▼ IOCs
              📄 phish.eml
      ▼ Case #57 — [PHISH] Bar
          ▼ Notes Upload
              📄 …

  Read-only on case datastores: file actions resolve to download via
  the authenticated blob URL; folder edits route the operator to the
  case page where the full mutation surface lives. War-room files
  (uploaded directly to the room) still get their own flat list at
  the top of the panel.
-->
<script lang="ts">
	import { getContext } from 'svelte';
	import {
		DatabaseIcon,
		Download,
		File as FileIcon,
		RefreshCwIcon,
		Trash2,
		UploadIcon,
		XIcon
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
	import { WarRoomsService, type WarRoomCaseAttachment } from '$lib/services/war-rooms.service';
	import { CaseDatastoreService } from '$lib/services/case-datastore.service';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from '$lib/components/ui/toast';
	import DatastoreTreeNode from '$lib/components/common/Datastore/DatastoreTreeNode.svelte';
	import type {
		DataStoreTree,
		DataStoreTreeNode as DataStoreTreeNodeT
	} from '$lib/types/resources/datastore';

	const panel = getContext<WarRoomDatastorePanelContext>(WAR_ROOM_DATASTORE_PANEL_CTX);

	const warRoomId = $derived(Number(page.params.war_room_id));

	// --- War-room files --------------------------------------------------
	let warRoomFiles = $state<WarRoomDatastoreFile[]>([]);
	let attachedCases = $state<WarRoomCaseAttachment[]>([]);
	let loadingMeta = $state(false);
	let isRefreshing = $state(false);
	let uploading = $state(false);
	let dragOver = $state(false);
	let inputEl: HTMLInputElement | null = $state(null);
	let lastWarRoomId: number | null = null;

	// --- Aggregated case trees -------------------------------------------
	// `caseTrees` holds each attached case's full v2 tree, keyed by
	// case_id. They get merged into a single synthetic root tree
	// (`mergedTree`) the `DatastoreTreeNode` recursive renderer can
	// chew on the same way it does for a real case.
	type CaseTreeState = {
		loading: boolean;
		error: string | null;
		tree: DataStoreTree;
	};
	let caseTrees = $state<Record<number, CaseTreeState>>({});
	// file_id → { case_id, file_original_name } index, populated whenever
	// we load a tree. The file-action handler looks up the owning case
	// here so it can call the correct `CaseDatastoreService` endpoint,
	// and keeps the original filename around so `<a download>` produces
	// the real name instead of a UUID blob URL.
	type FileEntry = { caseId: number; filename: string };
	let fileIndex = $state<Record<number, FileEntry>>({});

	let searchTerm = $state('');

	const indexFiles = (tree: DataStoreTree, caseId: number) => {
		for (const node of Object.values(tree)) {
			if (node.type === 'file') {
				fileIndex[node.file_id] = {
					caseId,
					filename: node.file_original_name
				};
			} else if (node.type === 'directory') {
				indexFiles(node.children, caseId);
			}
		}
	};

	const loadCaseTree = async (caseId: number) => {
		caseTrees[caseId] = {
			loading: true,
			error: null,
			tree: caseTrees[caseId]?.tree ?? {}
		};
		const res = await CaseDatastoreService.getTree(caseId);
		if (res.ok && res.data && typeof res.data !== 'string') {
			// Backend wraps in { data: <tree> } same as the case context.
			const payload = res.data as unknown as { data?: DataStoreTree } | DataStoreTree;
			const treeData =
				'data' in (payload as { data?: unknown }) && (payload as { data?: unknown }).data
					? (payload as { data: DataStoreTree }).data
					: (payload as DataStoreTree);
			caseTrees[caseId] = { loading: false, error: null, tree: treeData };
			indexFiles(treeData, caseId);
		} else {
			caseTrees[caseId] = {
				loading: false,
				error:
					typeof res.data === 'string'
						? res.data
						: (res.error?.message ?? 'Failed to load datastore'),
				tree: caseTrees[caseId]?.tree ?? {}
			};
		}
	};

	const load = async () => {
		if (!warRoomId) return;
		loadingMeta = true;
		try {
			const [filesRes, casesRes] = await Promise.all([
				WarRoomDatastoreService.list(warRoomId),
				WarRoomsService.listCases(warRoomId)
			]);
			if (filesRes.ok && filesRes.data && typeof filesRes.data !== 'string') {
				const payload = filesRes.data as { files: WarRoomDatastoreFile[] };
				warRoomFiles = payload.files ?? [];
			}
			if (casesRes.ok && Array.isArray(casesRes.data)) {
				attachedCases = casesRes.data;
				// Fan-out the case-tree fetches. We don't await them
				// individually — the panel renders skeletons inside each
				// case folder until its tree lands.
				await Promise.all(attachedCases.map((c) => loadCaseTree(c.case_id)));
			}
		} finally {
			loadingMeta = false;
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
		}
	});

	// --- War-room uploads ------------------------------------------------
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
			warRoomFiles = warRoomFiles.filter((x) => x.file_id !== f.file_id);
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

	// --- Synthetic merged tree -------------------------------------------
	// We build one virtual folder per attached case. The dict key is
	// `d-c<caseId>` so it stays distinct from real folder keys
	// (`d-<path_id>`), and the synthetic `path_id` is a large negative
	// number derived from the case id — large enough that it can't
	// collide with any real path id.
	const mergedTree = $derived.by<DataStoreTree>(() => {
		const out: DataStoreTree = {};
		for (const att of attachedCases) {
			const state = caseTrees[att.case_id];
			const childTree = state?.tree ?? {};
			out[`d-c${att.case_id}`] = {
				type: 'directory',
				name: `Case #${att.case_id} — ${att.case_name}`,
				is_root: true,
				children: childTree
			} as DataStoreTreeNodeT;
		}
		return out;
	});

	// Action routers ------------------------------------------------------
	const handleFolderAction = (action: string, _folderId: number) => {
		if (action === 'select') return;
		toast({
			title: 'Open the case to manage folders',
			description: 'The war-room datastore is read-only for attached cases.'
		});
	};

	const handleFileAction = async (action: string, fileId: number) => {
		const entry = fileIndex[fileId];
		if (!entry) {
			toast({ title: 'File not found', variant: 'destructive' });
			return;
		}
		const { caseId, filename } = entry;

		// `preview` / `download` / row-click `select` all want the bytes.
		// `fetchFileBlobUrl` is the bearer-aware helper that produces a
		// short-lived blob URL; using the raw `/api/v2/cases/<id>/datastore/files/<fid>`
		// in a plain `<a href>` would 401 because the browser doesn't
		// attach the Authorization header on naked navigations.
		if (action === 'preview' || action === 'select') {
			const fetched = await CaseDatastoreService.fetchFileBlobUrl(caseId, fileId);
			if (!fetched) {
				toast({
					title: 'Could not open file',
					description: 'The server rejected the request.',
					variant: 'destructive'
				});
				return;
			}
			const w = window.open(fetched.url, '_blank', 'noopener');
			// Revoke after the new tab has had a chance to take ownership
			// of the blob — same 60s window the case-side panel uses.
			setTimeout(() => URL.revokeObjectURL(fetched.url), 60_000);
			if (!w) {
				toast({ title: 'Pop-up blocked', variant: 'warning' });
			}
			return;
		}

		if (action === 'download') {
			const fetched = await CaseDatastoreService.fetchFileBlobUrl(caseId, fileId);
			if (!fetched) {
				toast({
					title: 'Could not download file',
					description: 'The server rejected the request.',
					variant: 'destructive'
				});
				return;
			}
			const a = document.createElement('a');
			a.href = fetched.url;
			a.download = filename || fetched.filename || '';
			a.rel = 'noopener';
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(fetched.url);
			return;
		}

		if (action === 'copy-link') {
			void navigator.clipboard
				.writeText(`${window.location.origin}/case/${caseId}/datastore`)
				.then(() => toast({ title: 'Case datastore link copied' }))
				.catch(() => toast({ title: 'Could not copy link', variant: 'destructive' }));
			return;
		}

		toast({
			title: 'Open the case to make this change',
			description: `Open case #${caseId} → Datastore for full controls.`
		});
	};

	const isLoadingCases = $derived(Object.values(caseTrees).some((s) => s.loading));
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
	<header class="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
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
				<RefreshCwIcon class={isRefreshing ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
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

	<div class="shrink-0 border-b px-3 py-2">
		<Input
			value={searchTerm}
			oninput={(e) => (searchTerm = (e.target as HTMLInputElement).value)}
			placeholder="Search files…"
			class="h-7 text-xs"
		/>
	</div>

	<div
		class={['min-h-0 flex-1 overflow-y-auto transition-colors', dragOver ? 'bg-primary/10' : '']}
	>
		<!-- War-room files -->
		<section class="border-b">
			<div class="flex items-center gap-2 bg-card/30 px-3 py-1.5">
				<span class="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
					War room
				</span>
				<span class="text-2xs tabular-nums text-muted-foreground">
					({warRoomFiles.length})
				</span>
			</div>
			{#if loadingMeta && warRoomFiles.length === 0}
				<div class="flex flex-col gap-1 p-2">
					{#each Array(2) as _}
						<Skeleton class="h-9 w-full" />
					{/each}
				</div>
			{:else if warRoomFiles.length === 0}
				<p class="px-3 py-3 text-center text-2xs text-muted-foreground">
					Drop a file to stash a war-room-level artefact.
				</p>
			{:else}
				<ul class="flex flex-col">
					{#each warRoomFiles as f (f.file_id)}
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
		</section>

		<!-- Aggregated case datastores rendered as one big tree -->
		<section class="px-1 py-2">
			<div class="flex items-center gap-2 px-2 pb-1">
				<span class="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
					Cases
				</span>
				<span class="text-2xs tabular-nums text-muted-foreground">
					({attachedCases.length})
				</span>
				{#if isLoadingCases}
					<span class="text-2xs italic text-muted-foreground">loading…</span>
				{/if}
			</div>

			{#if attachedCases.length === 0}
				<p class="px-3 py-3 text-center text-2xs text-muted-foreground">
					No cases attached. Anything attached later appears here automatically.
				</p>
			{:else if Object.keys(mergedTree).length === 0}
				<Skeleton class="mx-2 h-24 w-[calc(100%-1rem)]" />
			{:else}
				<DatastoreTreeNode
					tree={mergedTree}
					filter={searchTerm}
					onFolderAction={handleFolderAction}
					onFileAction={handleFileAction}
				/>
			{/if}
		</section>
	</div>
</div>
