<!--
  War-room note revisions browser. Mirror of the case-notes dialog —
  same UX (left rail of revisions, right pane with preview + restore
  button) with API + field names adapted to the war-room shape.
-->
<script lang="ts">
	import { getContext } from 'svelte';
	import { ClockIcon, RotateCcwIcon, Trash2Icon } from 'lucide-svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { MarkDownPreview } from '$lib/components/common/MarkDown';
	import UserAvatar from '$lib/components/common/UserAvatar.svelte';
	import { toast } from '$lib/stores/toast.store';
	import {
		WAR_ROOM_NOTES_CTX,
		type WarRoomNotesContext
	} from '$lib/contexts/war-room-notes.context.svelte';
	import {
		WarRoomNotesService,
		type WarRoomNote,
		type WarRoomNoteRevision,
		type WarRoomNoteRevisionSummary
	} from '$lib/services/war-room-notes.service';
	import { mediumDateTimeFormatter } from '$lib/utils/time-formatter';

	type Props = {
		open: boolean;
		onClose: () => void;
		/** Fires after a successful restore so the detail view can reset
		 *  the editor's draft to the freshly-restored content. */
		onRestored?: (note: WarRoomNote) => void;
		warRoomId: number;
		note?: WarRoomNote;
	};

	let { open = $bindable(), onClose, onRestored, warRoomId, note }: Props = $props();

	const notes = getContext<WarRoomNotesContext>(WAR_ROOM_NOTES_CTX);

	let revisions = $state<WarRoomNoteRevisionSummary[]>([]);
	let loadingList = $state(false);
	let loadingRevision = $state(false);
	let selectedNumber = $state<number | null>(null);
	let selectedRevision = $state<WarRoomNoteRevision | null>(null);
	let restoring = $state(false);
	let deletingNumber = $state<number | null>(null);

	const loadList = async () => {
		if (!note) return;
		loadingList = true;
		const res = await WarRoomNotesService.listRevisions(warRoomId, note.note_id);
		loadingList = false;

		if (res.ok && Array.isArray(res.data)) {
			revisions = res.data as WarRoomNoteRevisionSummary[];
			if (revisions.length > 0 && selectedNumber == null) {
				selectedNumber = revisions[0].revision_number;
				void loadRevision(selectedNumber);
			} else if (revisions.length === 0) {
				selectedNumber = null;
				selectedRevision = null;
			}
		} else {
			revisions = [];
			selectedNumber = null;
			selectedRevision = null;
			toast({
				title: 'Could not load revisions',
				description: res.error?.message,
				variant: 'destructive'
			});
		}
	};

	const loadRevision = async (revisionNumber: number) => {
		if (!note) return;
		loadingRevision = true;
		const res = await WarRoomNotesService.getRevision(warRoomId, note.note_id, revisionNumber);
		loadingRevision = false;

		if (res.ok && res.data && typeof res.data !== 'string') {
			selectedRevision = res.data as WarRoomNoteRevision;
		} else {
			selectedRevision = null;
			toast({
				title: 'Could not load revision',
				description: res.error?.message,
				variant: 'destructive'
			});
		}
	};

	const pickRevision = (revisionNumber: number) => {
		if (selectedNumber === revisionNumber) return;
		selectedNumber = revisionNumber;
		void loadRevision(revisionNumber);
	};

	const restore = async () => {
		if (!note || selectedNumber == null) return;
		if (
			!confirm(
				`Restore note to revision ${selectedNumber}? The current content is snapshotted as a new revision before the rollback, so this is reversible.`
			)
		)
			return;

		restoring = true;
		const res = await WarRoomNotesService.restoreRevision(warRoomId, note.note_id, selectedNumber);
		restoring = false;

		if (res.ok) {
			toast({ title: `Restored to revision ${selectedNumber}`, variant: 'success' });
			const fresh = await notes.getNote(note.note_id);
			if (fresh) onRestored?.(fresh);
			await loadList();
		} else {
			toast({
				title: 'Restore failed',
				description: res.error?.message,
				variant: 'destructive'
			});
		}
	};

	const remove = async (revisionNumber: number) => {
		if (!note) return;
		if (!confirm(`Delete revision ${revisionNumber}? This cannot be undone.`)) return;

		deletingNumber = revisionNumber;
		const res = await WarRoomNotesService.deleteRevision(warRoomId, note.note_id, revisionNumber);
		deletingNumber = null;

		if (res.ok) {
			if (selectedNumber === revisionNumber) {
				selectedNumber = null;
				selectedRevision = null;
			}
			await loadList();
		} else {
			toast({
				title: 'Delete failed',
				description: res.error?.message,
				variant: 'destructive'
			});
		}
	};

	$effect(() => {
		if (open && note) void loadList();
		if (!open) {
			revisions = [];
			selectedNumber = null;
			selectedRevision = null;
		}
	});
</script>

