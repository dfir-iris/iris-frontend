<!--
  Chat composer — one textarea + a Send button.

  Enter submits; Shift+Enter inserts a newline. Disabled while a stream
  is in-flight so the analyst can't stack turns before the assistant
  finishes replying (would confuse the model AND the persisted turn
  order).
-->
<script lang="ts">
	import { SendIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';

	let {
		disabled,
		placeholder = 'Ask about this case, extract IOCs, draft a note…',
		onSend
	}: {
		disabled: boolean;
		placeholder?: string;
		onSend: (text: string) => void;
	} = $props();

	let text = $state('');

	function submit() {
		const trimmed = text.trim();
		if (!trimmed || disabled) return;
		onSend(trimmed);
		text = '';
	}

	function onKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			submit();
		}
	}
</script>

<div class="flex items-end gap-2 border-t bg-background p-2">
	<Textarea
		bind:value={text}
		{placeholder}
		{disabled}
		rows={2}
		class="flex-1 resize-none text-xs"
		onkeydown={onKeyDown}
	/>
	<Button size="sm" onclick={submit} {disabled}>
		<SendIcon size={14} />
	</Button>
</div>
