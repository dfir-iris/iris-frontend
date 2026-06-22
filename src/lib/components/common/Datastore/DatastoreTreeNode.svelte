<!--
  Recursive tree row used by the DataStore side panel. The panel owns:
  - the context menu (right-click) and its handlers
  - the move/upload action dispatch

  This component is purely about laying out rows, rendering the inline `…`
  dropdown for keyboard/touch users, and forwarding pointer and drag-drop
  events up via callbacks. Doing it this way means we have a single,
  consistent menu and a single drop-zone state machine rather than per-row
  copies of either.
-->
<script lang="ts">
	import {
		ChevronDownIcon,
		ChevronRightIcon,
		FileIcon,
		FolderIcon,
		FolderOpenIcon,
		MoreHorizontalIcon
	} from 'lucide-svelte';
	import type { DataStoreTree, DataStoreTreeNode } from '$lib/types/resources/datastore';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import Self from './DatastoreTreeNode.svelte';

	type FolderAction = 'add-file' | 'add-folder' | 'rename' | 'delete';
	type FileAction =
		| 'preview'
		| 'download'
		| 'copy-link'
		| 'copy-markdown'
		| 'edit'
		| 'delete'
		| 'select';

	export type DragSource =
		| { kind: 'file'; id: number }
		| { kind: 'folder'; id: number };

	type Props = {
		tree: DataStoreTree;
		selectedFileId?: number;
		depth?: number;
		filter?: string;
		dropTargetFolderId?: number | null;
		onFolderAction: (action: FolderAction, folderId: number) => void;
		onFileAction: (action: FileAction, fileId: number) => void;
		onContextMenuFolder?: (folderId: number, isRoot: boolean, x: number, y: number) => void;
		onContextMenuFile?: (fileId: number, x: number, y: number) => void;
		onMove?: (source: DragSource, targetFolderId: number) => void;
		onUploadFiles?: (folderId: number, files: FileList) => void;
		onDragTargetChange?: (folderId: number | null) => void;
	};

	let {
		tree,
		selectedFileId,
		depth = 0,
		filter = '',
		dropTargetFolderId = null,
		onFolderAction,
		onFileAction,
		onContextMenuFolder,
		onContextMenuFile,
		onMove,
		onUploadFiles,
		onDragTargetChange
	}: Props = $props();

	let openMap = $state<Record<string, boolean>>({});

	const toggle = (key: string) => {
		openMap[key] = !(openMap[key] ?? depth < 2);
	};

	const isOpen = (key: string) => openMap[key] ?? depth < 2;

	const nameOf = (node: DataStoreTreeNode) =>
		node.type === 'directory' ? node.name : node.file_original_name;

	const matchesFilter = (node: DataStoreTreeNode, q: string): boolean => {
		if (!q) return true;
		const lq = q.toLowerCase();
		if (nameOf(node).toLowerCase().includes(lq)) return true;
		if (node.type === 'directory') {
			return Object.values(node.children).some((child) => matchesFilter(child, q));
		}
		return false;
	};

	const entries = $derived(
		Object.entries(tree).filter(([, node]) => matchesFilter(node, filter))
	);

	// Drag payload format: a JSON object on the 'application/x-iris-datastore'
	// MIME type. We use a custom type so file-from-OS drops (which carry the
	// 'Files' type) are clearly distinguishable from internal reorgs.
	const DND_TYPE = 'application/x-iris-datastore';

	const startDrag = (event: DragEvent, source: DragSource) => {
		if (!event.dataTransfer) return;
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData(DND_TYPE, JSON.stringify(source));
	};

	// Auto-expand a folder when the user hovers over it during a drag — same
	// affordance file managers use to let users dig deep without giving up
	// the drag. Cleared on dragleave/drop.
	let hoverTimer: ReturnType<typeof setTimeout> | null = null;
	const scheduleAutoExpand = (key: string) => {
		clearAutoExpand();
		hoverTimer = setTimeout(() => {
			if (!isOpen(key)) openMap[key] = true;
		}, 600);
	};
	const clearAutoExpand = () => {
		if (hoverTimer) {
			clearTimeout(hoverTimer);
			hoverTimer = null;
		}
	};

	const handleFolderDragOver = (event: DragEvent, folderId: number) => {
		if (!event.dataTransfer) return;
		// Accept both internal reorgs and OS file drops on folder rows.
		const types = event.dataTransfer.types;
		if (!types.includes(DND_TYPE) && !types.includes('Files')) return;

		event.preventDefault();
		event.stopPropagation();
		event.dataTransfer.dropEffect = types.includes('Files') ? 'copy' : 'move';
		onDragTargetChange?.(folderId);
	};

	const handleFolderDrop = (event: DragEvent, folderId: number) => {
		clearAutoExpand();
		if (!event.dataTransfer) return;

		const files = event.dataTransfer.files;
		if (files && files.length > 0) {
			event.preventDefault();
			event.stopPropagation();
			onUploadFiles?.(folderId, files);
			onDragTargetChange?.(null);
			return;
		}

		const payload = event.dataTransfer.getData(DND_TYPE);
		if (!payload) return;
		try {
			const src = JSON.parse(payload) as DragSource;
			if (src.kind === 'folder' && src.id === folderId) return; // no-op
			event.preventDefault();
			event.stopPropagation();
			onMove?.(src, folderId);
		} catch {
			// ignore malformed payloads
		}
		onDragTargetChange?.(null);
	};
</script>