<Dialog.Root
	bind:open
	onOpenChange={(next) => {
		if (!next) onClose();
	}}
>
	<Dialog.Content
		class="flex h-[80vh] max-h-[80vh] w-[min(1100px,95vw)] max-w-none flex-col gap-0 p-0"
	>
		<Dialog.Header class="shrink-0 border-b border-border/60 px-6 py-4">
			<Dialog.Title class="flex items-center gap-2 text-base font-medium">
				<ClockIcon class="size-4 text-muted-foreground" />
				<span>Note revisions</span>
				{#if note}
					<span class="truncate text-sm font-normal text-muted-foreground">
						· {note.title || `Note #${note.note_id}`}
					</span>
				{/if}
			</Dialog.Title>
		</Dialog.Header>

		<div class="flex min-h-0 flex-1 overflow-hidden">
			<aside class="flex w-80 shrink-0 flex-col border-r border-border/40">
				<div
					class="border-b border-border/30 px-4 py-2 text-2xs uppercase tracking-wider text-muted-foreground"
				>
					{revisions.length}
					{revisions.length === 1 ? 'revision' : 'revisions'}
				</div>
				<div class="min-h-0 flex-1 overflow-y-auto">
					{#if loadingList && revisions.length === 0}
						<div class="flex flex-col gap-2 p-3">
							{#each Array(4) as _, i (i)}
								<Skeleton class="h-12 w-full" />
							{/each}
						</div>
					{:else if revisions.length === 0}
						<p class="px-4 py-6 text-center text-xs text-muted-foreground">
							No older revisions yet. Every edit creates a new snapshot.
						</p>
					{:else}
						<ul class="flex flex-col">
							{#each revisions as rev (rev.revision_number)}
								<li
									class={`flex w-full cursor-pointer items-start gap-2 border-l-2 px-3 py-2 text-left transition-colors hover:bg-muted/40 ${selectedNumber === rev.revision_number ? 'border-primary bg-muted/50' : 'border-transparent'}`}
									role="button"
									tabindex="0"
									onclick={() => pickRevision(rev.revision_number)}
									onkeydown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											pickRevision(rev.revision_number);
										}
									}}
								>
									<UserAvatar
										userId={null}
										name={rev.user_name ?? ''}
										size="size-7"
										class="mt-0.5"
									/>
									<div class="min-w-0 flex-1">
										<div class="flex items-center justify-between gap-1">
											<span class="text-xs font-semibold">v{rev.revision_number}</span>
											<button
												type="button"
												class="rounded p-0.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive disabled:opacity-50"
												disabled={deletingNumber === rev.revision_number}
												onclick={(e) => {
													e.stopPropagation();
													void remove(rev.revision_number);
												}}
												aria-label={`Delete revision ${rev.revision_number}`}
											>
												<Trash2Icon class="size-3" />
											</button>
										</div>
										<div class="truncate text-2xs text-muted-foreground">
											{rev.user_name}
										</div>
										{#if rev.revised_at}
											<div class="text-2xs text-muted-foreground">
												{mediumDateTimeFormatter(new Date(rev.revised_at))}
											</div>
										{/if}
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</aside>

			<section class="flex min-w-0 flex-1 flex-col">
				<header
					class="flex shrink-0 items-center justify-between gap-2 border-b border-border/40 px-6 py-3"
				>
					<div class="min-w-0 flex-1">
						{#if loadingRevision}
							<Skeleton class="h-5 w-1/2" />
						{:else if selectedRevision}
							<div class="text-sm font-semibold">
								{selectedRevision.title || 'Untitled'}
							</div>
							<div class="text-2xs text-muted-foreground">
								Revision {selectedRevision.revision_number}
								{#if selectedRevision.revised_at}
									· {mediumDateTimeFormatter(new Date(selectedRevision.revised_at))}
								{/if}
							</div>
						{:else}
							<div class="text-sm text-muted-foreground">
								Pick a revision on the left to preview it.
							</div>
						{/if}
					</div>

					{#if selectedRevision}
						<Button onclick={restore} disabled={restoring} class="gap-1">
							<RotateCcwIcon class="size-3.5" />
							{restoring ? 'Restoring…' : 'Restore this revision'}
						</Button>
					{/if}
				</header>

				<div class="min-h-0 flex-1 overflow-y-auto px-6 py-4">
					{#if loadingRevision && !selectedRevision}
						<div class="flex flex-col gap-2">
							<Skeleton class="h-4 w-full" />
							<Skeleton class="h-4 w-5/6" />
							<Skeleton class="h-4 w-2/3" />
							<Skeleton class="h-4 w-3/4" />
						</div>
					{:else if selectedRevision}
						<MarkDownPreview markdown={selectedRevision.content ?? ''} />
					{:else if revisions.length > 0}
						<p class="text-sm text-muted-foreground">No revision selected.</p>
					{/if}
				</div>
			</section>
		</div>
	</Dialog.Content>
</Dialog.Root>
