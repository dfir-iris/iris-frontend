<!--
  Share a war-room note (or every note under a folder) with the cases
  attached to the room. Top: the shares that already exist for the
  item, with per-target sync status and edit / resync / remove. Below:
  the form (scope, include-future, delivery) next to a live preview of
  what lands in the cases, with a warning when the targets span more
  than one customer. The backend is authoritative for access: targets
  the caller cannot read come back as `accessible: false` and are
  rendered without a name.
-->
<script lang="ts">
	import { apiErrorMessage } from '$lib/utils/error-handler';
	import {
		CheckIcon,
		CopyIcon,
		FileLockIcon,
		FolderOpenIcon,
		LockIcon,
		PencilIcon,
		RefreshCwIcon,
		RotateCwIcon,
		Share2Icon,
		ShieldAlertIcon,
		Trash2Icon,
		TriangleAlertIcon,
		XIcon
	} from 'lucide-svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Switch } from '$lib/components/ui/switch';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from '$lib/components/ui/toast';
	import { formatDateTime } from '$lib/utils/time-formatter';
	import { WarRoomsService, type WarRoomCaseAttachment } from '$lib/services/war-rooms.service';
	import {
		WarRoomNoteSharesService,
		type NoteShare,
		type NoteShareDelivery,
		type NoteSharePreview,
		type NoteShareScope,
		type NoteShareTarget
	} from '$lib/services/war-room-note-shares.service';
	import type { NoteShareDialogTarget } from '../note-shares.svelte';

	type Props = {
		open: boolean;
		warRoomId: number;
		warRoomName?: string | null;
		target: NoteShareDialogTarget | null;
		canEdit: boolean;
		/** Fires after any create / update / remove / resync. */
		onChanged?: () => void;
	};

	let {
		open = $bindable(false),
		warRoomId,
		warRoomName = null,
		target,
		canEdit,
		onChanged
	}: Props = $props();

	const folderName = $derived(`War room · ${warRoomName ?? `#${warRoomId}`}`);

	let attachments = $state<WarRoomCaseAttachment[]>([]);
	let existing = $state<NoteShare[]>([]);
	let loading = $state(false);

	let editingShareId = $state<number | null>(null);
	let scope = $state<NoteShareScope>('all');
	let selectedCaseIds = $state<Set<number>>(new Set());
	let includeFuture = $state(true);
	let delivery = $state<NoteShareDelivery>('mirror');
	let saving = $state(false);
	let busyShareId = $state<number | null>(null);

	let preview = $state<NoteSharePreview | null>(null);
	let previewLoading = $state(false);
	let previewTimer: ReturnType<typeof setTimeout> | undefined;
	let previewSeq = 0;

	let confirmRemoveOpen = $state(false);
	let pendingRemove = $state<NoteShare | null>(null);

	const targetBody = $derived.by(() => {
		if (!target) return {};
		return target.kind === 'note' ? { note_id: target.id } : { folder_id: target.id };
	});

	const resetForm = () => {
		editingShareId = null;
		scope = 'all';
		selectedCaseIds = new Set();
		includeFuture = true;
		delivery = 'mirror';
	};

	const loadExisting = async () => {
		if (!target) return;
		const res = await WarRoomNoteSharesService.list(warRoomId, targetBody);
		if (res.ok && Array.isArray(res.data)) existing = res.data;
	};

	const loadAll = async () => {
		loading = true;
		const [casesRes] = await Promise.all([WarRoomsService.listCases(warRoomId), loadExisting()]);
		attachments = casesRes.ok && Array.isArray(casesRes.data) ? casesRes.data : [];
		loading = false;
	};

	// (Re)initialise every time the dialog opens on a target.
	let initialisedFor = $state<string | null>(null);
	$effect(() => {
		if (!open || !target) {
			initialisedFor = null;
			return;
		}
		const key = `${target.kind}:${target.id}`;
		if (initialisedFor === key) return;
		initialisedFor = key;
		existing = [];
		preview = null;
		resetForm();
		void loadAll();
	});

	const chosenCaseIds = $derived(
		scope === 'all' ? attachments.map((a) => a.case_id) : [...selectedCaseIds]
	);

	const formValid = $derived(scope === 'all' || selectedCaseIds.size > 0);

	// Debounced preview, re-run whenever the form changes.
	$effect(() => {
		const ready = open && !!target && formValid;
		const params = {
			...targetBody,
			scope,
			case_ids: scope === 'cases' ? [...selectedCaseIds] : undefined
		};
		clearTimeout(previewTimer);
		if (!ready) {
			preview = null;
			previewLoading = false;
			return;
		}
		previewLoading = true;
		const seq = ++previewSeq;
		previewTimer = setTimeout(async () => {
			const res = await WarRoomNoteSharesService.preview(warRoomId, params);
			if (seq !== previewSeq) return;
			preview = res.ok && res.data && typeof res.data !== 'string' ? res.data : null;
			previewLoading = false;
		}, 250);
		return () => clearTimeout(previewTimer);
	});

	// Prefer the server's customer list; fall back to the attachments
	// we already have when the preview call failed.
	const customers = $derived.by(() => {
		if (preview) return preview.customers.map((c) => c.customer_name);
		const set = new Set<string>();
		for (const a of attachments) {
			if (chosenCaseIds.includes(a.case_id) && a.customer_name) set.add(a.customer_name);
		}
		return [...set];
	});

	const targetCount = $derived(preview ? preview.targets.length : chosenCaseIds.length);
	const noteCount = $derived(preview ? preview.notes.length : target?.kind === 'note' ? 1 : 0);

	const toggleCase = (caseId: number) => {
		const next = new Set(selectedCaseIds);
		if (next.has(caseId)) next.delete(caseId);
		else next.add(caseId);
		selectedCaseIds = next;
	};

	const startEdit = (share: NoteShare) => {
		editingShareId = share.share_id;
		scope = share.scope;
		selectedCaseIds = new Set(share.case_ids ?? []);
		includeFuture = share.include_future;
		delivery = share.delivery;
	};

	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

	const save = async () => {
		if (!target || !canEdit || !formValid || saving) return;
		saving = true;
		const caseIds = scope === 'cases' ? [...selectedCaseIds] : undefined;
		const res =
			editingShareId !== null
				? await WarRoomNoteSharesService.update(warRoomId, editingShareId, {
						scope,
						case_ids: caseIds,
						include_future: includeFuture
					})
				: await WarRoomNoteSharesService.create(warRoomId, {
						...targetBody,
						scope,
						case_ids: caseIds,
						include_future: includeFuture,
						delivery
					});
		saving = false;

		if (!res.ok || !res.data || typeof res.data === 'string') {
			toast({
				title: editingShareId !== null ? 'Could not update sharing' : 'Could not share',
				description: apiErrorMessage(res, 'The server refused the request.'),
				variant: 'destructive'
			});
			return;
		}

		const n = res.data.targets?.length ?? targetCount;
		toast({
			title:
				editingShareId !== null
					? 'Sharing updated'
					: res.data.delivery === 'copy'
						? `Copied into ${plural(n, 'case')}`
						: `Shared with ${plural(n, 'case')}`,
			description:
				res.data.delivery === 'copy'
					? `Editable copies were added under “${folderName}”.`
					: `Read-only mirrors live under “${folderName}”.`,
			variant: 'success'
		});
		onChanged?.();
		open = false;
	};

	const resync = async (share: NoteShare) => {
		busyShareId = share.share_id;
		const res = await WarRoomNoteSharesService.resync(warRoomId, share.share_id);
		busyShareId = null;
		if (res.ok && res.data && typeof res.data !== 'string') {
			const fresh = res.data;
			existing = existing.map((s) => (s.share_id === fresh.share_id ? fresh : s));
			toast({ title: 'Synced', description: 'Mirrors updated in every case.', variant: 'success' });
			onChanged?.();
		} else {
			toast({
				title: 'Could not resync',
				description: apiErrorMessage(res, 'The server refused the request.'),
				variant: 'destructive'
			});
		}
	};

	const askRemove = (share: NoteShare) => {
		pendingRemove = share;
		confirmRemoveOpen = true;
	};

	const runRemove = async () => {
		const share = pendingRemove;
		pendingRemove = null;
		if (!share) return;
		busyShareId = share.share_id;
		const res = await WarRoomNoteSharesService.remove(warRoomId, share.share_id);
		busyShareId = null;
		if (res.ok) {
			existing = existing.filter((s) => s.share_id !== share.share_id);
			if (editingShareId === share.share_id) resetForm();
			toast({
				title: 'Sharing removed',
				description:
					share.delivery === 'mirror'
						? 'Mirrors were removed from the cases.'
						: 'Copies already made stay in the cases.',
				variant: 'success'
			});
			onChanged?.();
		} else {
			toast({
				title: 'Could not remove sharing',
				description: apiErrorMessage(res, 'The server refused the request.'),
				variant: 'destructive'
			});
		}
	};

	const scopeLabel = (share: NoteShare) =>
		share.scope === 'all'
			? `All attached cases${share.include_future ? ' (incl. future)' : ''}`
			: `${plural(share.case_ids?.length ?? share.targets.length, 'selected case')}${share.include_future ? ' (+ future)' : ''}`;

	const statusClass = (t: NoteShareTarget) => {
		switch (t.status) {
			case 'synced':
			case 'copied':
				return 'text-emerald-700 dark:text-emerald-400';
			case 'pending':
				return 'text-amber-700 dark:text-amber-300';
			default:
				return 'text-red-600 dark:text-red-400';
		}
	};

	const targetHref = (t: NoteShareTarget) =>
		t.accessible
			? t.mirror_note_id
				? `/case/${t.case_id}/notes/${t.mirror_note_id}`
				: `/case/${t.case_id}/notes`
			: undefined;
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		class="flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0"
	>
		<Dialog.Header class="shrink-0 border-b px-6 py-4">
			<Dialog.Title class="text-lg font-semibold leading-none tracking-tight">
				Share {target
					? target.kind === 'folder'
						? `folder “${target.label}”`
						: `“${target.label}”`
					: ''}
			</Dialog.Title>
			<Dialog.Description class="mt-1.5 text-sm text-muted-foreground">
				Shared notes appear in each case under
				<span class="font-medium text-foreground">
					Notes ›
					<ShieldAlertIcon class="inline size-3.5 text-red-600" aria-hidden="true" />
					{folderName}</span
				>.
			</Dialog.Description>
		</Dialog.Header>

		<div class="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
			<!-- Existing shares for this item -->
			{#if loading && existing.length === 0}
				<div class="space-y-2 border-b px-6 py-4">
					<Skeleton class="h-10 w-full" />
				</div>
			{:else if existing.length > 0}
				<section class="border-b px-6 py-4" aria-label="Current sharing">
					<p class="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
						Current sharing
					</p>
					<ul class="space-y-2">
						{#each existing as share (share.share_id)}
							<li
								class={[
									'rounded-lg border px-3 py-2',
									editingShareId === share.share_id ? 'border-primary bg-primary/5' : 'bg-muted/30'
								]}
								data-testid="note-share-row"
							>
								<div class="flex flex-wrap items-center gap-2 text-xs">
									{#if share.delivery === 'mirror'}
										<Share2Icon class="size-3.5 text-primary" aria-hidden="true" />
									{:else}
										<CopyIcon class="size-3.5 text-muted-foreground" aria-hidden="true" />
									{/if}
									<span class="font-medium">{scopeLabel(share)}</span>
									<span class="text-muted-foreground">
										· {share.delivery === 'mirror'
											? 'live mirror, read-only in cases'
											: 'one-time copy'}
									</span>
									{#if share.created_by_name || share.created_at}
										<span class="text-muted-foreground">
											· {share.created_by_name ?? ''}
											{share.created_at ? formatDateTime(share.created_at) : ''}
										</span>
									{/if}

									{#if canEdit}
										<div class="ml-auto flex items-center gap-1">
											{#if share.delivery === 'mirror'}
												<Button
													variant="ghost"
													size="xs"
													class="h-6 gap-1 px-1.5"
													disabled={busyShareId === share.share_id}
													onclick={() => startEdit(share)}
													aria-label="Edit sharing"
												>
													<PencilIcon class="size-3" />Edit
												</Button>
												<Button
													variant="ghost"
													size="xs"
													class="h-6 gap-1 px-1.5"
													disabled={busyShareId === share.share_id}
													onclick={() => resync(share)}
													aria-label="Resync mirrors"
												>
													<RotateCwIcon
														class="size-3 {busyShareId === share.share_id ? 'animate-spin' : ''}"
													/>Resync
												</Button>
											{/if}
											<Button
												variant="ghost"
												size="xs"
												class="h-6 gap-1 px-1.5 text-red-600 hover:text-red-700"
												disabled={busyShareId === share.share_id}
												onclick={() => askRemove(share)}
												aria-label="Remove sharing"
											>
												<Trash2Icon class="size-3" />Remove
											</Button>
										</div>
									{/if}
								</div>

								{#if share.targets.length > 0}
									<div class="mt-2 flex flex-wrap gap-1.5">
										{#each share.targets as t (t.case_id)}
											{@const href = targetHref(t)}
											<svelte:element
												this={href ? 'a' : 'span'}
												{href}
												class="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-2xs transition-colors {href
													? 'hover:bg-muted'
													: ''}"
												title={t.accessible
													? (t.customer_name ?? undefined)
													: 'No access to this case'}
											>
												<span class="font-mono text-muted-foreground">#{t.case_id}</span>
												{#if t.accessible}
													<span class="max-w-40 truncate">{t.case_name ?? ''}</span>
												{:else}
													<LockIcon class="size-3 text-muted-foreground" aria-label="restricted" />
												{/if}
												<span class="inline-flex items-center gap-0.5 {statusClass(t)}">
													{#if t.status === 'pending'}
														<RefreshCwIcon class="size-2.5" aria-hidden="true" />
													{:else if t.status === 'error'}
														<XIcon class="size-2.5" aria-hidden="true" />
													{:else}
														<CheckIcon class="size-2.5" aria-hidden="true" />
													{/if}
													{t.status}
												</span>
											</svelte:element>
										{/each}
									</div>
								{/if}
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			<!-- Form + preview -->
			<!-- minmax(0, …): long case names must truncate, not widen the grid. -->
			<div class="grid gap-5 px-6 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,15rem)]">
				<div class="grid min-w-0 content-start gap-2">
					<div class="flex items-center justify-between">
						<p
							id="note-share-scope-label"
							class="text-2xs font-semibold uppercase tracking-wider text-muted-foreground"
						>
							{editingShareId !== null ? 'Edit sharing · visible in' : 'New sharing · visible in'}
						</p>
						{#if editingShareId !== null}
							<button
								type="button"
								class="text-2xs font-medium text-primary hover:underline"
								onclick={resetForm}
							>
								New share instead
							</button>
						{/if}
					</div>

					<div role="radiogroup" aria-labelledby="note-share-scope-label" class="grid gap-2">
						{@render radio(
							scope === 'all',
							() => (scope = 'all'),
							'All attached cases',
							`${plural(attachments.length, 'case')} today`,
							!canEdit
						)}
						{#if scope === 'all'}
							{@render futureToggle()}
						{/if}

						{@render radio(
							scope === 'cases',
							() => (scope = 'cases'),
							'Selected cases',
							'Pick per case.',
							!canEdit
						)}
						{#if scope === 'cases'}
							<div class="ml-6 grid gap-1 rounded-md border bg-muted/20 p-1.5">
								{#if attachments.length === 0}
									<p class="px-2 py-1.5 text-xs text-muted-foreground">
										No case is attached to this war room.
									</p>
								{/if}
								{#each attachments as a (a.case_id)}
									<label
										class="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/60"
									>
										<Checkbox
											checked={selectedCaseIds.has(a.case_id)}
											onCheckedChange={() => toggleCase(a.case_id)}
											disabled={!canEdit}
											aria-label={`Share with case #${a.case_id}`}
										/>
										<span class="font-mono text-xs text-muted-foreground">#{a.case_id}</span>
										<span class="min-w-0 flex-1 truncate">{a.case_name}</span>
										<span class="max-w-[8rem] shrink-0 truncate text-2xs text-muted-foreground"
											>{a.customer_name ?? ''}</span
										>
									</label>
								{/each}
							</div>
							{@render futureToggle()}
						{/if}
					</div>

					<p
						id="note-share-delivery-label"
						class="mt-3 text-2xs font-semibold uppercase tracking-wider text-muted-foreground"
					>
						How
					</p>
					<div role="radiogroup" aria-labelledby="note-share-delivery-label" class="grid gap-2">
						{@render radio(
							delivery === 'mirror',
							() => (delivery = 'mirror'),
							'Live mirror',
							'Read-only in cases; every save here updates them.',
							!canEdit || editingShareId !== null
						)}
						{@render radio(
							delivery === 'copy',
							() => (delivery = 'copy'),
							'One-time copy',
							'Cases get an editable copy, no further sync.',
							!canEdit || editingShareId !== null
						)}
					</div>

					{#if customers.length > 1}
						<div
							class="mt-1 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
							role="alert"
						>
							<TriangleAlertIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
							<span>
								Members of <b>{customers.length} customers</b> ({customers.join(', ')}) will read
								this. Check for customer-specific details before sharing.
							</span>
						</div>
					{/if}
				</div>

				<div class="grid min-w-0 content-start gap-2">
					<p class="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
						Preview in case
					</p>
					{#if previewLoading && !preview}
						<Skeleton class="h-28 w-full" />
					{:else if !formValid || targetCount === 0}
						<p
							class="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground"
						>
							{formValid ? 'No attached case to share with' : 'Select at least one case'}
						</p>
					{:else}
						<div
							class="min-w-0 overflow-hidden rounded-md border bg-card p-2 text-sm"
							aria-live="polite"
						>
							<p class="flex items-center gap-1.5 px-1 py-1 text-xs text-muted-foreground">
								<span class="font-mono">#{preview?.targets[0]?.case_id ?? chosenCaseIds[0]}</span>
								Notes
							</p>
							<div class="flex h-8 items-center gap-1.5 rounded-lg px-2 font-medium">
								<FolderOpenIcon class="size-4 shrink-0 text-red-600" aria-hidden="true" />
								<span class="truncate">{folderName}</span>
							</div>
							<div class="ml-2 border-l border-border/60 pl-1">
								{#if preview && preview.notes.length > 0}
									{#each preview.notes.slice(0, 8) as n (n.note_id)}
										<div class="flex h-8 items-center gap-1.5 rounded-lg px-2">
											<FileLockIcon
												class="size-4 shrink-0 text-muted-foreground"
												aria-hidden="true"
											/>
											<span class="truncate">{n.title}</span>
										</div>
									{/each}
									{#if preview.notes.length > 8}
										<p class="px-2 text-2xs text-muted-foreground">
											+ {preview.notes.length - 8} more notes
										</p>
									{/if}
								{:else if target?.kind === 'note'}
									<div class="flex h-8 items-center gap-1.5 rounded-lg px-2">
										<FileLockIcon
											class="size-4 shrink-0 text-muted-foreground"
											aria-hidden="true"
										/>
										<span class="truncate">{target.label}</span>
									</div>
								{:else}
									<p class="px-2 py-1 text-2xs text-muted-foreground">No note in this folder yet</p>
								{/if}
							</div>
						</div>
						{#if targetCount > 1}
							<p class="text-2xs text-muted-foreground">+ {plural(targetCount - 1, 'more case')}</p>
						{/if}
					{/if}
				</div>
			</div>
		</div>

		<div class="flex shrink-0 items-center justify-between gap-2 border-t px-6 py-3">
			<span class="text-xs text-muted-foreground">
				{#if formValid && targetCount > 0}
					{plural(noteCount, 'note')} → {plural(targetCount, 'case')}
				{/if}
			</span>
			<div class="flex gap-2">
				<Button variant="outline" size="sm" onclick={() => (open = false)}>Cancel</Button>
				{#if canEdit}
					<Button
						size="sm"
						class="gap-1.5"
						disabled={!formValid || saving || targetCount === 0}
						onclick={save}
					>
						<Share2Icon class="size-3.5" />
						{saving ? 'Saving…' : editingShareId !== null ? 'Update sharing' : 'Save sharing'}
					</Button>
				{/if}
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>

<ConfirmationDialog
	bind:open={confirmRemoveOpen}
	title="Remove sharing?"
	message={pendingRemove?.delivery === 'mirror'
		? 'The read-only mirrors are removed from every target case.'
		: 'The share record is removed. Copies already made stay in the cases.'}
	confirmText="Remove"
	onConfirm={runRemove}
	onCancel={() => (pendingRemove = null)}
/>

{#snippet radio(
	checked: boolean,
	select: () => void,
	title: string,
	sub: string,
	disabled: boolean
)}
	<button
		type="button"
		role="radio"
		aria-checked={checked}
		{disabled}
		onclick={select}
		class={[
			'flex w-full items-start gap-2.5 rounded-md border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
			checked ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
		]}
	>
		<span
			class={[
				'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
				checked ? 'border-primary' : 'border-input'
			]}
		>
			{#if checked}<span class="size-2 rounded-full bg-primary"></span>{/if}
		</span>
		<span class="min-w-0">
			<span class="block text-sm font-medium">{title}</span>
			<span class="block text-xs text-muted-foreground">{sub}</span>
		</span>
	</button>
{/snippet}

{#snippet futureToggle()}
	<label
		class="ml-6 flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
		for="note-share-include-future"
	>
		<span>
			<span class="block font-medium">Include cases attached later</span>
			<span class="block text-xs text-muted-foreground">
				{scope === 'all'
					? 'New cases joining the war room get the note too'
					: 'Cases attached later are added to this list'}
			</span>
		</span>
		<Switch
			id="note-share-include-future"
			checked={includeFuture}
			onCheckedChange={(v: boolean) => (includeFuture = v)}
			disabled={!canEdit}
		/>
	</label>
{/snippet}
