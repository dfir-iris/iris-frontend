<!--
  Inline history dropdown for the ChatBot panel. Lists prior
  conversations for the current case (if any) plus the analyst's
  global conversations. Supports:
    * click a row → open the conversation in the panel
    * pencil icon → inline rename (Enter to save, Escape to cancel)
    * trash icon → archive (soft-delete)

  Kept as a plain absolutely-positioned floater rather than a shared
  popover primitive because the parent panel is itself a floating
  window (position: fixed z-50); a portalled popover from a UI library
  would either clip against the panel edge or attach to the wrong
  container. This is a self-contained, tiny surface.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { CheckIcon, PencilIcon, Trash2Icon, XIcon } from 'lucide-svelte';
	import type { ChatConversation } from '$lib/services/chat.service';
	import type { ChatPanelContext } from '$lib/contexts/chat-panel.context.svelte';

	let {
		chat,
		currentCaseId,
		onClose
	}: {
		chat: ChatPanelContext;
		currentCaseId: number | null;
		onClose: () => void;
	} = $props();

	let caseConvs = $state<ChatConversation[]>([]);
	let globalConvs = $state<ChatConversation[]>([]);
	let loading = $state(true);
	let editingId = $state<number | null>(null);
	let editingTitle = $state('');

	async function load() {
		loading = true;
		try {
			const [caseList, globalList] = await Promise.all([
				currentCaseId != null
					? chat.listCaseConversations(currentCaseId)
					: Promise.resolve<ChatConversation[]>([]),
				chat.listGlobalConversations()
			]);
			caseConvs = caseList;
			globalConvs = globalList;
		} finally {
			loading = false;
		}
	}

	onMount(load);

	async function pick(conv: ChatConversation) {
		if (editingId != null) return; // Click-through guard while renaming.
		await chat.openConversation(conv.id);
		onClose();
	}

	function startEdit(conv: ChatConversation, e: MouseEvent) {
		e.stopPropagation();
		editingId = conv.id;
		editingTitle = conv.title || '';
	}

	function cancelEdit() {
		editingId = null;
		editingTitle = '';
	}

	async function saveEdit() {
		if (editingId == null) return;
		const id = editingId;
		const title = editingTitle;
		const ok = await chat.renameConversation(id, title);
		if (ok) {
			// Mirror the change into the local list so the row updates
			// without a full reload.
			caseConvs = caseConvs.map((c) => (c.id === id ? { ...c, title } : c));
			globalConvs = globalConvs.map((c) => (c.id === id ? { ...c, title } : c));
		}
		cancelEdit();
	}

	function onEditKey(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			void saveEdit();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			cancelEdit();
		}
	}

	async function archive(conv: ChatConversation, e: MouseEvent) {
		e.stopPropagation();
		const ok = await chat.archiveConversation(conv.id);
		if (ok) {
			caseConvs = caseConvs.filter((c) => c.id !== conv.id);
			globalConvs = globalConvs.filter((c) => c.id !== conv.id);
		}
	}

	function displayTitle(c: ChatConversation): string {
		return c.title?.trim() || `Untitled #${c.id}`;
	}

	function formatDate(iso: string): string {
		try {
			const d = new Date(iso);
			return d.toLocaleString();
		} catch {
			return iso;
		}
	}
</script>

<!-- Absolute overlay inside the panel body. z-10 so it paints above
     the message list but stays under any global toast (z-50+). -->
<div
	class="absolute left-2 right-2 top-2 z-10 max-h-[70%] overflow-y-auto rounded-md border bg-background p-2 shadow-lg"
	role="dialog"
	aria-label="Conversation history"
>
	<div class="mb-2 flex items-center justify-between">
		<span class="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
			History
		</span>
		<button
			type="button"
			class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
			onclick={onClose}
			aria-label="Close history"
		>
			<XIcon size={14} />
		</button>
	</div>

	{#if loading}
		<p class="text-2xs text-muted-foreground">Loading…</p>
	{:else}
		{#if currentCaseId != null}
			<div class="mb-2">
				<div class="text-2xs font-medium text-muted-foreground">
					On case #{currentCaseId}
				</div>
				{#if caseConvs.length === 0}
					<p class="text-2xs text-muted-foreground">No prior chats on this case.</p>
				{:else}
					<ul class="mt-1 flex flex-col gap-0.5">
						{#each caseConvs as conv (conv.id)}
							{@render row(conv)}
						{/each}
					</ul>
				{/if}
			</div>
		{/if}

		<div>
			<div class="text-2xs font-medium text-muted-foreground">Global</div>
			{#if globalConvs.length === 0}
				<p class="text-2xs text-muted-foreground">No global chats yet.</p>
			{:else}
				<ul class="mt-1 flex flex-col gap-0.5">
					{#each globalConvs as conv (conv.id)}
						{@render row(conv)}
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</div>

{#snippet row(conv: ChatConversation)}
	<li>
		<div
			class="group flex items-center gap-2 rounded px-2 py-1 hover:bg-muted"
			role="button"
			tabindex="0"
			onclick={() => pick(conv)}
			onkeydown={(e) => {
				if (e.key === 'Enter') void pick(conv);
			}}
		>
			{#if editingId === conv.id}
				<input
					type="text"
					class="flex-1 rounded border bg-background px-1 py-0.5 text-xs"
					bind:value={editingTitle}
					onkeydown={onEditKey}
					onclick={(e) => e.stopPropagation()}
					autofocus
				/>
				<button
					type="button"
					class="rounded p-0.5 text-muted-foreground hover:text-foreground"
					onclick={(e) => {
						e.stopPropagation();
						void saveEdit();
					}}
					aria-label="Save"
				>
					<CheckIcon size={12} />
				</button>
				<button
					type="button"
					class="rounded p-0.5 text-muted-foreground hover:text-foreground"
					onclick={(e) => {
						e.stopPropagation();
						cancelEdit();
					}}
					aria-label="Cancel"
				>
					<XIcon size={12} />
				</button>
			{:else}
				<div class="flex min-w-0 flex-1 flex-col">
					<span class="truncate text-xs">{displayTitle(conv)}</span>
					<span class="text-2xs text-muted-foreground">
						{formatDate(conv.updated_at)}
					</span>
				</div>
				<button
					type="button"
					class="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
					onclick={(e) => startEdit(conv, e)}
					aria-label="Rename"
				>
					<PencilIcon size={12} />
				</button>
				<button
					type="button"
					class="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
					onclick={(e) => archive(conv, e)}
					aria-label="Archive"
				>
					<Trash2Icon size={12} />
				</button>
			{/if}
		</div>
	</li>
{/snippet}
