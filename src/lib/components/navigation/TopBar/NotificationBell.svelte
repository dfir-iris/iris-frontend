<script lang="ts">
	// Top-bar bell dropdown.
	//
	// Renders a bell icon with an unread count badge, and a popover
	// containing the last N notifications. On mount, initialises the
	// notification store which opens the SocketIO subscription and
	// fetches the initial feed.

	import { onMount, onDestroy } from 'svelte';
	import { BellIcon, CheckCheckIcon, ClipboardCheckIcon, Trash2Icon } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import * as Popover from '$lib/components/ui/popover';
	import {
		Tooltip,
		TooltipContent,
		TooltipProvider,
		TooltipTrigger
	} from '$lib/components/ui/tooltip';
	import { notifications } from '$lib/stores/notifications.store';
	import { reviews } from '$lib/stores/reviews.store';
	import type { Notification } from '$lib/services/notifications.service';

	let open = $state(false);

	// Re-fetch every time the dropdown opens so we don't render stale
	// data if the socket dropped and reconnected without us seeing it.
	// Cheap: bounded by RECENT_LIMIT and a single query.
	const totalBadgeCount = $derived($notifications.unreadCount + $reviews.items.length);

	async function onOpenChange(next: boolean) {
		open = next;
		if (next) {
			await Promise.all([notifications.refresh(), reviews.load()]);
		}
	}

	onMount(() => {
		notifications.initialize();
		reviews.start();
	});

	onDestroy(() => {
		// Deliberately do NOT reset here — the app is a SPA, so the
		// notification store lives across route changes. Reset is called
		// from the logout handler in the auth flow instead.
	});

	function onItemClick(n: Notification) {
		// Mark clicked notification as read AND deep-link to its source.
		// We mark-read optimistically before nav so the badge decrements
		// even if the target route is slow to render.
		if (n.read_at == null) {
			notifications.markRead([n.id]);
		}
		open = false;
		if (n.link) {
			goto(n.link);
		}
	}

	function onMarkAll() {
		notifications.markAllRead();
	}

	function onClearAll() {
		notifications.clearAll();
	}

	function relTime(iso: string | null): string {
		if (!iso) return '';
		const then = new Date(iso).getTime();
		const diff = Math.max(0, Date.now() - then);
		const s = Math.floor(diff / 1000);
		if (s < 60) return 'just now';
		const m = Math.floor(s / 60);
		if (m < 60) return `${m}m ago`;
		const h = Math.floor(m / 60);
		if (h < 24) return `${h}h ago`;
		const d = Math.floor(h / 24);
		return `${d}d ago`;
	}
</script>

<Popover.Root {open} {onOpenChange}>
	<Popover.Trigger
		class="relative rounded-lg p-2 text-white/80 backdrop-blur-md transition-all duration-150 hover:bg-white/15 hover:text-white hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]"
		aria-label="Notifications"
	>
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger>
					<BellIcon size="16" />
					{#if totalBadgeCount > 0}
						<!--
							Badge is absolutely positioned so the button box
							stays the same size as the other topbar action
							buttons. Two-digit cap: 99+ for anything larger
							so it never wraps the badge or breaks alignment.
						-->
						<span
							class="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white shadow"
							aria-live="polite"
						>
							{totalBadgeCount > 99 ? '99+' : totalBadgeCount}
						</span>
					{/if}
				</TooltipTrigger>
				<TooltipContent align="center" side="top">Notifications</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	</Popover.Trigger>

	<!--
	  `max-h-[70vh]` caps the whole popover to a sensible fraction of
	  the viewport so it can't grow off-screen on a big monitor. The
	  outer flex column lets the header stay put while the middle
	  list is the only thing that scrolls.
	-->
	<Popover.Content align="end" class="flex max-h-[70vh] w-96 flex-col p-0">
		<div class="flex flex-shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
			<div class="text-sm font-semibold text-foreground">Notifications</div>
			<div class="flex items-center gap-1">
				<button
					onclick={onMarkAll}
					disabled={$notifications.unreadCount === 0}
					class="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
					title="Mark all as read"
				>
					<CheckCheckIcon size="12" />
					Mark all read
				</button>
				<button
					onclick={onClearAll}
					disabled={$notifications.items.length === 0}
					class="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
					title="Clear all notifications"
				>
					<Trash2Icon size="12" />
					Clear
				</button>
			</div>
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto">
			{#if $reviews.items.length > 0}
				<div class="border-b">
					<div
						class="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
					>
						Pending reviews
					</div>
					<ul class="divide-y">
						{#each $reviews.items as r (r.case_id)}
							<li>
								<button
									onclick={() => {
										open = false;
										goto(`/case/${r.case_id}`);
									}}
									class="flex w-full items-start gap-2 bg-amber-50/60 px-3 py-2 text-left transition-colors hover:bg-muted dark:bg-amber-900/10"
								>
									<span class="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-amber-500"></span>
									<div class="min-w-0 flex-1">
										<div class="flex items-center gap-1.5">
											<ClipboardCheckIcon
												size={11}
												class="shrink-0 text-amber-600 dark:text-amber-400"
											/>
											<span class="truncate text-sm font-medium text-foreground">{r.case_name}</span
											>
										</div>
										{#if r.review_status?.status_name}
											<div class="text-xs text-muted-foreground">{r.review_status.status_name}</div>
										{/if}
									</div>
								</button>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			{#if $notifications.loading && $notifications.items.length === 0}
				<div class="px-3 py-8 text-center text-sm text-muted-foreground">Loading…</div>
			{:else if $notifications.items.length === 0 && $reviews.items.length === 0}
				<div class="px-3 py-8 text-center text-sm text-muted-foreground">You're all caught up.</div>
			{:else if $notifications.items.length > 0}
				{#if $reviews.items.length > 0}
					<div
						class="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
					>
						Notifications
					</div>
				{/if}
				<ul class="divide-y">
					{#each $notifications.items as n (n.id)}
						<li>
							<button
								onclick={() => onItemClick(n)}
								class="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-muted {n.read_at ==
								null
									? 'bg-accent/30'
									: ''}"
							>
								{#if n.read_at == null}
									<span
										class="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500"
										aria-label="Unread"
									></span>
								{:else}
									<!-- Reserve the same width so titles align on both states. -->
									<span class="mt-1.5 h-2 w-2 flex-shrink-0"></span>
								{/if}
								<div class="min-w-0 flex-1">
									<div class="truncate text-sm font-medium text-foreground">
										{n.title}
									</div>
									{#if n.body}
										<div class="line-clamp-2 text-xs text-muted-foreground">
											{n.body}
										</div>
									{/if}
									<div class="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground/70">
										{relTime(n.created_at)}
									</div>
								</div>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		{#if $notifications.error}
			<div class="border-t bg-destructive/10 px-3 py-2 text-xs text-destructive" role="status">
				{$notifications.error}
			</div>
		{/if}
	</Popover.Content>
</Popover.Root>
