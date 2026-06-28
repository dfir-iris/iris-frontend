<!--
  Side-pane for a single thread.

  Slack-style: opens to the right of the main stream when the operator
  clicks a thread chip or "Reply in thread". Renders the root message
  at the top, then a stream of replies underneath, with a composer at
  the bottom. The composer reuses the same Enter/Shift+Enter contract
  as the main composer.

  The pane is responsible for its own data (replies fetch, post,
  follow toggle, retitle). It receives the root id + initial root row
  from the parent so it can render immediately without an extra fetch.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { Bell, BellOff, Loader2, Pencil, Send, X, Check } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { toast } from '$lib/components/ui/toast';
	import UserAvatar from '$lib/components/common/UserAvatar.svelte';
	import {
		WarRoomChatService,
		type ChatMessage,
		type ChatThreadRoot
	} from '$lib/services/war-room-chat.service';
	import ChatMessageBody from './ChatMessageBody.svelte';

	interface Props {
		warRoomId: number;
		root: ChatThreadRoot;
		onClose: () => void;
		onChanged: () => void;
	}

	const { warRoomId, root, onClose, onChanged }: Props = $props();

	let replies = $state<ChatMessage[]>([]);
	let loading = $state(true);
	let body = $state('');
	let sending = $state(false);
	let composerEl: HTMLTextAreaElement | null = $state(null);
	let listEl: HTMLDivElement | null = $state(null);

	let editingTitle = $state(false);
	let titleDraft = $state('');
	let titleSaving = $state(false);

	let followed = $state(false);
	let following = $state(false);

	// Sync local mirrors from props whenever the operator switches
	// threads. Capturing these as `$state(root.x)` at component creation
	// would lock them to the initial root — and the parent reuses this
	// component instance when openThread changes.
	$effect(() => {
		titleDraft = root.thread_title ?? '';
		followed = root.is_followed;
	});

	const scrollToBottom = async () => {
		await tick();
		if (listEl) listEl.scrollTop = listEl.scrollHeight;
	};

	const load = async () => {
		loading = true;
		const res = await WarRoomChatService.listReplies(warRoomId, root.message_id);
		if (res.ok && Array.isArray(res.data)) {
			replies = res.data as ChatMessage[];
		}
		loading = false;
		void scrollToBottom();
	};

	$effect(() => {
		// Re-fetch when the operator switches threads — `root.message_id`
		// is what we key on.
		root.message_id;
		void load();
	});

	const send = async () => {
		const text = body.trim();
		if (!text) return;
		sending = true;
		const res = await WarRoomChatService.reply(warRoomId, root.message_id, text);
		sending = false;
		if (res.ok) {
			body = '';
			await load();
			onChanged();
			composerEl?.focus();
		} else {
			toast({ title: 'Could not post reply', variant: 'destructive' });
		}
	};

	const onKey = (e: KeyboardEvent) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			void send();
		}
	};

	const startEditTitle = () => {
		titleDraft = root.thread_title ?? '';
		editingTitle = true;
	};

	const saveTitle = async () => {
		titleSaving = true;
		const next = titleDraft.trim() || null;
		const res = await WarRoomChatService.setThreadTitle(
			warRoomId,
			root.message_id,
			next
		);
		titleSaving = false;
		if (res.ok) {
			// Patch up the parent's view through onChanged — the root row
			// owns the title display in the sidebar, so a refresh there
			// is what makes the rename visible everywhere.
			editingTitle = false;
			onChanged();
		} else {
			toast({ title: 'Could not rename thread', variant: 'destructive' });
		}
	};

	const toggleFollow = async () => {
		following = true;
		const res = followed
			? await WarRoomChatService.unfollowThread(warRoomId, root.message_id)
			: await WarRoomChatService.followThread(warRoomId, root.message_id);
		following = false;
		if (res.ok) {
			followed = !followed;
			onChanged();
		} else {
			toast({ title: 'Could not update follow state', variant: 'destructive' });
		}
	};

	const fmtTime = (iso: string | null) => {
		if (!iso) return '';
		try {
			return new Date(iso).toLocaleString(undefined, {
				month: 'short',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return '';
		}
	};
</script>

<aside class="flex h-full min-h-0 w-[380px] shrink-0 flex-col border-l bg-card/30">
	<!-- Header: title (editable inline), follow toggle, close. -->
	<header class="flex shrink-0 items-center gap-2 border-b px-3 py-2">
		<div class="min-w-0 flex-1">
			{#if editingTitle}
				<div class="flex items-center gap-1">
					<Input
						value={titleDraft}
						oninput={(e) => (titleDraft = (e.target as HTMLInputElement).value)}
						placeholder="Thread title"
						class="h-7 text-xs"
					/>
					<Button
						size="icon"
						variant="ghost"
						class="h-7 w-7"
						disabled={titleSaving}
						onclick={saveTitle}
						aria-label="Save title"
					>
						<Check class="h-3.5 w-3.5" />
					</Button>
					<Button
						size="icon"
						variant="ghost"
						class="h-7 w-7"
						disabled={titleSaving}
						onclick={() => (editingTitle = false)}
						aria-label="Cancel"
					>
						<X class="h-3.5 w-3.5" />
					</Button>
				</div>
			{:else}
				<button
					type="button"
					class="group flex w-full items-center gap-1 text-left"
					onclick={startEditTitle}
					title="Click to rename"
				>
					<span class="truncate text-sm font-semibold">
						{root.thread_title ?? 'Thread'}
					</span>
					<Pencil class="hidden h-3 w-3 text-muted-foreground group-hover:inline" />
				</button>
				<p class="truncate text-2xs text-muted-foreground">
					{root.reply_count} {root.reply_count === 1 ? 'reply' : 'replies'}
				</p>
			{/if}
		</div>
		<Button
			size="icon"
			variant="ghost"
			class="h-7 w-7"
			disabled={following}
			onclick={toggleFollow}
			aria-label={followed ? 'Unfollow thread' : 'Follow thread'}
			title={followed ? 'Unfollow' : 'Follow'}
		>
			{#if followed}
				<Bell class="h-3.5 w-3.5 text-primary" />
			{:else}
				<BellOff class="h-3.5 w-3.5 text-muted-foreground" />
			{/if}
		</Button>
		<Button
			size="icon"
			variant="ghost"
			class="h-7 w-7"
			onclick={onClose}
			aria-label="Close thread"
		>
			<X class="h-3.5 w-3.5" />
		</Button>
	</header>

	<!-- Root preview, then replies. -->
	<div bind:this={listEl} class="min-h-0 flex-1 overflow-y-auto px-3 py-3">
		<div class="rounded-md border bg-muted/30 px-3 py-2">
			<div class="flex items-baseline gap-2">
				<UserAvatar
					userId={root.author_id ?? undefined}
					name={root.author_name ?? root.author_login ?? 'Unknown'}
					size="size-6"
				/>
				<span class="text-xs font-semibold">
					{root.author_name ?? root.author_login ?? 'Unknown'}
				</span>
				<span class="text-2xs text-muted-foreground">{fmtTime(root.created_at)}</span>
			</div>
			{#if root.preview}
				<p class="mt-1 whitespace-pre-wrap break-words text-xs">{root.preview}</p>
			{/if}
		</div>

		<div class="my-3 flex items-center gap-2 text-2xs text-muted-foreground">
			<div class="h-px flex-1 bg-border"></div>
			<span>{root.reply_count} {root.reply_count === 1 ? 'reply' : 'replies'}</span>
			<div class="h-px flex-1 bg-border"></div>
		</div>

		{#if loading}
			<p class="text-center text-xs text-muted-foreground">Loading replies…</p>
		{:else if replies.length === 0}
			<p class="text-center text-xs text-muted-foreground">No replies yet — be the first.</p>
		{:else}
			<ul class="flex flex-col gap-3">
				{#each replies as r (r.message_id)}
					<li class="flex gap-2">
						<UserAvatar
							userId={r.author_id ?? undefined}
							name={r.author_name ?? r.author_login ?? 'Unknown'}
							size="size-7"
						/>
						<div class="min-w-0 flex-1">
							<div class="flex items-baseline gap-2">
								<span class="text-xs font-semibold">
									{r.author_name ?? r.author_login ?? 'Unknown'}
								</span>
								<span class="text-2xs text-muted-foreground">{fmtTime(r.created_at)}</span>
							</div>
							<div class="mt-0.5 break-words text-xs">
								<ChatMessageBody body={r.body ?? ''} onAttachmentClick={() => {}} />
							</div>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<!-- Reply composer. -->
	<form
		class="shrink-0 border-t bg-background/80 px-3 py-2"
		onsubmit={(e) => {
			e.preventDefault();
			void send();
		}}
	>
		<div class="flex items-end gap-2 rounded-lg border bg-card px-2 py-1.5 focus-within:ring-1 focus-within:ring-ring">
			<textarea
				bind:this={composerEl}
				value={body}
				oninput={(e) => (body = (e.target as HTMLTextAreaElement).value)}
				onkeydown={onKey}
				placeholder="Reply in thread…"
				rows="1"
				class="flex-1 resize-none bg-transparent text-xs leading-relaxed outline-none placeholder:text-muted-foreground"
			></textarea>
			<Button
				type="submit"
				size="sm"
				class="h-7 gap-1.5"
				disabled={sending || !body.trim()}
			>
				{#if sending}
					<Loader2 class="h-3 w-3 animate-spin" />
				{:else}
					<Send class="h-3 w-3" />
				{/if}
				Reply
			</Button>
		</div>
	</form>
</aside>
