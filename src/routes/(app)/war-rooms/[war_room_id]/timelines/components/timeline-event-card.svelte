<!--
  War-room timeline event card. Structural mirror of the case-timeline
  `timeline-event-card` — same color stripe, hover lift, metadata row,
  markdown preview, tags pills, hover toolbar, and three-dot menu.

  Field-name adaptations for the war-room event shape:
    * event.id / event.title / event.content / event.color / event.source
    * event.tags (comma-string, split on `,`)
    * event.is_flagged (bool)
    * event.category (single string, no separate `category_name`)
    * event.assets / event.iocs (id-only arrays; case cards hydrate the
      full row via `assets[].asset_name` — we render an aggregate pill
      instead until we have a hydrated fetch on the war-room side).

  Diverges from the case-timeline card on comments: war-room chat is the
  conversation surface for a war room, not per-event threads, so this
  card doesn't render a comments badge or a comments button.

  Projected case events (`event.war_room_source === 'case'`) are read-
  only: edit / add-child / flag / duplicate / delete affordances are
  hidden. The dot-menu keeps Share / Markdown-link so users can jump
  back to the source case.
-->
<script lang="ts">
	import {
		ChevronDownIcon,
		ChevronRightIcon,
		CopyIcon,
		EditIcon,
		FileSymlinkIcon,
		FlagIcon,
		ForwardIcon,
		GitBranchPlusIcon,
		MoreVerticalIcon,
		Trash2Icon
	} from 'lucide-svelte';
	import type { WarRoomTimelineEvent } from '$lib/services/war-room-timelines.service';
	import { Button } from '$lib/components/ui/button';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuTrigger,
		Separator
	} from '$lib/components/ui/dropdown-menu';
	import {
		Tooltip,
		TooltipContent,
		TooltipProvider,
		TooltipTrigger
	} from '$lib/components/ui/tooltip';
	import MarkDownPreview from '$lib/components/common/MarkDown/MarkDownPreview.svelte';
	import { toast } from '$lib/stores/toast.store';
	import { getSharedEventId, getSharedEventUrl } from '../helpers';
	import Highlight from './highlight.svelte';

	type Props = {
		event: WarRoomTimelineEvent;
		childCount: number;
		folded: boolean;
		selected: boolean;
		selecting: boolean;
		isLast?: boolean;
		showRail?: boolean;
		matched?: boolean;
		isCurrentMatch?: boolean;
		searchQuery?: string;
		onToggleFold: () => void;
		onToggleSelect: (eventId: number | string) => void;
		onEdit: (eventId: number | string) => void;
		onAddChild: (eventId: number | string) => void;
		onFlag: (eventId: number | string) => void;
		onDuplicate: (eventId: number | string) => void;
		onDelete: (eventId: number | string) => void;
		canEdit?: boolean;
	};

	let {
		event,
		childCount,
		folded,
		selected,
		selecting,
		isLast = false,
		showRail = true,
		matched = false,
		isCurrentMatch = false,
		searchQuery = '',
		onToggleFold,
		onToggleSelect,
		onEdit,
		onAddChild,
		onFlag,
		onDuplicate,
		onDelete,
		canEdit = true
	}: Props = $props();

	// Projected case events are read-only. Everything else on the card
	// mirrors case-timeline visuals; only the edit-mutating affordances
	// are gated on this discriminator.
	const isProjected = $derived(event.war_room_source === 'case');
	const editable = $derived(canEdit && !isProjected);

	const eventDateObj = $derived(
		event.event_date ? new Date(event.event_date) : new Date(0)
	);
	const timeLabel = $derived(
		event.event_date
			? eventDateObj.toLocaleTimeString(undefined, {
					hour: '2-digit',
					minute: '2-digit',
					second: '2-digit',
					hour12: false
				})
			: '--:--:--'
	);
	const fullDateLabel = $derived(
		event.event_date ? eventDateObj.toLocaleString() : 'No date'
	);
	const hasChildren = $derived(childCount > 0);
	// Shared-event highlighting: numeric id match. Projected events
	// use string ids and won't collide.
	const isShared = $derived(
		typeof event.id === 'number' && event.id === getSharedEventId()
	);

	const tags = $derived(
		(event.tags ?? '')
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean)
	);

	// Color stripe accent. Prefer user-defined color; fall back to a
	// deterministic palette hash of the category so uncategorised
	// events still read as color-coded. Same palette as case card so
	// muscle memory carries over.
	const categoryPalette = [
		'#3b82f6',
		'#10b981',
		'#f59e0b',
		'#ef4444',
		'#8b5cf6',
		'#06b6d4',
		'#ec4899',
		'#84cc16',
		'#f97316',
		'#14b8a6'
	];

	const hashString = (s: string): number => {
		let h = 0;
		for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
		return h;
	};

	const accentColor = $derived(
		event.color && event.color.trim()
			? event.color
			: categoryPalette[hashString(event.category ?? 'Unspecified') % categoryPalette.length]
	);

	let menuOpen = $state(false);

	// Quick-search highlight inside the rendered markdown preview.
	// Same DOM-walking approach as the case card — string-replace
	// would break HTML elements produced by the sanitizer.
	let contentEl = $state<HTMLDivElement | null>(null);

	const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

	const highlightInElement = (root: HTMLElement, query: string) => {
		const previous = root.querySelectorAll('mark[data-quick-search]');
		previous.forEach((el) => {
			const parent = el.parentNode;
			if (!parent) return;
			while (el.firstChild) parent.insertBefore(el.firstChild, el);
			parent.removeChild(el);
			parent.normalize();
		});

		const q = query.trim();
		if (!q) return;

		const re = new RegExp(escapeRegExp(q), 'gi');
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
			acceptNode: (node) => {
				const parent = node.parentElement;
				if (!parent) return NodeFilter.FILTER_REJECT;
				const tag = parent.tagName;
				if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'MARK')
					return NodeFilter.FILTER_REJECT;
				return node.nodeValue && re.test(node.nodeValue)
					? NodeFilter.FILTER_ACCEPT
					: NodeFilter.FILTER_REJECT;
			}
		});

		const targets: Text[] = [];
		let current = walker.nextNode();
		while (current) {
			targets.push(current as Text);
			current = walker.nextNode();
		}

		for (const text of targets) {
			const value = text.nodeValue ?? '';
			re.lastIndex = 0;
			const frag = document.createDocumentFragment();
			let last = 0;
			let m: RegExpExecArray | null;
			while ((m = re.exec(value))) {
				if (m.index > last) {
					frag.appendChild(document.createTextNode(value.slice(last, m.index)));
				}
				const mark = document.createElement('mark');
				mark.setAttribute('data-quick-search', '');
				mark.textContent = m[0];
				frag.appendChild(mark);
				last = m.index + m[0].length;
				if (m[0].length === 0) re.lastIndex++;
			}
			if (last < value.length) {
				frag.appendChild(document.createTextNode(value.slice(last)));
			}
			text.parentNode?.replaceChild(frag, text);
		}
	};

	$effect(() => {
		const root = contentEl;
		if (!root) return;
		void event.content;
		void searchQuery;
		queueMicrotask(() => {
			if (contentEl) highlightInElement(contentEl, searchQuery);
		});
	});

	const copyShareLink = () => {
		if (typeof event.id !== 'number') {
			// Projected events — link to the source case's timeline event.
			if (event.case_id && event.event_id) {
				const url = `${window.location.origin}/case/${event.case_id}/timeline/?sharedEventId=${event.event_id}`;
				navigator.clipboard
					.writeText(url)
					.then(() => toast({ title: 'Link copied', variant: 'success' }))
					.catch(() => toast({ title: 'Could not copy link', variant: 'destructive' }));
			}
			return;
		}
		navigator.clipboard
			.writeText(getSharedEventUrl(event.id))
			.then(() => toast({ title: 'Link copied', variant: 'success' }))
			.catch(() => toast({ title: 'Could not copy link', variant: 'destructive' }));
	};

	const copyMarkdownLink = () => {
		if (typeof event.id !== 'number') {
			if (event.case_id && event.event_id) {
				const url = `${window.location.origin}/case/${event.case_id}/timeline/?sharedEventId=${event.event_id}`;
				navigator.clipboard
					.writeText(`[#${event.event_id} ${event.title ?? ''}](${url})`)
					.then(() => toast({ title: 'Markdown link copied', variant: 'success' }))
					.catch(() => toast({ title: 'Could not copy link', variant: 'destructive' }));
			}
			return;
		}
		navigator.clipboard
			.writeText(`[#${event.id} ${event.title ?? ''}](${getSharedEventUrl(event.id)})`)
			.then(() => toast({ title: 'Markdown link copied', variant: 'success' }))
			.catch(() => toast({ title: 'Could not copy link', variant: 'destructive' }));
	};
