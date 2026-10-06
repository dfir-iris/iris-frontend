<script lang="ts">
	import { apiErrorMessage } from '$lib/utils/error-handler';
	import { formatDate, formatDateTime } from '$lib/utils/time-formatter';
	import { getContext, onMount } from 'svelte';
	import { page } from '$app/state';
	import { Plus, Trash2, Download, Send, FileText, FileLock, Sparkles, Timer } from 'lucide-svelte';
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
		type WarRoomSitRep,
		type WarRoomSitRepCadence,
		type WarRoomSitRepPublished
	} from '$lib/services/war-room-sitreps.service';
	import { USER_CTX, type UserCtx } from '$lib/contexts/user-context.context.svelte';
	import SitRepCadenceCard from './components/SitRepCadenceCard.svelte';
	import PublishSitRepDialog from './components/PublishSitRepDialog.svelte';
	import { describeDue, formatCadence } from './helpers/cadence';

	const warRoomId = $derived(Number(page.params.war_room_id));
	const userCtx = getContext<UserCtx>(USER_CTX);
	// New controls (auto-draft, cadence, share-on-publish) are gated on
	// war_rooms_write; the backend re-checks, incl. case access per share.
	const canWrite = $derived(userCtx?.can('war_rooms_write') === true);

	let cadence = $state<WarRoomSitRepCadence | null>(null);
	// Ticks so the "due in / overdue by" banner stays current.
	let now = $state(Date.now());
	const due = $derived(cadence?.cadence_minutes ? describeDue(cadence.next_due_at, now) : null);
	let drafting = $state(false);
	let publishOpen = $state(false);

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
			// `?sitrep=<id>&edit=1` deep-links a draft (the chat `/sitrep`
			// command lands here with the freshly opened draft).
			const linked = Number(page.url.searchParams.get('sitrep'));
			if (selectedId == null && sitreps.some((s) => s.sitrep_id === linked)) {
				selectedId = linked;
				editing = page.url.searchParams.get('edit') === '1';
			}
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

	const loadCadence = async () => {
		const res = await WarRoomSitRepsService.getCadence(warRoomId);
		if (res.ok && res.data && typeof res.data !== 'string') {
			cadence = res.data as WarRoomSitRepCadence;
		}
	};

	onMount(() => {
		load();
		loadCadence();
		const tick = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(tick);
	});

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
			adoptCreated(res.data as WarRoomSitRep);
			createOpen = false;
			newTitle = '';
		}
	};

	// A freshly created draft goes to the top of the list and opens in
	// edit mode.
	const adoptCreated = (next: WarRoomSitRep) => {
		sitreps = [next, ...sitreps];
		selectedId = next.sitrep_id;
		detail = next;
		editTitle = next.title;
		editBody = next.body_md ?? '';
		editing = true;
	};

	// Auto-draft: the backend renders the body from the live war-room
	// state (only cases the caller can read); we save it as a normal
	// draft through the existing create endpoint.
	const autoDraft = async () => {
		if (drafting) return;
		drafting = true;
		try {
			const gen = await WarRoomSitRepsService.autoDraft(warRoomId);
			if (!gen.ok || !gen.data || typeof gen.data === 'string') {
				toast({
					title: apiErrorMessage(gen, 'Could not generate a draft'),
					variant: 'destructive'
				});
				return;
			}
			const res = await WarRoomSitRepsService.create(warRoomId, {
				title: gen.data.title,
				body_md: gen.data.body_md
			});
			if (res.ok && res.data && typeof res.data !== 'string') {
				adoptCreated(res.data as WarRoomSitRep);
				toast({ title: 'Draft generated from the war room' });
			} else {
				toast({ title: apiErrorMessage(res, 'Could not save draft'), variant: 'destructive' });
			}
		} finally {
			drafting = false;
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

	// Publishing goes through its own dialog (optional share to cases);
	// it toasts and shows per-case results itself.
	const onPublished = (published: WarRoomSitRepPublished) => {
		const { shared: _shared, ...rest } = published;
		detail = rest as WarRoomSitRep;
		sitreps = sitreps.map((s) => (s.sitrep_id === detail!.sitrep_id ? detail! : s));
		editing = false;
		// Publishing resets the cadence clock.
		void loadCadence();
	};

	const publish = () => {
		if (!detail) return;
		publishOpen = true;
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
			title: s.published ? `Delete published SitRep v${s.version}?` : `Delete draft "${s.title}"?`,
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
			<h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">SitReps</h2>
			<div class="flex items-center gap-0.5">
				{#if canWrite}
					<Button
						size="icon"
						variant="ghost"
						class="h-6 w-6"
						onclick={autoDraft}
						disabled={drafting}
						aria-label="Auto-draft a SitRep from the war room"
						title="Auto-draft from the war room"
					>
						<Sparkles class="h-3.5 w-3.5" />
					</Button>
				{/if}
				<Button
					size="icon"
					variant="ghost"
					class="h-6 w-6"
					onclick={() => (createOpen = true)}
					aria-label="New SitRep draft"
					title="New blank draft"
				>
					<Plus class="h-3.5 w-3.5" />
				</Button>
			</div>
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
											· {formatDate(s.authored_at)}
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

		<SitRepCadenceCard {warRoomId} {cadence} {canWrite} onChange={(c) => (cadence = c)} />
	</aside>

	<div class="flex h-full min-h-0 flex-col">
		{#if due && cadence?.cadence_minutes}
			<div
				class="flex shrink-0 items-center gap-2 border-b px-4 py-1.5 text-xs {due.overdue
					? 'bg-destructive/10 text-destructive'
					: 'bg-amber-500/10 text-amber-700 dark:text-amber-300'}"
				role="status"
			>
				<Timer class="h-3.5 w-3.5 shrink-0" />
				<span class="font-medium">{due.label}</span>
				<span class="text-muted-foreground">
					· {formatCadence(cadence.cadence_minutes)}
					{#if cadence.next_due_at}
						· {formatDateTime(cadence.next_due_at)}
					{/if}
				</span>
				{#if canWrite}
					<Button
						size="sm"
						variant="ghost"
						class="ml-auto h-6 gap-1 px-2 text-xs"
						onclick={autoDraft}
						disabled={drafting}
					>
						<Sparkles class="h-3 w-3" />
						{drafting ? 'Drafting…' : 'Auto-draft'}
					</Button>
				{/if}
			</div>
		{/if}
		{#if !detail}
			<div
				class="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground"
			>
				Select a SitRep or create a new draft.
				{#if canWrite}
					<Button size="sm" variant="outline" onclick={autoDraft} disabled={drafting}>
						<Sparkles class="mr-1 h-3.5 w-3.5" />
						{drafting ? 'Drafting…' : 'Auto-draft from the war room'}
					</Button>
				{/if}
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
							· {formatDateTime(detail.authored_at)}
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
						<Button size="sm" variant="ghost" onclick={cancelEdit} disabled={saving}>Cancel</Button>
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
							collabMode="sitrep"
							sitrepId={detail.sitrep_id}
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
			<label class="text-xs font-medium text-muted-foreground" for="sitrep-title"> Title </label>
			<Input
				id="sitrep-title"
				value={newTitle}
				oninput={(e) => (newTitle = (e.target as HTMLInputElement).value)}
				placeholder="e.g. Day 1 Situation Report"
				class="mt-1"
			/>
		</div>
		<DialogFooter>
			<Button variant="ghost" onclick={() => (createOpen = false)} disabled={saving}>Cancel</Button>
			<Button onclick={submitCreate} disabled={saving || !newTitle.trim()}>
				{saving ? 'Creating…' : 'Create draft'}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>

<PublishSitRepDialog bind:open={publishOpen} {warRoomId} sitrep={detail} {onPublished} />

<ConfirmationDialog
	bind:open={confirmOpen}
	title={confirmTitle}
	message={confirmMessage}
	confirmText={confirmActionText}
	confirmButtonVariant={confirmVariant}
	onConfirm={runConfirmed}
	showIcon={confirmVariant === 'destructive'}
/>
