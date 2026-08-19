<!--
  Inline editor for a chat message the operator authored.

  Rendered in place of the message body while an edit is open — on the
  main stream and inside the thread pane. Owns its own draft so callers
  only have to track *which* message is being edited; the committed text
  comes back through `onSave`.

  Keyboard contract mirrors the composer below the stream: Enter commits,
  Shift+Enter inserts a newline, Esc aborts.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { Loader2 } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';

	interface Props {
		/** Body to seed the draft with — the message's current text. */
		initial: string;
		/** True while the PATCH is in flight; locks the field and buttons. */
		saving?: boolean;
		/**
		 * `xs` matches the thread pane's tighter type scale, `sm` the main
		 * stream. Only affects the textarea's font size — the action row
		 * is compact either way.
		 */
		size?: 'sm' | 'xs';
		onSave: (body: string) => void;
		onCancel: () => void;
	}

	const { initial, saving = false, size = 'sm', onSave, onCancel }: Props = $props();

	// Seeded once, on purpose: the draft must not be rebased if a poll
	// refreshes the underlying row mid-edit. Callers keep the row frozen
	// while an edit is open, and this component is destroyed on
	// save/cancel, so a stale seed can't outlive the session.
	// svelte-ignore state_referenced_locally
	let draft = $state(initial);
	let el: HTMLTextAreaElement | null = $state(null);

	// Grow to fit the content so a long message isn't edited through a
	// one-line slot. Called on mount and on every keystroke.
	const autosize = () => {
		if (!el) return;
		el.style.height = 'auto';
		el.style.height = `${el.scrollHeight}px`;
	};

	onMount(() => {
		el?.focus();
		// Caret at the end rather than select-all: most edits are a tweak
		// to the tail, not a rewrite.
		el?.setSelectionRange(draft.length, draft.length);
		autosize();
	});

	const commit = () => {
		const text = draft.trim();
		// An empty body isn't an edit — clearing a message is what the
		// (confirmed) delete action is for. Treat both "emptied" and
		// "unchanged" as a silent abort so we don't fire a pointless PATCH.
		if (!text || text === initial.trim()) {
			onCancel();
			return;
		}
		onSave(text);
	};

	const onKey = (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			e.preventDefault();
			onCancel();
			return;
		}
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			commit();
		}
	};
</script>

<div class="mt-0.5">
	<textarea
		bind:this={el}
		bind:value={draft}
		oninput={autosize}
		onkeydown={onKey}
		rows="1"
		disabled={saving}
		aria-label="Edit message"
		class={[
			'w-full resize-none rounded-md border bg-card px-2 py-1.5 leading-relaxed outline-none focus:ring-1 focus:ring-ring disabled:opacity-60',
			size === 'xs' ? 'text-xs' : 'text-sm'
		]}
	></textarea>
	<div class="mt-1 flex flex-wrap items-center gap-2">
		<Button size="xs" class="h-6 px-2 text-2xs" disabled={saving} onclick={commit}>
			{#if saving}
				<Loader2 class="h-3 w-3 animate-spin" />
			{/if}
			Save
		</Button>
		<Button
			size="xs"
			variant="ghost"
			class="h-6 px-2 text-2xs"
			disabled={saving}
			onclick={onCancel}
		>
			Cancel
		</Button>
		<span class="text-2xs text-muted-foreground">
			<kbd class="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">Enter</kbd>
			to save ·
			<kbd class="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">Esc</kbd>
			to cancel
		</span>
	</div>
</div>
