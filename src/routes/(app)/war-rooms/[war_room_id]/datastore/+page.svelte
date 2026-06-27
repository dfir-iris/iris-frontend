<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import {
		Upload,
		Trash2,
		Download,
		File as FileIcon,
		HardDriveIcon,
		ExternalLink
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from '$lib/components/ui/toast';
	import {
		WarRoomDatastoreService,
		type WarRoomDatastoreFile
	} from '$lib/services/war-room-datastore.service';

	const warRoomId = $derived(Number(page.params.war_room_id));

	let files = $state<WarRoomDatastoreFile[]>([]);
	let attachedCaseIds = $state<number[]>([]);
	let loading = $state(true);
	let uploading = $state(false);
	let inputEl: HTMLInputElement | null = $state(null);

	const load = async () => {
		loading = true;
		const res = await WarRoomDatastoreService.list(warRoomId);
		if (res.ok && res.data && typeof res.data !== 'string') {
			const payload = res.data as {
				files: WarRoomDatastoreFile[];
				attached_case_ids: number[];
			};
			files = payload.files ?? [];
			attachedCaseIds = payload.attached_case_ids ?? [];
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
		load();
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

<div class="flex h-full flex-col gap-4 p-6">
	<header class="flex items-center justify-between">
		<div>
			<h2 class="text-lg font-semibold">Datastore</h2>
			<p class="text-xs text-muted-foreground">
				Files attached directly to the war room, plus per-case datastores from attached
				cases.
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
				{uploading ? 'Uploading…' : 'Upload'}
			</Button>
		</div>
	</header>

	<section>
		<h3 class="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
			War room files ({files.length})
		</h3>
		{#if loading}
			<div class="flex flex-col gap-2">
				{#each Array(3) as _}
					<Skeleton class="h-12 w-full" />
				{/each}
			</div>
		{:else if files.length === 0}
			<p class="text-sm text-muted-foreground">No files yet. Drop something in to start.</p>
		{:else}
			<ul class="flex flex-col gap-1.5">
				{#each files as f (f.file_id)}
					<li class="flex items-center gap-3 rounded-md border bg-card/40 px-3 py-2">
						<FileIcon class="h-4 w-4 shrink-0 text-muted-foreground" />
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
							{#if f.description}
								<p class="text-2xs text-muted-foreground">{f.description}</p>
							{/if}
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
	</section>

	<section>
		<h3 class="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
			Attached case datastores
		</h3>
		{#if attachedCaseIds.length === 0}
			<p class="text-sm text-muted-foreground">
				Attach a case to the war room to surface its datastore here.
			</p>
		{:else}
			<ul class="flex flex-col gap-1.5">
				{#each attachedCaseIds as caseId (caseId)}
					<li>
						<a
							href={`/case/${caseId}/datastore`}
							class="flex items-center gap-2 rounded-md border bg-card/40 px-3 py-2 text-sm transition-colors hover:bg-card"
						>
							<HardDriveIcon class="h-4 w-4 text-muted-foreground" />
							<span class="flex-1">Case #{caseId} datastore</span>
							<ExternalLink class="h-3.5 w-3.5 text-muted-foreground" />
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>
