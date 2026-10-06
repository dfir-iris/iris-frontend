<!--
  Emoji button for a chat composer. Opens the same picker the reactions
  use and splices the chosen emoji into the textarea at the caret (or
  over the current selection), then hands focus back to the input.
-->
<script lang="ts">
	import { Smile } from 'lucide-svelte';
	import EmojiPickerPopover from './EmojiPickerPopover.svelte';
	import { insertAtCaret } from './composer-attachments.svelte';

	type Props = {
		textarea: HTMLTextAreaElement | null;
		body: string;
		onChangeBody: (next: string) => void;
		size?: number;
		class?: string;
	};
	let { textarea, body, onChangeBody, size = 15, class: className = 'p-1.5' }: Props = $props();

	let open = $state(false);
	let anchor = $state<HTMLElement | null>(null);

	const pick = (emoji: string) => {
		const { next, caret } = insertAtCaret(
			body,
			emoji,
			textarea?.selectionStart,
			textarea?.selectionEnd
		);
		onChangeBody(next);
		queueMicrotask(() => {
			if (!textarea) return;
			textarea.focus();
			textarea.setSelectionRange(caret, caret);
		});
	};
</script>

<div class="relative" bind:this={anchor}>
	<button
		type="button"
		class="rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground {className}"
		onclick={() => (open = !open)}
		aria-label="Insert emoji"
		title="Insert emoji"
	>
		<Smile {size} />
	</button>
	<EmojiPickerPopover {open} onOpenChange={(v) => (open = v)} onPick={pick} {anchor} align="left" />
</div>