</script>

<div class={showRail ? 'relative pl-12' : 'relative'}>
	{#if showRail}
		<!--
		  Vertical rail piece per card. Truncates at the last item so
		  the timeline reads tidy at the bottom.
		-->
		<span
			aria-hidden="true"
			class="absolute left-[18px] top-0 w-px bg-border"
			style="bottom: {isLast ? '50%' : '0'}"
		></span>

		<span
			aria-hidden="true"
			class="absolute left-[12px] top-5 size-3 rounded-full ring-4 ring-background"
			style="background-color: {accentColor}"
		></span>
	{/if}

	<div
		data-event-id={event.id}
		class={[
			'group relative mb-2 rounded-xl border bg-card/80 shadow-sm ring-1 ring-black/5 backdrop-blur-md transition-all duration-200 supports-[backdrop-filter]:bg-card/70 dark:border-white/10 dark:bg-slate-900/80 dark:shadow-lg dark:shadow-black/40 dark:ring-white/10 dark:supports-[backdrop-filter]:bg-slate-900/70',
			'hover:-translate-y-px hover:shadow-md hover:ring-black/10 dark:hover:border-white/20 dark:hover:bg-slate-900/90 dark:hover:ring-white/20',
			isCurrentMatch
				? 'border-yellow-400 ring-2 ring-yellow-400/70 dark:border-yellow-300 dark:ring-yellow-300/60'
				: matched
					? 'border-yellow-400/50 ring-1 ring-yellow-400/40 dark:border-yellow-400/40'
					: selected
						? 'border-amber-500 ring-2 ring-amber-500/60'
						: isShared
							? 'border-red-500 ring-2 ring-red-500/60'
							: isProjected
								? 'border-primary/40'
								: 'border-border/60'
		]}
		role="button"
		tabindex="0"
		onclick={(e) => {
			if (!selecting) return;
			e.stopPropagation();
			onToggleSelect(event.id);
		}}
		onkeydown={(e) => {
			if (!selecting) return;
			if (e.key !== 'Enter' && e.key !== ' ') return;
			e.preventDefault();
			e.stopPropagation();
			onToggleSelect(event.id);
		}}
	>
		<!-- Category color stripe on the leading edge. -->
		<span
			aria-hidden="true"
			class="absolute inset-y-0 left-0 w-1 rounded-l-xl"
			style="background-color: {accentColor}"
		></span>

		<div class="px-4 py-3">
			<div class="min-w-0">
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-2 text-xs text-muted-foreground dark:text-slate-400">
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger class="font-mono tabular-nums">
									{timeLabel}
								</TooltipTrigger>
								<TooltipContent>{fullDateLabel}</TooltipContent>
							</Tooltip>
						</TooltipProvider>

						{#if event.category}
							<span
								class="rounded-full px-2 py-0.5 text-2xs font-medium"
								style="background-color: {accentColor}20; color: {accentColor}"
							>
								<Highlight text={event.category} query={searchQuery} />
							</span>
						{/if}

						{#if event.source}
							<span class="truncate text-2xs uppercase tracking-wide">
								· <Highlight text={event.source} query={searchQuery} />
							</span>
						{/if}

						{#if isProjected}
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger>
										<span
											class="rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0 text-2xs font-medium uppercase tracking-wider text-primary"
										>
											Case
										</span>
									</TooltipTrigger>
									<TooltipContent>Projected from a linked case timeline (read-only)</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						{/if}

						{#if event.is_flagged}
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger>
										<FlagIcon class="size-3 fill-red-500 text-red-500" aria-label="Flagged" />
									</TooltipTrigger>
									<TooltipContent>Flagged</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						{/if}

						<span class="text-2xs text-muted-foreground/70 dark:text-slate-500">
							#{event.id}
						</span>
					</div>

					<button
						type="button"
						class="mt-1 text-left text-sm font-semibold leading-tight text-foreground hover:underline dark:text-slate-100"
						disabled={!editable}
						onclick={(e) => {
							if (!editable) return;
							e.stopPropagation();
							onEdit(event.id);
						}}
					>
						<Highlight text={event.title ?? '(no title)'} query={searchQuery} />
					</button>

					{#if event.content}
						<div
							bind:this={contentEl}
							class="mt-1.5 max-h-40 min-w-0 overflow-hidden text-xs text-foreground/80 dark:text-slate-300 [&_*]:max-w-full [&_code]:whitespace-pre-wrap [&_code]:break-words [&_img]:max-w-full [&_mark]:rounded-sm [&_mark]:bg-yellow-300/60 [&_mark]:px-0.5 [&_mark]:text-foreground dark:[&_mark]:bg-yellow-400/40 [&_p]:break-words [&_pre]:overflow-x-hidden [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_pre]:dark:bg-slate-800/60 [&_code]:dark:bg-slate-800/60 [&_table]:block [&_table]:overflow-x-auto"
						>
							<MarkDownPreview markdown={event.content} />
						</div>
					{/if}

					{#if (event.assets?.length ?? 0) > 0 || (event.iocs?.length ?? 0) > 0 || tags.length > 0}
						<div class="mt-2 flex flex-wrap items-center gap-1">
							<!--
							  Aggregate asset/IOC pills. The case-timeline card
							  renders each linked asset as an interactive `Chip`
							  with hover context; we don't have hydrated asset /
							  IOC rows on the war-room side yet, so an aggregate
							  count is the honest render. If future work brings a
							  war-room asset/IOC hydration path we can drop in
							  the same `Chip` component here.
							-->
							{#if (event.assets?.length ?? 0) > 0}
								<span
									class="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-0 text-xs text-amber-700 dark:text-amber-300"
									title="Linked assets"
								>
									{event.assets.length}
									{event.assets.length === 1 ? 'asset' : 'assets'}
								</span>
							{/if}

							{#if (event.iocs?.length ?? 0) > 0}
								<span
									class="inline-flex items-center gap-0.5 rounded bg-red-500/15 px-1.5 py-0 text-xs text-red-700 dark:text-red-300"
									title="Linked IOCs"
								>
									{event.iocs.length}
									{event.iocs.length === 1 ? 'IOC' : 'IOCs'}
								</span>
							{/if}

							{#each tags as tag}
								<span
									class="inline-flex items-center rounded bg-muted px-1.5 py-0 text-2xs text-muted-foreground"
								>
									#<Highlight text={tag} query={searchQuery} />
								</span>
							{/each}
						</div>
					{/if}

					{#if hasChildren}
						<button
							type="button"
							class="mt-2 inline-flex items-center gap-1 text-2xs font-medium text-muted-foreground hover:text-foreground"
							onclick={(e) => {
								e.stopPropagation();
								onToggleFold();
							}}
						>
							{#if folded}
								<ChevronRightIcon class="size-3" />
								Show {childCount} child {childCount === 1 ? 'event' : 'events'}
							{:else}
								<ChevronDownIcon class="size-3" />
								Hide child {childCount === 1 ? 'event' : 'events'}
							{/if}
						</button>
					{/if}
				</div>

				<div
					class="absolute right-2 top-2 z-[1] flex shrink-0 items-center gap-0.5 rounded-md border border-border/40 bg-popover/95 px-1 py-0.5 opacity-0 shadow-md backdrop-blur transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 dark:border-slate-700 dark:bg-slate-800/95"
				>
					{#if editable}
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger>
									<Button
										variant="ghost"
										size="icon"
										class="size-7"
										onclick={() => onEdit(event.id)}
									>
										<EditIcon class="size-3.5" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>Edit</TooltipContent>
							</Tooltip>
						</TooltipProvider>

						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger>
									<Button
										variant="ghost"
										size="icon"
										class="size-7"
										onclick={() => onAddChild(event.id)}
									>
										<GitBranchPlusIcon class="size-3.5" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>Add child event</TooltipContent>
							</Tooltip>
						</TooltipProvider>

						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger>
									<Button
										variant="ghost"
										size="icon"
										class="size-7"
										onclick={() => onFlag(event.id)}
									>
										<FlagIcon
											class={`size-3.5 ${event.is_flagged ? 'fill-red-500 text-red-500' : ''}`}
										/>
									</Button>
								</TooltipTrigger>
								<TooltipContent>{event.is_flagged ? 'Unflag' : 'Flag'}</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					{/if}

					<DropdownMenu bind:open={menuOpen}>
						<DropdownMenuTrigger>
							<Button variant="ghost" size="icon" class="size-7">
								<MoreVerticalIcon class="size-3.5" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onclick={copyShareLink}>
								<ForwardIcon class="mr-2 size-3.5" /> Share
							</DropdownMenuItem>
							<DropdownMenuItem onclick={copyMarkdownLink}>
								<FileSymlinkIcon class="mr-2 size-3.5" /> Markdown link
							</DropdownMenuItem>
							{#if editable}
								<DropdownMenuItem onclick={() => onDuplicate(event.id)}>
									<CopyIcon class="mr-2 size-3.5" /> Duplicate
								</DropdownMenuItem>
								<Separator />
								<DropdownMenuItem
									class="text-red-500"
									onclick={() => onDelete(event.id)}
								>
									<Trash2Icon class="mr-2 size-3.5" /> Delete
								</DropdownMenuItem>
							{/if}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>
		</div>
	</div>
</div>
