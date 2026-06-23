<!--
  Sliding side panel that shows the case DataStore tree from anywhere in
  the workspace. Mirrors CaseActivityPanel's chrome.

  Interactions:
  - Click row → opens dropdown menu of actions (download, copy link, …)
  - Right-click row → opens the same action menu at the cursor
  - Drag a file/folder onto another folder → moves it
  - Drag external files from the OS → uploads them to the target folder
    (or the root if dropped on empty area / panel chrome)
-->
<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import { DatabaseIcon, FolderPlusIcon, PlusIcon, RefreshCwIcon, SearchIcon, XIcon, UploadIcon } from 'lucide-svelte';
	import { page } from '$app/state';
	import {
		DATASTORE_PANEL_CTX,
		type DatastorePanelContext
	} from '$lib/contexts/datastore-panel.context.svelte';
	import {
		CASE_DATASTORE_CTX,
		type CaseDatastoreContext
	} from '$lib/contexts/case-datastore.context.svelte';
	import { CaseDatastoreService } from '$lib/services/case-datastore.service';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import {
		Tooltip,
		TooltipContent,
		TooltipProvider,
		TooltipTrigger
	} from '$lib/components/ui/tooltip';
	import { toast } from '$lib/stores/toast.store';
	import DatastoreTreeNode, {
		type DragSource
	} from '$lib/components/common/Datastore/DatastoreTreeNode.svelte';
	import DatastoreEditFileDialog from '$lib/components/common/Datastore/DatastoreEditFileDialog.svelte';
	import type { DataStoreFile } from '$lib/types/resources/datastore';

	const panel = getContext<DatastorePanelContext>(DATASTORE_PANEL_CTX);
	const datastore = getContext<CaseDatastoreContext>(CASE_DATASTORE_CTX);

	let isRefreshing = $state(false);
	let searchTerm = $state('');

	const caseId = $derived(Number(page.params.case_id));
	const selectedFileId = $derived<number | undefined>(datastore.ui.selectedFileId);

	const refresh = async () => {
		if (isRefreshing) return;
		isRefreshing = true;
		try {
			await datastore.loadTree({ fetch });
		} finally {
			isRefreshing = false;
		}
	};

	let wasOpen = false;
	$effect(() => {
		const isOpen = panel.state.open;
		if (isOpen && !wasOpen) {
			wasOpen = true;
			void refresh();
		} else if (!isOpen) {
			wasOpen = false;
		}
	});

	$effect(() => {
		if (!panel.state.open) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				if (contextMenu.open) closeContextMenu();
				else panel.close();
			}
		};
		document.addEventListener('keydown', handler);
		return () => document.removeEventListener('keydown', handler);
	});

	onMount(() => {
		if (panel.state.open) void refresh();
	});

	const openAddFile = (folderId?: number) => {
		if (folderId !== undefined) datastore.ui.selectedFolderId = folderId;
		datastore.ui.showAddFileModal = true;
	};

	const openAddFolder = (folderId?: number) => {
		if (folderId !== undefined) datastore.ui.selectedFolderId = folderId;
		datastore.ui.showAddFolderModal = true;
	};

	const handleFolderAction = async (
		action: 'add-file' | 'add-folder' | 'rename' | 'delete',
		folderId: number
	) => {
		switch (action) {
			case 'add-file':
				openAddFile(folderId);
				return;
			case 'add-folder':
				openAddFolder(folderId);
				return;
			case 'rename': {
				const name = window.prompt('New folder name');
				if (!name?.trim()) return;
				const ok = await datastore.renameFolder(folderId, { folder_name: name.trim() });
				toast({
					title: ok ? 'Folder renamed' : 'Rename failed',
					variant: ok ? 'success' : 'destructive'
				});
				return;
			}
			case 'delete': {
				if (!window.confirm('Delete this folder and all its contents?')) return;
				const ok = await datastore.deleteFolder(folderId);
				toast({
					title: ok ? 'Folder deleted' : 'Delete failed',
					variant: ok ? 'success' : 'destructive'
				});
				return;
			}
		}
	};

	let editingFile = $state<DataStoreFile | null>(null);
	let editOpen = $state(false);

	const writeClipboard = async (text: string, label: string) => {
		try {
			await navigator.clipboard.writeText(text);
			toast({ title: `${label} copied`, variant: 'success' });
		} catch {
			toast({ title: 'Copy failed', variant: 'destructive' });
		}
	};

	const handleFileAction = async (
		action: 'preview' | 'download' | 'copy-link' | 'copy-markdown' | 'edit' | 'delete' | 'select',
		fileId: number
	) => {
		const file = datastore.fileById[fileId];
		// Plain link form is only safe for copy-link / markdown embeds —
		// those land in a place that performs its own authenticated fetch.
		// For in-app preview / download we have to fetch with the bearer
		// header attached and hand the browser a blob URL.
		const url = CaseDatastoreService.getViewUrl(caseId, fileId);

		switch (action) {
			case 'select':
				datastore.selectFile(fileId);
				return;
			case 'preview': {
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
				// of the blob URL. 60s is generous and avoids the tab losing
				// the resource if the user takes a moment to focus it.
				setTimeout(() => URL.revokeObjectURL(fetched.url), 60_000);
				if (!w) {
					toast({ title: 'Pop-up blocked', variant: 'warning' });
				}
				return;
			}
			case 'download': {
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
				a.download = file?.file_original_name ?? fetched.filename ?? '';
				a.rel = 'noopener';
				document.body.appendChild(a);
				a.click();
				a.remove();
				URL.revokeObjectURL(fetched.url);
				return;
			}
			case 'copy-link':
				await writeClipboard(url, 'Link');
				return;
			case 'copy-markdown': {
				const label = file?.file_original_name ?? `File #${fileId}`;
				await writeClipboard(
					CaseDatastoreService.getMarkdownLink(caseId, fileId, label),
					'Markdown link'
				);
				return;
			}
			case 'edit':
				editingFile = file ?? null;
				editOpen = true;
				return;
			case 'delete': {
				if (!window.confirm('Delete this file?')) return;
				const ok = await datastore.deleteFile(fileId);
				toast({
					title: ok ? 'File deleted' : 'Delete failed',
					variant: ok ? 'success' : 'destructive'
				});
				return;
			}
		}
	};

	// --- Context menu ---
	// One floating menu controlled by `contextMenu`; the tree dispatches
	// folder/file targets via callbacks. Positioned at the click point and
	// clamped to viewport so it never overflows on the right edge.
	type ContextTarget =
		| { kind: 'folder'; id: number; isRoot: boolean }
		| { kind: 'file'; id: number };

	let contextMenu = $state<{
		open: boolean;
		x: number;
		y: number;
		target: ContextTarget | null;
	}>({ open: false, x: 0, y: 0, target: null });

	const closeContextMenu = () => {
		contextMenu = { open: false, x: 0, y: 0, target: null };
	};

	const openContextMenu = (target: ContextTarget, x: number, y: number) => {
		// Clamp roughly — the menu is ~220px wide, ~280px tall in its largest
		// folder variant. Real width is measured by the browser; this just
		// keeps it from spawning off-screen.
		const W = 220;
		const H = 280;
		const cx = Math.min(x, window.innerWidth - W - 8);
		const cy = Math.min(y, window.innerHeight - H - 8);
		contextMenu = { open: true, x: cx, y: cy, target };
	};

	$effect(() => {
		if (!contextMenu.open) return;
		const onClick = (e: MouseEvent) => {
			const root = document.getElementById('ds-ctx-menu');
			if (root && root.contains(e.target as Node)) return;
			closeContextMenu();
		};
		// `mousedown` instead of `click` so the menu closes on the same press
		// that lands on another row, before that row's own handler runs.
		setTimeout(() => document.addEventListener('mousedown', onClick), 0);
		return () => document.removeEventListener('mousedown', onClick);
	});

	// --- Drag and drop ---
	let dropTargetFolderId = $state<number | null>(null);
	// Tracks whether an external-file drag is currently over the panel body
	// (so we can show the big "drop to upload" overlay).
	let bodyDropActive = $state(false);

	const moveSource = async (source: DragSource, targetFolderId: number) => {
		if (source.kind === 'file') {
			const ok = await datastore.moveFile(source.id, targetFolderId);
			toast({
				title: ok ? 'File moved' : 'Move failed',
				variant: ok ? 'success' : 'destructive'
			});
		} else {
			const ok = await datastore.moveFolder(source.id, targetFolderId);
			toast({
				title: ok ? 'Folder moved' : 'Move failed',
				variant: ok ? 'success' : 'destructive'
			});
		}
		dropTargetFolderId = null;
	};

	const uploadFiles = async (folderId: number, files: FileList) => {
		// Sequential uploads keep the toast count and error reporting clear,
		// and avoid hammering the server with N concurrent multipart writes.
		// Most cases will be 1–3 files; anything bigger we let the user
		// queue via repeat drops.
		let ok = 0;
		let failed = 0;
		for (const file of Array.from(files)) {
			const created = await datastore.uploadFile(
				folderId,
				{ file_original_name: file.name },
				file
			);
			if (created) ok++;
			else failed++;
		}
		if (ok > 0) {
			toast({
				title: `Uploaded ${ok} file${ok === 1 ? '' : 's'}`,
				variant: 'success'
			});
		}
		if (failed > 0) {
			toast({
				title: `Failed to upload ${failed} file${failed === 1 ? '' : 's'}`,
				variant: 'destructive'
			});
		}
		bodyDropActive = false;
	};

	// Body-level drag handlers: catch OS-file drops that don't land on a
	// specific folder row. We upload to the root folder in that case.
	const handleBodyDragOver = (event: DragEvent) => {
		if (!event.dataTransfer) return;
		if (!event.dataTransfer.types.includes('Files')) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = 'copy';
		bodyDropActive = true;
	};

	const handleBodyDragLeave = (event: DragEvent) => {
		// Only clear when we leave the actual panel body — dragging onto a
		// child element triggers dragleave on the parent first.
		if (event.currentTarget === event.target) {
			bodyDropActive = false;
		}
	};

	const handleBodyDrop = async (event: DragEvent) => {
		if (!event.dataTransfer) return;
		const files = event.dataTransfer.files;
		if (!files || files.length === 0) {
			bodyDropActive = false;
			return;
		}
		event.preventDefault();
		const target = datastore.tree.rootId;
		if (target == null) {
			toast({ title: 'No target folder available', variant: 'destructive' });
			bodyDropActive = false;
			return;
		}
		await uploadFiles(target, files);
	};