<ul class="flex flex-col">
	{#each entries as [key, node] (key)}
		{@const idStr = key.split('-')[1]}
		{@const id = Number(idStr)}
		{#if node.type === 'directory'}
			<li class="flex flex-col">
				<!-- svelte-ignore a11y_no_static_element_interactions a11y_interactive_supports_focus a11y_role_has_required_aria_props -->
				<div
					class="group/item flex items-center gap-1 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-muted/60 {dropTargetFolderId ===
					id
						? 'bg-primary/15 ring-1 ring-primary/40'
						: ''}"
					style="padding-left: {depth * 12 + 4}px"
					draggable={!node.is_root}
					ondragstart={(e) => startDrag(e, { kind: 'folder', id })}
					ondragover={(e) => {
						handleFolderDragOver(e, id);
						scheduleAutoExpand(key);
					}}
					ondragleave={clearAutoExpand}
					ondrop={(e) => handleFolderDrop(e, id)}
					oncontextmenu={(e) => {
						e.preventDefault();
						onContextMenuFolder?.(id, !!node.is_root, e.clientX, e.clientY);
					}}
				>
					<button
						class="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
						onclick={() => toggle(key)}
						aria-label={isOpen(key) ? 'Collapse folder' : 'Expand folder'}
					>
						{#if isOpen(key)}
							<ChevronDownIcon size={14} />
						{:else}
							<ChevronRightIcon size={14} />
						{/if}
					</button>

					<button
						class="flex min-w-0 flex-1 items-center gap-1.5 text-left"
						onclick={() => toggle(key)}
					>
						{#if isOpen(key)}
							<FolderOpenIcon size={14} class="shrink-0 text-amber-500" />
						{:else}
							<FolderIcon size={14} class="shrink-0 text-amber-500" />
						{/if}
						<span class="truncate" title={node.name}>{node.name}</span>
						{#if node.is_root}
							<span class="ml-1 shrink-0 rounded bg-muted px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
								root
							</span>
						{/if}
					</button>

					<DropdownMenu>
						<DropdownMenuTrigger>
							<button
								class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover/item:opacity-100"
								aria-label="Folder actions"
							>
								<MoreHorizontalIcon size={14} />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" class="min-w-[160px]">
							<DropdownMenuItem onclick={() => onFolderAction('add-file', id)}>
								Add file here
							</DropdownMenuItem>
							<DropdownMenuItem onclick={() => onFolderAction('add-folder', id)}>
								Add subfolder
							</DropdownMenuItem>
							{#if !node.is_root}
								<DropdownMenuItem onclick={() => onFolderAction('rename', id)}>
									Rename
								</DropdownMenuItem>
								<DropdownMenuItem
									class="text-destructive"
									onclick={() => onFolderAction('delete', id)}
								>
									Delete folder
								</DropdownMenuItem>
							{/if}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>

				{#if isOpen(key)}
					<Self
						tree={node.children}
						{selectedFileId}
						depth={depth + 1}
						{filter}
						{dropTargetFolderId}
						{onFolderAction}
						{onFileAction}
						{onContextMenuFolder}
						{onContextMenuFile}
						{onMove}
						{onUploadFiles}
						{onDragTargetChange}
					/>
				{/if}
			</li>
		{:else}
			{@const file = node}
			<li>
				<DropdownMenu>
					<DropdownMenuTrigger class="w-full">
						<div
							class="group/item flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-sm hover:bg-muted/60 {selectedFileId ===
							id
								? 'bg-primary/10 text-primary'
								: ''}"
							style="padding-left: {depth * 12 + 24}px"
							role="button"
							tabindex="0"
							draggable
							ondragstart={(e) => startDrag(e, { kind: 'file', id })}
							oncontextmenu={(e) => {
								e.preventDefault();
								onContextMenuFile?.(id, e.clientX, e.clientY);
							}}
						>
							<FileIcon size={14} class="shrink-0 text-muted-foreground" />
							<span class="min-w-0 flex-1 truncate text-left" title={file.file_original_name}
								>{file.file_original_name}</span
							>
							{#if file.file_is_ioc}
								<span class="shrink-0 rounded bg-red-500/15 px-1 text-[10px] uppercase tracking-wide text-red-600 dark:text-red-300">
									IOC
								</span>
							{/if}
							{#if file.file_is_evidence}
								<span class="shrink-0 rounded bg-blue-500/15 px-1 text-[10px] uppercase tracking-wide text-blue-600 dark:text-blue-300">
									EV
								</span>
							{/if}
							<MoreHorizontalIcon
								size={14}
								class="shrink-0 text-muted-foreground opacity-0 group-hover/item:opacity-100"
							/>
						</div>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" class="min-w-[180px]">
						<DropdownMenuItem onclick={() => onFileAction('preview', id)}>
							Preview
						</DropdownMenuItem>
						<DropdownMenuItem onclick={() => onFileAction('download', id)}>
							Download
						</DropdownMenuItem>
						<DropdownMenuItem onclick={() => onFileAction('copy-link', id)}>
							Copy link
						</DropdownMenuItem>
						<DropdownMenuItem onclick={() => onFileAction('copy-markdown', id)}>
							Copy as markdown link
						</DropdownMenuItem>
						<DropdownMenuItem onclick={() => onFileAction('edit', id)}>
							Edit metadata
						</DropdownMenuItem>
						<DropdownMenuItem
							class="text-destructive"
							onclick={() => onFileAction('delete', id)}
						>
							Delete file
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</li>
		{/if}
	{/each}
</ul>
