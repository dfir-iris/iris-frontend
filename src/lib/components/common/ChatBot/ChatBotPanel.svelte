<!--
  Global chatbot panel — mounted at the (app) layout so open/closed
  state and the current conversation survive navigation.

  Wraps a right-side Sheet with the chat thread, streaming staged
  assistant bubble, pending Approve/Deny cards, and the composer.

  Case context is auto-attached: when the route is a case route the
  composer's "attach case context" chip is on, and a new conversation
  started from within the panel is scoped to that case.
-->
<script lang="ts">
	import { getContext } from 'svelte';
	import { page } from '$app/state';
	import { BotIcon, PlusIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		Sheet,
		SheetContent,
		SheetHeader,
		SheetTitle,
		SheetDescription
	} from '$lib/components/ui/sheet';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import {
		CHAT_PANEL_CTX,
		type ChatPanelContext
	} from '$lib/contexts/chat-panel.context.svelte';
	import ChatMessage from './components/ChatMessage.svelte';
	import ChatComposer from './components/ChatComposer.svelte';
	import PendingToolApproval from './components/PendingToolApproval.svelte';
	import ToolCallCard from './components/ToolCallCard.svelte';

	const chat = getContext<ChatPanelContext>(CHAT_PANEL_CTX);

	// Route-derived case_id so a "new chat here" click can auto-scope.
	const currentCaseId = $derived.by<number | null>(() => {
		const raw = page.params?.case_id ?? null;
		if (!raw) return null;
		const n = Number(raw);
		return Number.isFinite(n) ? n : null;
	});

	const streaming = $derived(chat.state.streamingConversationId != null);
	const disabled = $derived(streaming || chat.state.pendingToolCalls.length > 0);

	async function newHere() {
		if (currentCaseId != null) {
			await chat.startCaseConversation(currentCaseId);
		} else {
			await chat.startGlobalConversation();
		}
	}
</script>

<Sheet
	open={chat.state.open}
	onOpenChange={(v) => (v ? chat.openPanel() : chat.closePanel())}
>
	<SheetContent side="right" class="flex w-full flex-col sm:max-w-md md:max-w-lg">
		<SheetHeader>
			<SheetTitle class="flex items-center gap-2">
				<BotIcon size={16} />
				IRIS Assistant
				{#if chat.state.currentConversation?.model}
					<span class="text-2xs font-normal text-muted-foreground">
						{chat.state.currentConversation.model}
					</span>
				{/if}
			</SheetTitle>
			<SheetDescription>
				Powered by MCP tools — writes require your approval.
			</SheetDescription>
		</SheetHeader>

		<div class="flex items-center gap-2 border-b pb-2 pt-1">
			<Button size="sm" variant="outline" class="h-7" onclick={newHere}>
				<PlusIcon size={12} class="mr-1" />
				New chat {currentCaseId != null ? `on case #${currentCaseId}` : ''}
			</Button>
			{#if currentCaseId != null}
				<span class="ml-auto text-2xs text-muted-foreground">
					Scoped to case #{currentCaseId}
				</span>
			{/if}
		</div>

		<div class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
			{#if chat.state.loading}
				<Skeleton class="h-12 w-full" />
				<Skeleton class="h-16 w-full" />
			{:else if !chat.state.currentConversation}
				<p class="mt-2 text-xs text-muted-foreground">
					Start a new chat above. The assistant can read IOCs / assets /
					notes / tasks on this case automatically and will ask for
					approval before making any changes.
				</p>
			{:else}
				{#each chat.state.messages as message (message.id)}
					<ChatMessage {message} />
				{/each}

				<!-- Staged streaming assistant bubble (before the final
				     persisted message row lands). -->
				{#if chat.state.streamingAssistant}
					<div class="flex gap-2 text-xs">
						<div
							class="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
						>
							<BotIcon size={12} />
						</div>
						<div class="max-w-[80%] rounded-md bg-muted px-3 py-2">
							{#if chat.state.streamingAssistant.text}
								<p class="whitespace-pre-wrap">
									{chat.state.streamingAssistant.text}
								</p>
							{/if}
							{#if chat.state.streamingAssistant.toolUses.length > 0}
								<div class="mt-2 flex flex-col gap-1">
									{#each chat.state.streamingAssistant.toolUses as tu (tu.tool_use_id)}
										<ToolCallCard
											toolUseId={tu.tool_use_id}
											toolName={tu.tool_name}
											argsData={tu.arguments}
											result={tu.result}
											error={tu.error}
										/>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Pending write tool calls await Approve/Deny. -->
				{#each chat.state.pendingToolCalls as pending (pending.id)}
					<PendingToolApproval
						{pending}
						onApprove={chat.approveTool}
						onDeny={chat.denyTool}
					/>
				{/each}

				{#if chat.state.error}
					<p class="text-2xs text-destructive">{chat.state.error}</p>
				{/if}
			{/if}
		</div>

		<ChatComposer
			{disabled}
			onSend={(text) => chat.send(text)}
		/>
	</SheetContent>
</Sheet>
