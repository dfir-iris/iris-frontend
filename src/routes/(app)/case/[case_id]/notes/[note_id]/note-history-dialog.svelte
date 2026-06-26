<!--
  Note revisions browser.

  Every successful PUT /notes/<id> snapshots the previous title +
  body as a `NoteRevision` on the backend. This dialog surfaces that
  list, lets the user peek at an older revision's content and (when
  they have write access on the case) restore it as the live version.

  The legacy iris-web v2.4.x UI had this; it was missing from the
  current SPA which only showed the in-row `modification_history`
  audit trail. Mention chips and inline images that were valid at
  revision N may not resolve in the preview today — that's
  intentional, the bytes are exactly what was saved at the time so
  users can see what content was there.
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
	import { CASE_NOTES_CTX, type CaseNotesContext } from '$lib/contexts/case-notes.context.svelte';
	import {
		CaseNotesService,
		type NoteRevision,
		type NoteRevisionSummary
	} from '$lib/services/case-notes.service';
	import type { Note } from '$lib/types/resources/note';
	import { mediumDateTimeFormatter } from '$lib/utils/time-formatter';

	type Props = {
		open: boolean;
		onClose: () => void;
		/** Fires after a successful restore so the surrounding
		 *  detail view can reset the markdown editor's draft to
		 *  the freshly-restored content (otherwise the editor
		 *  would still show whatever was in the textarea before
		 *  the rollback). */
		onRestored?: (note: Note) => void;
		caseId: number;
		note?: Note;
	};

	let { open = $bindable(), onClose, onRestored, caseId, note }: Props = $props();

	const notes = getContext<CaseNotesContext>(CASE_NOTES_CTX);

	let revisions = $state<NoteRevisionSummary[]>([]);
	let loadingList = $state(false);
	let loadingRevision = $state(false);
	let selectedNumber = $state<number | null>(null);
	let selectedRevision = $state<NoteRevision | null>(null);
	let restoring = $state(false);
	let deletingNumber = $state<number | null>(null);

	const loadList = async () => {
		if (!note) return;
		loadingList = true;
		const res = await CaseNotesService.listRevisions(caseId, note.note_id);
		loadingList = false;

		if (res.ok && Array.isArray(res.data)) {
			revisions = res.data as NoteRevisionSummary[];
			// Default to the most recent revision so the user lands on
			// something useful instead of an empty preview pane.
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
		const res = await CaseNotesService.getRevision(caseId, note.note_id, revisionNumber);
		loadingRevision = false;

		if (res.ok && res.data && typeof res.data !== 'string') {
			selectedRevision = res.data as NoteRevision;
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
		const res = await CaseNotesService.restoreRevision(caseId, note.note_id, selectedNumber);
		restoring = false;

		if (res.ok) {
			toast({ title: `Restored to revision ${selectedNumber}`, variant: 'success' });
			// Re-fetch the note through the case-notes context so the
			// detail view's `notes.byId[id]` flips to the new content;
			// then notify the caller so it can re-seed the markdown
			// editor's draft from the new content.
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
		const res = await CaseNotesService.deleteRevision(caseId, note.note_id, revisionNumber);
		deletingNumber = null;

		if (res.ok) {
			// Clear the selection if we just nuked the row the preview
			// pane was pointing at; the upcoming reload will re-pick
			// the next-most-recent.
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
			// Drop in-memory state when the dialog closes so a later
			// reopen against a different note doesn't briefly show
			// stale rows.
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
	<Dialog.Content class="flex h-[80vh] max-h-[80vh] w-[min(1100px,95vw)] max-w-none flex-col gap-0 p-0">
		<Dialog.Header class="shrink-0 border-b border-border/60 px-6 py-4">
			<Dialog.Title class="flex items-center gap-2 text-base font-medium">
				<ClockIcon class="size-4 text-muted-foreground" />
				<span>Note revisions</span>
				{#if note}
					<span class="truncate text-sm font-normal text-muted-foreground">
						· {note.note_title || `Note #${note.note_id}`}
					</span>
				{/if}
			</Dialog.Title>
		</Dialog.Header>

		<div class="flex min-h-0 flex-1 overflow-hidden">
			<!--
			  Left rail: revision list. Sticky-newest by default; the
			  backend orders by `revision_number DESC` so the row at the
			  top is the most recent snapshot taken *before* the current
			  live content (which is not itself a revision).
			-->
			<aside class="flex w-80 shrink-0 flex-col border-r border-border/40">
				<div class="border-b border-border/30 px-4 py-2 text-2xs uppercase tracking-wider text-muted-foreground">
					{revisions.length} {revisions.length === 1 ? 'revision' : 'revisions'}
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
								<!--
								  Picker row is a flex container (not a
								  `<button>`) so we can nest the inline
								  "delete revision" button inside it
								  without HTML invalidity. Click handling
								  is wired via `onclick` + role=button so
								  keyboard users still get the same
								  behaviour.
								-->
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
										name={rev.user_name}
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
										<div class="text-2xs text-muted-foreground">
											{mediumDateTimeFormatter(new Date(rev.revision_timestamp))}
										</div>
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</aside>

			<!--
			  Right pane: the selected revision's title + content,
			  rendered through the same Markdown preview the live note
			  uses so what you see is what you'd restore.
			-->
			<section class="flex min-w-0 flex-1 flex-col">
				<header class="flex shrink-0 items-center justify-between gap-2 border-b border-border/40 px-6 py-3">
					<div class="min-w-0 flex-1">
						{#if loadingRevision}
							<Skeleton class="h-5 w-1/2" />
						{:else if selectedRevision}
							<div class="text-sm font-semibold">{selectedRevision.note_title || 'Untitled'}</div>
							<div class="text-2xs text-muted-foreground">
								Revision {selectedRevision.revision_number} ·
								{mediumDateTimeFormatter(new Date(selectedRevision.revision_timestamp))}
								· {selectedRevision.user_name}
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
						<MarkDownPreview markdown={selectedRevision.note_content} />
					{:else if revisions.length > 0}
						<p class="text-sm text-muted-foreground">No revision selected.</p>
					{/if}
				</div>
			</section>
		</div>
	</Dialog.Content>
</Dialog.Root>
