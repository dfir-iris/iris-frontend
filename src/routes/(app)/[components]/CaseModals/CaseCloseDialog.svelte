<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import DialogContent from '$lib/components/ui/dialog/dialog-content.svelte';
	import DialogHeader from '$lib/components/ui/dialog/dialog-header.svelte';
	import DialogTitle from '$lib/components/ui/dialog/dialog-title.svelte';
	import DialogDescription from '$lib/components/ui/dialog/dialog-description.svelte';
	import DialogFooter from '$lib/components/ui/dialog/dialog-footer.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { AlertTriangleIcon } from 'lucide-svelte';

	// Defaults describe the close flow, but the same "note + confirm" shape
	// also serves editing the note of an already-closed case — hence the
	// overridable title/confirm text and the icon opt-out (a destructive
	// warning triangle reads wrong on a plain edit).
	type CaseCloseDialogProps = {
		open: boolean;
		caseId: number;
		/** Existing note, so re-closing or correcting doesn't start from blank. */
		initialNote?: string | null;
		title?: string;
		message?: string;
		confirmText?: string;
		showIcon?: boolean;
		onConfirm: (closingNote: string) => void | Promise<void>;
		onCancel?: () => void;
		/**
		 * Fires for every open/close, including Escape and backdrop dismissal.
		 * Callers that drive `open` from derived state (rather than `bind:`)
		 * need this to clear whatever they derive it from.
		 */
		onOpenChange?: (open: boolean) => void;
	};

	let {
		open = $bindable(),
		caseId,
		initialNote = null,
		title = 'Close case',
		message,
		confirmText = 'Close case',
		showIcon = true,
		onConfirm,
		onCancel,
		onOpenChange
	}: CaseCloseDialogProps = $props();

	let note = $state('');

	// Re-seed on every open transition, not on mount. This dialog instance is
	// reused across cases (the manage list drives one instance for every row),
	// so without this the previous case's note would be sitting in the box —
	// and cancelling would leave it there to be submitted against the next one.
	let wasOpen = false;
	$effect(() => {
		if (open && !wasOpen) note = initialNote ?? '';
		wasOpen = open;
	});

	const handleConfirm = async () => {
		// Hide first, notify last. `onOpenChange` is what clears the caller's
		// dialog-mode state, and that state is what the confirm handler reads to
		// know whether it is closing the case or only rewriting the note —
		// notifying first made every confirm look like a plain note edit, so the
		// note saved and the state never moved.
		//
		// Writing `open` here does not re-enter `onOpenChange`: bits-ui only
		// calls it from its own setter (Escape, backdrop, close button).
		open = false;
		try {
			await onConfirm(note.trim());
		} finally {
			onOpenChange?.(false);
		}
	};

	const handleCancel = () => {
		open = false;
		onOpenChange?.(false);
		onCancel?.();
	};
</script>

<DialogPrimitive.Root bind:open {onOpenChange}>
	<!--
	  Wider and taller than the stock confirmation dialog: this is the only
	  place a multi-paragraph post-mortem gets written, and the default
	  `max-w-lg` box made even a short one feel like a comment field.
	-->
	<DialogContent class="sm:max-w-[760px]">
		<DialogHeader>
			<DialogTitle class="flex items-center">
				{#if showIcon}
					<AlertTriangleIcon class="mr-2 h-5 w-5 text-destructive" />
				{/if}
				{title}
			</DialogTitle>
			<DialogDescription>
				{message ??
					`Case ID ${caseId} will be closed and will not appear in contexts anymore. Related alerts will be closed too.`}
			</DialogDescription>
		</DialogHeader>

		<label class="flex flex-col gap-1.5 pt-1">
			<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
				Closing note (optional)
			</span>
			<!--
			  `max-h` keeps the dialog on screen on short viewports; `rows` sets
			  the resting height, and the textarea stays user-resizable beyond it.
			-->
			<Textarea
				bind:value={note}
				rows={14}
				class="max-h-[50vh] text-xs"
				placeholder="Why is this case being closed? Outcome, impact, follow-up actions…"
			/>
			<span class="text-2xs text-muted-foreground">Supports markdown.</span>
		</label>

		<DialogFooter class="pt-4">
			<Button variant="outline" onclick={handleCancel}>Cancel</Button>
			<Button onclick={handleConfirm}>{confirmText}</Button>
		</DialogFooter>
	</DialogContent>
</DialogPrimitive.Root>
