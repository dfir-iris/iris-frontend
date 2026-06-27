<!--
  War-room datastore tab.

  Two stacked sections:
    1. The war room's *own* datastore (flat file list — uploads land
       here so the operator can stash room-level artefacts without
       picking a host case).
    2. Each attached case's datastore rendered inline as a collapsible
       tree, reusing `DatastoreTreeNode` so the look is identical to
       the case-side panel. Read-only here — clicking a file downloads
       it; folder / file mutations stay on the case detail page where
       the full UI lives.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import {
		ChevronDown,
		ChevronRight,
		Download,
		ExternalLink,
		File as FileIcon,
		HardDriveIcon,
		RefreshCwIcon,
		Trash2,
		Upload
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from '$lib/components/ui/toast';
	import {
		WarRoomDatastoreService,
		type WarRoomDatastoreFile
	} from '$lib/services/war-room-datastore.service';
	import {
		WarRoomsService,
		type WarRoomCaseAttachment
	} from '$lib/services/war-rooms.service';
	import { CaseDatastoreService } from '$lib/services/case-datastore.service';
	import DatastoreTreeNode from '$lib/components/common/Datastore/DatastoreTreeNode.svelte';
	import type { DataStoreTree } from '$lib/types/resources/datastore';

	const warRoomId = $derived(Number(page.params.war_room_id));

	let files = $state<WarRoomDatastoreFile[]>([]);
	let attachedCases = $state<WarRoomCaseAttachment[]>([]);
	let loading = $state(true);
	let uploading = $state(false);
	let inputEl: HTMLInputElement | null = $state(null);

	const load = async () => {
		loading = true;
		const [filesRes, casesRes] = await Promise.all([
			WarRoomDatastoreService.list(warRoomId),
			WarRoomsService.listCases(warRoomId)
		]);
		if (filesRes.ok && filesRes.data && typeof filesRes.data !== 'string') {
			const payload = filesRes.data as { files: WarRoomDatastoreFile[] };
			files = payload.files ?? [];
		}
		if (casesRes.ok && Array.isArray(casesRes.data)) {
			attachedCases = casesRes.data;
		}
		loading = false;
	};

	onMount(load);

	const onPick = async (e: Event) => {
		const target = e.target as HTMLInputElement;
		const picked = target.files;
		if (!picked || picked.length === 0) return;
		uploading = true;
		for (const f of Array.from(picked)) {
			const res = await WarRoomDatastoreService.upload(warRoomId, f);
			if (!res.ok) {
				toast({
					title: `Could not upload ${f.name}`,
					description: typeof res.data === 'string' ? res.data : undefined,
					variant: 'destructive'
				});
			}
		}
		uploading = false;
		target.value = '';
		void load();
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

	// --- Per-case datastore embeds ----------------------------------------
	// Each attached case loads its own tree lazily when the operator expands
	// the section. We keep refresh handles per case so a refresh button on
	// the section header can re-pull without nuking the others.

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
			// Backend wraps in { data: <tree> } same as the main case context.
			const payload = res.data as unknown as { data?: DataStoreTree } | DataStoreTree;
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

	const refreshCase = async (e: Event, caseId: number) => {
		e.stopPropagation();
		await loadCaseTree(caseId);
	};

	const downloadCaseFile = (caseId: number, fileId: number) => {
		// Use the same v2 endpoint the panel uses. Bearer auth on plain
		// `<a href>` would 401 — go through the auth-aware blob helper.
		void (async () => {
			const url = await CaseDatastoreService.fetchFileBlobUrl(caseId, fileId);
			if (typeof url === 'string') {
				window.open(url, '_blank', 'noopener,noreferrer');
			}
		})();
	};

	// onFolderAction / onFileAction signatures (required by DatastoreTreeNode):
	const makeFolderAction = (caseId: number) => (action: string, folderId: number) => {
		// Embedded view is read-only — mutations require the full case UI.
		if (action === 'select') return;
		toast({
			title: 'Manage folders on the case page',
			description: `Open case #${caseId} → Datastore for full controls.`
		});
	};

	const makeFileAction = (caseId: number) => (action: string, fileId: number) => {
		if (action === 'download' || action === 'select' || action === 'preview') {
			downloadCaseFile(caseId, fileId);
			return;
		}
		toast({
			title: 'Manage files on the case page',
			description: `Open case #${caseId} → Datastore for full controls.`
		});
	};
</script>

<div class="flex h-full w-full flex-col gap-4 overflow-y-auto p-4 sm:p-6">
	<header class="flex items-center justify-between">
		<div>
			<h2 class="text-lg font-semibold">Datastore</h2>
			<p class="text-xs text-muted-foreground">
				War-room files plus every attached case's datastore in one place.
			</p>
		</div>
		<div>
			<input
				bind:this={inputEl}
				type="file"
				multiple
				class="hidden"
				onchange={onPick}
				aria-label="Upload files"
			/>
			<Button onclick={() => inputEl?.click()} disabled={uploading}>
				<Upload class="mr-1 h-4 w-4" />
				{uploading ? 'Uploading…' : 'Upload to war room'}
			</Button>
		</div>
	</header>

	<!-- War room's own files -->
	<section class="rounded-lg border bg-card/40">
		<div class="flex items-center justify-between border-b px-4 py-2.5">
			<div class="flex items-center gap-2">
				<HardDriveIcon class="h-4 w-4 text-red-500" />
				<h3 class="text-sm font-semibold">War room files</h3>
				<span class="text-2xs text-muted-foreground">({files.length})</span>
			</div>
		</div>
		<div class="px-4 py-3">
			{#if loading}
				<div class="flex flex-col gap-2">
					{#each Array(2) as _}
						<Skeleton class="h-10 w-full" />
					{/each}
				</div>
			{:else if files.length === 0}
				<p class="text-xs text-muted-foreground">
					No files yet. Drop a file in to stash a war-room-level artefact.
				</p>
			{:else}
				<ul class="flex flex-col gap-1.5">
					{#each files as f (f.file_id)}
						<li class="flex items-center gap-3 rounded-md border bg-background px-3 py-2">
							<FileIcon class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium">{f.filename}</p>
								<p class="text-2xs text-muted-foreground">
									{humanSize(f.size_bytes)}
									{#if f.mime_type}
										· {f.mime_type}
									{/if}
									{#if f.uploaded_at}
										· {new Date(f.uploaded_at).toLocaleString()}
									{/if}
								</p>
							</div>
							<a
								href={WarRoomDatastoreService.downloadUrl(warRoomId, f.file_id)}
								class="rounded p-1.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
								title="Download"
							>
								<Download class="h-3.5 w-3.5" />
							</a>
							<Button
								variant="ghost"
								size="icon"
								class="h-7 w-7 text-destructive hover:text-destructive"
								onclick={() => remove(f)}
								aria-label="Delete"
							>
								<Trash2 class="h-3.5 w-3.5" />
							</Button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</section>

	<!-- Attached case datastores -->
	<section class="rounded-lg border bg-card/40">
		<div class="flex items-center justify-between border-b px-4 py-2.5">
			<div class="flex items-center gap-2">
				<HardDriveIcon class="h-4 w-4 text-sky-500" />
				<h3 class="text-sm font-semibold">Attached case datastores</h3>
				<span class="text-2xs text-muted-foreground">({attachedCases.length})</span>
			</div>
		</div>

		<div class="divide-y">
			{#if attachedCases.length === 0}
				<p class="px-4 py-3 text-xs text-muted-foreground">
					Attach a case to the war room to surface its datastore here.
				</p>
			{:else}
				{#each attachedCases as att (att.case_id)}
					{@const s = ensureState(att.case_id)}
					<div>
						<div class="flex items-center gap-2 px-4 py-2.5">
							<button
								type="button"
								class="flex flex-1 items-center gap-2 text-left"
								onclick={() => toggleCase(att.case_id)}
								aria-expanded={s.expanded}
							>
								{#if s.expanded}
									<ChevronDown class="h-3.5 w-3.5 text-muted-foreground" />
								{:else}
									<ChevronRight class="h-3.5 w-3.5 text-muted-foreground" />
								{/if}
								<span class="text-sm font-medium">{att.case_name}</span>
								<span class="text-2xs text-muted-foreground">#{att.case_id}</span>
							</button>

							{#if s.expanded}
								<Button
									variant="ghost"
									size="icon"
									class="h-6 w-6"
									onclick={(e) => refreshCase(e, att.case_id)}
									disabled={s.loading}
									aria-label="Refresh"
								>
									<RefreshCwIcon
										class={s.loading ? 'h-3 w-3 animate-spin' : 'h-3 w-3'}
									/>
								</Button>
							{/if}
							<a
								href={`/case/${att.case_id}/datastore`}
								class="rounded p-1.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
								title="Open in case datastore"
							>
								<ExternalLink class="h-3.5 w-3.5" />
							</a>
						</div>

						{#if s.expanded}
							<div class="border-t bg-background px-3 py-2">
								<div class="mb-2">
									<Input
										value={s.filter}
										oninput={(e) =>
											(s.filter = (e.target as HTMLInputElement).value)}
										placeholder="Search this case's datastore…"
										class="h-7 text-xs"
									/>
								</div>

								{#if s.loading}
									<Skeleton class="h-24 w-full" />
								{:else if s.error}
									<p class="px-2 py-3 text-xs text-destructive">{s.error}</p>
								{:else if Object.keys(s.tree).length === 0}
									<p class="px-2 py-3 text-xs text-muted-foreground">
										Empty datastore.
									</p>
								{:else}
									<div class="text-xs">
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
			{/if}
		</div>
	</section>
</div>
