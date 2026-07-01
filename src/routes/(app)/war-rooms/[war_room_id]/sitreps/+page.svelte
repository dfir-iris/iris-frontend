<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { Plus, Trash2, Download, Send, FileText, FileLock } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { MarkDownEditor, MarkDownPreview } from '$lib/components/common/MarkDown';
	import {
		Dialog,
		DialogContent,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from '$lib/components/ui/toast';
	import {
		WarRoomSitRepsService,
		type WarRoomSitRep
	} from '$lib/services/war-room-sitreps.service';

	const warRoomId = $derived(Number(page.params.war_room_id));

	let sitreps = $state<WarRoomSitRep[]>([]);
	let loading = $state(true);
	let selectedId = $state<number | null>(null);
	let detail = $state<WarRoomSitRep | null>(null);
	let detailLoading = $state(false);
	let saving = $state(false);

	let createOpen = $state(false);
	let newTitle = $state('');

	let editing = $state(false);
	let editTitle = $state('');
	let editBody = $state('');

	const load = async () => {
		loading = true;
		const res = await WarRoomSitRepsService.list(warRoomId);
		if (res.ok && Array.isArray(res.data)) {
			sitreps = res.data;
			if (selectedId == null && sitreps.length) {
				selectedId = sitreps[0].sitrep_id;
			}
		}
		loading = false;
		if (selectedId != null) loadDetail(selectedId);
	};

	const loadDetail = async (id: number) => {
		detailLoading = true;
		const res = await WarRoomSitRepsService.get(warRoomId, id);
		detailLoading = false;
		if (res.ok && res.data && typeof res.data !== 'string') {
			detail = res.data as WarRoomSitRep;
			editTitle = detail.title;
			editBody = detail.body_md ?? '';
		}
	};

	onMount(load);

	const select = (id: number) => {
		selectedId = id;
		editing = false;
		loadDetail(id);
	};

	const submitCreate = async () => {
		const title = newTitle.trim();
		if (!title) return;
		saving = true;
		const res = await WarRoomSitRepsService.create(warRoomId, {
			title,
			body_md: `## Situation\n\n## Actions taken\n\n## Next steps\n`
		});
		saving = false;
		if (res.ok && res.data && typeof res.data !== 'string') {
			const next = res.data as WarRoomSitRep;
			sitreps = [next, ...sitreps];
			selectedId = next.sitrep_id;
			detail = next;
			editTitle = next.title;
			editBody = next.body_md ?? '';
			editing = true;
			createOpen = false;
			newTitle = '';
		}
	};

	const startEdit = () => {
		if (!detail) return;
		editing = true;
	};

	const cancelEdit = () => {
		if (!detail) return;
		editTitle = detail.title;
		editBody = detail.body_md ?? '';
		editing = false;
	};

	const save = async () => {
		if (!detail) return;
		saving = true;
		const res = await WarRoomSitRepsService.update(warRoomId, detail.sitrep_id, {
			title: editTitle.trim(),
			body_md: editBody
		});
		saving = false;
		if (res.ok && res.data && typeof res.data !== 'string') {
			detail = res.data as WarRoomSitRep;
			sitreps = sitreps.map((s) => (s.sitrep_id === detail!.sitrep_id ? detail! : s));
			editing = false;
		} else {
			toast({ title: 'Could not save', variant: 'destructive' });
		}
	};

	// One ConfirmationDialog instance drives every "are you sure?" prompt
	// on this page (publish, delete draft, delete published). Each call
	// site stashes the copy + the action to run on confirm — the dialog
	// then closes itself and fires the closure via `onConfirm`.
	let confirmOpen = $state(false);
	let confirmTitle = $state('');
	let confirmMessage = $state('');
	let confirmActionText = $state('Confirm');
	let confirmVariant = $state<'default' | 'destructive'>('destructive');
	let pendingAction: (() => Promise<void>) | null = null;

	const askConfirm = (opts: {
		title: string;
		message: string;
		actionText: string;
		variant?: 'default' | 'destructive';
		run: () => Promise<void>;
	}) => {
		confirmTitle = opts.title;
		confirmMessage = opts.message;
		confirmActionText = opts.actionText;
		confirmVariant = opts.variant ?? 'destructive';
		pendingAction = opts.run;
		confirmOpen = true;
	};

	const runConfirmed = () => {
		const action = pendingAction;
		pendingAction = null;
		if (action) void action();
	};

	const doPublish = async () => {
		if (!detail) return;
		saving = true;
		const res = await WarRoomSitRepsService.publish(warRoomId, detail.sitrep_id);
		saving = false;
		if (res.ok && res.data && typeof res.data !== 'string') {
			detail = res.data as WarRoomSitRep;
			sitreps = sitreps.map((s) => (s.sitrep_id === detail!.sitrep_id ? detail! : s));
			editing = false;
			toast({ title: `SitRep v${detail.version} published` });
		} else {
			toast({ title: 'Could not publish', variant: 'destructive' });
		}
	};

	const publish = () => {
		if (!detail) return;
		askConfirm({
			title: `Publish "${detail.title}"?`,
			message: 'It stays editable — publishing just marks the state.',
			actionText: 'Publish',
			variant: 'default',
			run: doPublish
		});
	};

	const doRemove = async (s: WarRoomSitRep) => {
		const res = await WarRoomSitRepsService.remove(warRoomId, s.sitrep_id);
		if (res.ok) {
			sitreps = sitreps.filter((x) => x.sitrep_id !== s.sitrep_id);
			if (selectedId === s.sitrep_id) {
				editing = false;
				selectedId = sitreps[0]?.sitrep_id ?? null;
				if (selectedId != null) {
					loadDetail(selectedId);
				} else {
					// Nothing left — clear the detail pane so it doesn't
					// keep showing the row we just deleted.
					detail = null;
				}
			}
		} else {
			toast({ title: 'Could not delete SitRep', variant: 'destructive' });
		}
	};

	const remove = (s: WarRoomSitRep) => {
		askConfirm({
			title: s.published
				? `Delete published SitRep v${s.version}?`
				: `Delete draft "${s.title}"?`,
			message: s.published
				? `"${s.title}" has been broadcast to the room's chat. Deleting removes the record entirely — this can't be undone.`
				: 'This removes the draft. It cannot be undone.',
			actionText: 'Delete',
			variant: 'destructive',
			run: () => doRemove(s)
		});
	};
</script>

<div class="grid h-full w-full grid-cols-[280px_minmax(0,1fr)] overflow-hidden">
	<aside class="flex flex-col border-r bg-card/30">
		<header class="flex items-center justify-between gap-2 border-b p-3">
			<h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				SitReps
			</h2>
			<Button size="icon" variant="ghost" class="h-6 w-6" onclick={() => (createOpen = true)}>
				<Plus class="h-3.5 w-3.5" />
			</Button>
		</header>

		<div class="flex-1 overflow-y-auto">
			{#if loading}
				<div class="flex flex-col gap-1 p-2">
					{#each Array(3) as _}
						<Skeleton class="h-10 w-full" />
					{/each}
				</div>
			{:else if sitreps.length === 0}
				<p class="p-3 text-xs text-muted-foreground">No SitReps yet.</p>
			{:else}
				<ul>
					{#each sitreps as s (s.sitrep_id)}
						{@const active = selectedId === s.sitrep_id}
						<li
							class={[
								'group flex items-start gap-2 px-3 py-2 transition-colors',
								active ? 'bg-primary/10' : 'hover:bg-muted/50'
							]}
						>
							<button
								type="button"
								class="flex flex-1 items-start gap-2 text-left"
								onclick={() => select(s.sitrep_id)}
							>
								{#if s.published}
									<FileLock class="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
								{:else}
									<FileText class="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
								{/if}
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium">{s.title}</p>
									<p class="text-2xs text-muted-foreground">
										v{s.version} · {s.published ? 'Published' : 'Draft'}
										{#if s.authored_at}
											· {new Date(s.authored_at).toLocaleDateString()}
										{/if}
									</p>
								</div>
							</button>
							<button
								type="button"
								class="opacity-0 transition-opacity group-hover:opacity-100"
								onclick={() => remove(s)}
								aria-label={s.published ? 'Delete SitRep' : 'Delete draft'}
							>
								<Trash2 class="h-3 w-3 text-destructive" />
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</aside>

	<div class="flex h-full min-h-0 flex-col">
		{#if !detail}
			<div class="flex h-full items-center justify-center text-sm text-muted-foreground">
				Select a SitRep or create a new draft.
			</div>
		{:else if detailLoading}
			<div class="m-4">
				<Skeleton class="h-32 w-full" />
			</div>
		{:else}
			<header class="flex items-center justify-between gap-2 border-b px-4 py-3">
				<div class="min-w-0">
					{#if editing}
						<Input
							value={editTitle}
							oninput={(e) => (editTitle = (e.target as HTMLInputElement).value)}
							class="h-8 text-base font-semibold"
						/>
					{:else}
						<h3 class="truncate text-base font-semibold">{detail.title}</h3>
					{/if}
					<p class="text-2xs text-muted-foreground">
						v{detail.version} ·
						{detail.published ? 'Published' : 'Draft'}
						{#if detail.authored_at}
							· {new Date(detail.authored_at).toLocaleString()}
						{/if}
					</p>
				</div>
				<div class="flex items-center gap-1">
					<a
						href={WarRoomSitRepsService.exportUrl(warRoomId, detail.sitrep_id, 'md')}
						class="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
						title="Download Markdown"
					>
						<Download class="h-3.5 w-3.5" />
						<span class="ml-1 text-2xs">MD</span>
					</a>
					<a
						href={WarRoomSitRepsService.exportUrl(warRoomId, detail.sitrep_id, 'html')}
						class="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
						title="Download HTML"
					>
						<Download class="h-3.5 w-3.5" />
						<span class="ml-1 text-2xs">HTML</span>
					</a>
					<a
						href={WarRoomSitRepsService.exportUrl(warRoomId, detail.sitrep_id, 'pdf')}
						class="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
						title="Download PDF"
					>
						<Download class="h-3.5 w-3.5" />
						<span class="ml-1 text-2xs">PDF</span>
					</a>
					<!--
					  Edit + save/cancel are always available: publishing is
					  a state marker, not a write-lock. Publish only shows
					  for drafts — a published SitRep can't be published
					  again, but it can still be edited or deleted.
					-->
					{#if editing}
						<Button size="sm" variant="ghost" onclick={cancelEdit} disabled={saving}>
							Cancel
						</Button>
						<Button size="sm" onclick={save} disabled={saving}>
							{saving ? 'Saving…' : 'Save'}
						</Button>
						{#if !detail.published}
							<Button size="sm" variant="default" onclick={publish} disabled={saving}>
								<Send class="mr-1 h-3.5 w-3.5" />
								Publish
							</Button>
						{/if}
					{:else}
						<Button size="sm" onclick={startEdit}>Edit</Button>
						{#if !detail.published}
							<Button size="sm" variant="default" onclick={publish} disabled={saving}>
								<Send class="mr-1 h-3.5 w-3.5" />
								Publish
							</Button>
						{/if}
						<Button
							size="sm"
							variant="ghost"
							class="text-destructive hover:text-destructive"
							onclick={() => detail && remove(detail)}
							disabled={saving}
							aria-label="Delete SitRep"
						>
							<Trash2 class="h-3.5 w-3.5" />
						</Button>
					{/if}
				</div>
			</header>

			<div class="flex-1 overflow-y-auto p-4">
				{#if editing}
					{#key detail.sitrep_id}
						<MarkDownEditor
							value={editBody}
							onChange={(v) => (editBody = v)}
							onSave={save}
							initialMode="edit"
						/>
					{/key}
				{:else}
					<MarkDownPreview markdown={detail.body_md ?? ''} />
				{/if}
			</div>
		{/if}
	</div>
</div>

<Dialog bind:open={createOpen}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>New SitRep draft</DialogTitle>
		</DialogHeader>
		<div class="py-2">
			<label class="text-xs font-medium text-muted-foreground" for="sitrep-title">
				Title
			</label>
			<Input
				id="sitrep-title"
				value={newTitle}
				oninput={(e) => (newTitle = (e.target as HTMLInputElement).value)}
				placeholder="e.g. Day 1 Situation Report"
				class="mt-1"
			/>
		</div>
		<DialogFooter>
			<Button variant="ghost" onclick={() => (createOpen = false)} disabled={saving}>
				Cancel
			</Button>
			<Button onclick={submitCreate} disabled={saving || !newTitle.trim()}>
				{saving ? 'Creating…' : 'Create draft'}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>

<ConfirmationDialog
	bind:open={confirmOpen}
	title={confirmTitle}
	message={confirmMessage}
	confirmText={confirmActionText}
	confirmButtonVariant={confirmVariant}
	onConfirm={runConfirmed}
	showIcon={confirmVariant === 'destructive'}
/>
