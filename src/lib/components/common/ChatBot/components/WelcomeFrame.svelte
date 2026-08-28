<!--
  Empty-state welcome frame shown when the panel is open but no
  conversation is active yet.

  Three sections stacked:
    1. Yuki greeting — brief personality + a scope-aware capability line.
    2. Prominent "Start a new chat" CTA that auto-scopes to the current
       route (war-room, case, or global).
    3. Up to 5 most recent conversations, click-through to resume. Same
       renderer as ConversationHistory so the visual language matches.

  Fetches its own history on mount rather than reusing the drop-down
  overlay — the drop-down is opt-in (behind a button), whereas the
  welcome frame is the default view.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { PlusIcon, SparklesIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import type { ChatConversation } from '$lib/services/chat.service';
	import type { ChatPanelContext } from '$lib/contexts/chat-panel.context.svelte';
	import ScopePicker from './ScopePicker.svelte';
	import type { ChatScopeChoice } from './scope-picker-types';

	let {
		chat,
		currentCaseId,
		currentWarRoomId,
		currentAlertId = null,
		onStart,
		onPickScope
	}: {
		chat: ChatPanelContext;
		currentCaseId: number | null;
		currentWarRoomId: number | null;
		currentAlertId?: number | null;
		onStart: () => void;
		onPickScope?: (choice: ChatScopeChoice) => void;
	} = $props();

	let showPicker = $state(false);

	let recent = $state<ChatConversation[]>([]);
	let loading = $state(true);

	async function load() {
		loading = true;
		try {
			// Prefer the current scope's history; fall back to global so
			// the analyst always sees SOMETHING they can resume rather
			// than an empty "no chats yet" state.
			const primary =
				currentWarRoomId != null
					? await chat.listWarRoomConversations(currentWarRoomId)
					: currentCaseId != null
						? await chat.listCaseConversations(currentCaseId)
						: [];
			if (primary.length > 0) {
				recent = primary.slice(0, 5);
				return;
			}
			const globals = await chat.listGlobalConversations();
			recent = globals.slice(0, 5);
		} finally {
			loading = false;
		}
	}

	onMount(load);

	async function pick(conv: ChatConversation) {
		await chat.openConversation(conv.id);
	}

	function displayTitle(c: ChatConversation): string {
		return c.title?.trim() || `Untitled #${c.id}`;
	}

	function scopeLabel(c: ChatConversation): string {
		if (c.war_room_id != null) return `war-room #${c.war_room_id}`;
		if (c.case_id != null) return `case #${c.case_id}`;
		return 'global';
	}

	function formatDate(iso: string): string {
		try {
			const d = new Date(iso);
			return d.toLocaleDateString(undefined, {
				month: 'short',
				day: 'numeric'
			});
		} catch {
			return '';
		}
	}

	const scopeLine = $derived.by<string>(() => {
		if (currentWarRoomId != null) {
			return `I'll be scoped to war-room #${currentWarRoomId} — I can read chat, sitreps, notes, and tasks, and propose posts or drafts with your approval.`;
		}
		if (currentCaseId != null) {
			return `I'll be scoped to case #${currentCaseId} — I can read IOCs, assets, notes, and tasks, and propose changes with your approval.`;
		}
		if (currentAlertId != null) {
			return `I'll be focused on alert #${currentAlertId} — I can read the alert and related alerts, propose escalating it, or merge it into a case.`;
		}
		return "I'll start without any scope — helpful for cross-case questions, drafting, or searching.";
	});
</script>

<div class="flex flex-col gap-4 py-2">
	<!-- Greeting -->
	<div class="flex flex-col items-center gap-2 pt-2 text-center">
		<div class="flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary">
			<SparklesIcon size={22} />
		</div>
		<div>
			<h3 class="text-sm font-semibold">Hi, I'm Yuki</h3>
			<p class="mt-1 text-2xs leading-relaxed text-muted-foreground">
				{scopeLine}
			</p>
		</div>
	</div>

	<!-- Primary CTA -->
	<div class="flex flex-col items-center gap-1.5">
		<Button size="sm" class="h-8 gap-1.5" onclick={onStart}>
			<PlusIcon size={14} />
			Start a new chat
		</Button>
		{#if onPickScope}
			<button
				type="button"
				class="text-2xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
				onclick={() => (showPicker = !showPicker)}
			>
				{showPicker ? 'Hide options' : 'Choose a different scope'}
			</button>
		{/if}
	</div>

	{#if showPicker && onPickScope}
		<div class="mx-auto w-full max-w-xs">
			<ScopePicker {currentCaseId} {currentWarRoomId} {currentAlertId} onPick={onPickScope} />
		</div>
	{/if}

	<!-- Divider + recent conversations -->
	{#if loading}
		<div class="border-t pt-3">
			<p class="text-2xs text-muted-foreground">Loading recent chats…</p>
		</div>
	{:else if recent.length > 0}
		<div class="border-t pt-3">
			<div class="mb-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
				Recent chats
			</div>
			<ul class="flex flex-col gap-0.5">
				{#each recent as conv (conv.id)}
					<li>
						<button
							type="button"
							class="flex w-full min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
							onclick={() => pick(conv)}
						>
							<div class="flex min-w-0 flex-1 flex-col">
								<span class="truncate text-xs">{displayTitle(conv)}</span>
								<span class="text-2xs text-muted-foreground">
									{scopeLabel(conv)} · {formatDate(conv.updated_at)}
								</span>
							</div>
						</button>
					</li>
				{/each}
			</ul>
			<p class="mt-2 text-2xs text-muted-foreground">Or type below to start a new one instantly.</p>
		</div>
	{:else}
		<div class="border-t pt-3 text-center">
			<p class="text-2xs text-muted-foreground">
				No previous chats yet. Type below to get started.
			</p>
		</div>
	{/if}
</div>
