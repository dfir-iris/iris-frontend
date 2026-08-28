<!--
  One message bubble in the chat thread.

  User bubbles render plain text; assistant bubbles render markdown via
  the existing MarkDownPreview component. Tool-role messages are hidden
  from the analyst's view (they're LLM plumbing) — their results are
  shown inside the associated assistant bubble's tool cards.
-->
<script lang="ts">
	import { SparklesIcon, UserIcon } from 'lucide-svelte';
	import MarkDownPreview from '$lib/components/common/MarkDown/MarkDownPreview.svelte';
	import type { ChatMessage, ChatContentBlock } from '$lib/services/chat.service';
	import ToolCallCard from './ToolCallCard.svelte';

	let { message }: { message: ChatMessage } = $props();

	const textBlocks = $derived(
		(message.content ?? []).filter((b: ChatContentBlock) => b.type === 'text')
	);
	const toolUseBlocks = $derived(
		(message.content ?? []).filter((b: ChatContentBlock) => b.type === 'tool_use')
	);

	const isUser = $derived(message.role === 'user');
	const isAssistant = $derived(message.role === 'assistant');

	const combinedText = $derived(textBlocks.map((b) => b.text ?? '').join(''));
</script>

{#if message.role === 'tool'}
	<!-- Tool-role messages are the LLM's memory, not the analyst's. Hide. -->
{:else}
	<div class="flex gap-2 text-xs" class:justify-end={isUser}>
		{#if isAssistant}
			<div
				class="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
			>
				<SparklesIcon size={12} />
			</div>
		{/if}
		<div
			class="max-w-[80%] rounded-md px-3 py-2 {isUser
				? 'bg-primary text-primary-foreground'
				: 'bg-muted'}"
		>
			{#if isUser}
				<p class="whitespace-pre-wrap">{combinedText}</p>
			{:else if combinedText}
				<MarkDownPreview markdown={combinedText} />
			{/if}
			{#if toolUseBlocks.length > 0}
				<div class="mt-2 flex flex-col gap-1">
					{#each toolUseBlocks as block (block.id)}
						<ToolCallCard
							toolUseId={String(block.id ?? '')}
							toolName={String(block.name ?? '')}
							argsData={(block.input as Record<string, unknown>) ?? {}}
						/>
					{/each}
				</div>
			{/if}
		</div>
		{#if isUser}
			<div
				class="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
			>
				<UserIcon size={12} />
			</div>
		{/if}
	</div>
{/if}