</script>

{#if panel.state.open}
	<div class="flex h-full w-full flex-col">
		<header class="flex items-center gap-2 border-b border-border px-4 py-3 dark:border-slate-700">
			<DatabaseIcon class="size-4 shrink-0 text-muted-foreground" />
			<div class="min-w-0 flex-1">
				<div class="text-2xs uppercase tracking-wide text-muted-foreground">DataStore</div>
				<div class="truncate text-sm font-semibold">Case files</div>
			</div>

			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>
						<Button
							variant="ghost"
							size="icon"
							class="size-7"
							onclick={() => openAddFolder(datastore.tree.rootId ?? undefined)}
							aria-label="Add folder"
						>
							<FolderPlusIcon class="size-3.5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">Add folder</TooltipContent>
				</Tooltip>
			</TooltipProvider>

			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>
						<Button
							variant="ghost"
							size="icon"
							class="size-7"
							onclick={() => openAddFile(datastore.tree.rootId ?? undefined)}
							aria-label="Add file"
						>
							<PlusIcon class="size-3.5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">Add file</TooltipContent>
				</Tooltip>
			</TooltipProvider>

			<Button
				variant="ghost"
				size="icon"
				class="size-7"
				onclick={refresh}
				disabled={isRefreshing}
				aria-label="Refresh datastore"
			>
				<RefreshCwIcon class={`size-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
			</Button>

			<Button
				variant="ghost"
				size="icon"
				class="size-7"
				onclick={() => panel.close()}
				aria-label="Close datastore panel"
			>
				<XIcon class="size-4" />
			</Button>
		</header>

		<div class="border-b border-border/60 px-3 py-2 dark:border-slate-700/60">
			<div class="relative">
				<SearchIcon size={12} class="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
				<Input
					bind:value={searchTerm}
					placeholder="Search files…"
					class="h-7 pl-7 text-xs"
				/>
			</div>
		</div>

		<!--
			Body acts as a passive drop zone for OS-file uploads when nothing
			more specific (a folder row) catches the drop. The big overlay
			only renders while a file is actively over the panel.
		-->
		<!-- svelte-ignore a11y_no_static_element_interactions a11y_interactive_supports_focus -->
		<div
			class="relative min-h-0 flex-1 overflow-auto px-2 py-2"
			ondragover={handleBodyDragOver}
			ondragleave={handleBodyDragLeave}
			ondrop={handleBodyDrop}
		>
			{#if datastore.tree.status === 'loading' && Object.keys(datastore.tree.data).length === 0}
				<div class="flex flex-col gap-2 p-2">
					{#each Array(6) as _}
						<Skeleton class="h-5 w-full" />
					{/each}
				</div>
			{:else if datastore.tree.status === 'error'}
				<p class="px-2 text-xs text-destructive">
					{datastore.tree.error ?? 'Failed to load'}
				</p>
			{:else if Object.keys(datastore.tree.data).length === 0}
				<p class="px-2 text-xs text-muted-foreground">
					No files yet — drop one here or use the + button above.
				</p>
			{:else}
				<DatastoreTreeNode
					tree={datastore.tree.data}
					{selectedFileId}
					{dropTargetFolderId}
					filter={searchTerm}
					onFolderAction={handleFolderAction}
					onFileAction={handleFileAction}
					onContextMenuFolder={(id, isRoot, x, y) =>
						openContextMenu({ kind: 'folder', id, isRoot }, x, y)}
					onContextMenuFile={(id, x, y) =>
						openContextMenu({ kind: 'file', id }, x, y)}
					onMove={(source, targetFolderId) => moveSource(source, targetFolderId)}
					onUploadFiles={(folderId, files) => uploadFiles(folderId, files)}
					onDragTargetChange={(id) => (dropTargetFolderId = id)}
				/>
			{/if}

			{#if bodyDropActive}
				<div
					class="pointer-events-none absolute inset-2 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-primary/50 bg-primary/5"
					aria-hidden="true"
				>
					<UploadIcon class="size-8 text-primary" />
					<p class="mt-2 text-sm font-medium text-primary">Drop to upload to root</p>
					<p class="text-2xs text-muted-foreground">
						Hover a folder to upload there instead
					</p>
				</div>
			{/if}
		</div>
	</div>
{/if}

{#if contextMenu.open && contextMenu.target}
	{@const target = contextMenu.target}
	<div
		id="ds-ctx-menu"
		role="menu"
		class="fixed z-[100] min-w-[200px] overflow-hidden rounded-md border border-border bg-popover py-1 text-sm shadow-md"
		style="left: {contextMenu.x}px; top: {contextMenu.y}px;"
	>
		{#if target.kind === 'folder'}
			<button
				type="button"
				class="block w-full px-3 py-1.5 text-left hover:bg-muted"
				onclick={() => {
					closeContextMenu();
					handleFolderAction('add-file', target.id);
				}}
			>
				Add file here
			</button>
			<button
				type="button"
				class="block w-full px-3 py-1.5 text-left hover:bg-muted"
				onclick={() => {
					closeContextMenu();
					handleFolderAction('add-folder', target.id);
				}}
			>
				Add subfolder
			</button>
			{#if !target.isRoot}
				<div class="my-1 border-t border-border" role="separator"></div>
				<button
					type="button"
					class="block w-full px-3 py-1.5 text-left hover:bg-muted"
					onclick={() => {
						closeContextMenu();
						handleFolderAction('rename', target.id);
					}}
				>
					Rename
				</button>
				<button
					type="button"
					class="block w-full px-3 py-1.5 text-left text-destructive hover:bg-muted"
					onclick={() => {
						closeContextMenu();
						handleFolderAction('delete', target.id);
					}}
				>
					Delete folder
				</button>
			{/if}
		{:else}
			<button
				type="button"
				class="block w-full px-3 py-1.5 text-left hover:bg-muted"
				onclick={() => {
					closeContextMenu();
					handleFileAction('preview', target.id);
				}}
			>
				Preview
			</button>
			<button
				type="button"
				class="block w-full px-3 py-1.5 text-left hover:bg-muted"
				onclick={() => {
					closeContextMenu();
					handleFileAction('download', target.id);
				}}
			>
				Download
			</button>
			<button
				type="button"
				class="block w-full px-3 py-1.5 text-left hover:bg-muted"
				onclick={() => {
					closeContextMenu();
					handleFileAction('copy-link', target.id);
				}}
			>
				Copy link
			</button>
			<button
				type="button"
				class="block w-full px-3 py-1.5 text-left hover:bg-muted"
				onclick={() => {
					closeContextMenu();
					handleFileAction('copy-markdown', target.id);
				}}
			>
				Copy as markdown link
			</button>
			<div class="my-1 border-t border-border" role="separator"></div>
			<button
				type="button"
				class="block w-full px-3 py-1.5 text-left hover:bg-muted"
				onclick={() => {
					closeContextMenu();
					handleFileAction('edit', target.id);
				}}
			>
				Edit metadata
			</button>
			<button
				type="button"
				class="block w-full px-3 py-1.5 text-left text-destructive hover:bg-muted"
				onclick={() => {
					closeContextMenu();
					handleFileAction('delete', target.id);
				}}
			>
				Delete file
			</button>
		{/if}
	</div>
{/if}

<DatastoreEditFileDialog
	bind:open={editOpen}
	file={editingFile}
	onOpenChange={(o) => {
		editOpen = o;
		if (!o) editingFile = null;
	}}
/>
