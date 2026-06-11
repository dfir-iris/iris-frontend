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
		MessageSquareIcon,
		MoreVerticalIcon,
		Trash2Icon
	} from 'lucide-svelte';
	import type { CaseTimelineEvent } from '$lib/services/case-timeline.service';
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
	import Chip from '$lib/components/common/MarkDown/Chip.svelte';
	import { toast } from '$lib/stores/toast.store';
	import { getSharedEventId, getSharedEventUrl } from '../helpers';
	import Highlight from './highlight.svelte';

	type Props = {
		event: CaseTimelineEvent;
		childCount: number;
		commentsCount: number;
		folded: boolean;
		selected: boolean;
		selecting: boolean;
		isLast?: boolean;
		showRail?: boolean;
		matched?: boolean;
		isCurrentMatch?: boolean;
		searchQuery?: string;
		onToggleFold: () => void;
		onToggleSelect: (eventId: number) => void;
		onEdit: (eventId: number) => void;
		onAddChild: (eventId: number) => void;
		onFlag: (eventId: number) => void;
		onComments: (eventId: number) => void;
		onDuplicate: (eventId: number) => void;
		onDelete: (eventId: number) => void;
	};

	let {
		event,
		childCount,
		commentsCount,
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
		onComments,
		onDuplicate,
		onDelete
	}: Props = $props();

	const eventDateObj = $derived(new Date(event.event_date));
	const timeLabel = $derived(
		eventDateObj.toLocaleTimeString(undefined, {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false
		})
	);
	const fullDateLabel = $derived(eventDateObj.toLocaleString());
	const hasChildren = $derived(childCount > 0);
	const isShared = $derived(event.event_id === getSharedEventId());

	const tags = $derived(
		(event.event_tags ?? '')
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean)
	);

	// Color stripe for the event card. Prefer the user-defined color; fall
	// back to a deterministic palette keyed off the category name so the
	// timeline still reads as color-coded when nobody set a color.
	const categoryPalette = [
		'#3b82f6', // blue
		'#10b981', // emerald
		'#f59e0b', // amber
		'#ef4444', // red
		'#8b5cf6', // violet
		'#06b6d4', // cyan
		'#ec4899', // pink
		'#84cc16', // lime
		'#f97316', // orange
		'#14b8a6'  // teal
	];

	const hashString = (s: string): number => {
		let h = 0;
		for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
		return h;
	};

	const accentColor = $derived(
		event.event_color && event.event_color.trim()
			? event.event_color
			: categoryPalette[hashString(event.category_name ?? 'Unspecified') % categoryPalette.length]
	);

	let menuOpen = $state(false);

	// Quick-search highlight in the rendered markdown preview. The preview is
	// sanitized HTML, so a string-replace would break elements; instead we
	// walk text nodes only and wrap matching substrings in <mark>. The CSS
	// for <mark> lives on the wrapper div (uses Tailwind arbitrary variants).
	let contentEl = $state<HTMLDivElement | null>(null);

	const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

	const highlightInElement = (root: HTMLElement, query: string) => {
		// First, unwrap any previously-inserted <mark> elements so re-highlighting
		// after a query change starts from a clean slate.
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
				// Skip <script>, <style>, and existing marks (shouldn't happen
				// after the unwrap above but defensive).
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
		// Re-read these so the effect re-runs when either changes.
		void event.event_content;
		void searchQuery;
		// Defer one tick to let MarkDownPreview commit its DOM first.
		queueMicrotask(() => {
			if (contentEl) highlightInElement(contentEl, searchQuery);
		});
	});

	const copyShareLink = () => {
		navigator.clipboard
			.writeText(getSharedEventUrl(event.event_id))
			.then(() => toast({ title: 'Link copied', variant: 'success' }))
			.catch(() => toast({ title: 'Could not copy link', variant: 'destructive' }));
	};

	const copyMarkdownLink = () => {
		navigator.clipboard
			.writeText(`[#${event.event_id} ${event.event_title}](${getSharedEventUrl(event.event_id)})`)
			.then(() => toast({ title: 'Markdown link copied', variant: 'success' }))
			.catch(() => toast({ title: 'Could not copy link', variant: 'destructive' }));
	};
</script>

<div class={showRail ? 'relative pl-12' : 'relative'}>
	{#if showRail}
		<!--
		  Vertical rail piece per card. The full-page rail used to be a single
		  absolute element behind everything, but rendering it per-card lets us
		  truncate the line at the last item and stay tidy in virtualized scrolls.
		-->
		<span
			aria-hidden="true"
			class="absolute left-[18px] top-0 w-px bg-border"
			style="bottom: {isLast ? '50%' : '0'}"
		></span>

		<!-- Dot on the rail. Solid color so the timeline reads as a color-coded spine. -->
		<span
			aria-hidden="true"
			class="absolute left-[12px] top-5 size-3 rounded-full ring-4 ring-background"
			style="background-color: {accentColor}"
		></span>
	{/if}

	<div
		data-event-id={event.event_id}
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
							: 'border-border/60'
		]}
		role="button"
		tabindex="0"
		onclick={(e) => {
			if (!selecting) return;
			e.stopPropagation();
			onToggleSelect(event.event_id);
		}}
		onkeydown={(e) => {
			if (!selecting) return;
			if (e.key !== 'Enter' && e.key !== ' ') return;
			e.preventDefault();
			e.stopPropagation();
			onToggleSelect(event.event_id);
		}}
	>
		<!-- Category color stripe on the leading edge of the card. -->
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

						{#if event.category_name}
							<span class="rounded-full px-2 py-0.5 text-2xs font-medium" style="background-color: {accentColor}20; color: {accentColor}">
								<Highlight text={event.category_name} query={searchQuery} />
							</span>
						{/if}

						{#if event.event_source}
							<span class="truncate text-2xs uppercase tracking-wide">
								· <Highlight text={event.event_source} query={searchQuery} />
							</span>
						{/if}

						{#if event.event_is_flagged}
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger>
										<FlagIcon class="size-3 fill-red-500 text-red-500" aria-label="Flagged" />
									</TooltipTrigger>
									<TooltipContent>Flagged</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						{/if}

						{#if commentsCount}
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger>
										<button
											type="button"
											class="inline-flex items-center gap-0.5 rounded-full bg-blue-500/15 px-1.5 py-0.5 text-2xs font-medium text-blue-600 transition-colors hover:bg-blue-500/25 dark:text-blue-300"
											aria-label="{commentsCount} {commentsCount === 1 ? 'comment' : 'comments'}"
											onclick={(e) => {
												e.stopPropagation();
												onComments(event.event_id);
											}}
										>
											<MessageSquareIcon class="size-3" />
											{commentsCount}
										</button>
									</TooltipTrigger>
									<TooltipContent>
										{commentsCount} {commentsCount === 1 ? 'comment' : 'comments'}
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						{/if}

						<span class="text-2xs text-muted-foreground/70 dark:text-slate-500">
							#{event.event_id}
						</span>
					</div>

					<button
						type="button"
						class="mt-1 text-left text-sm font-semibold leading-tight text-foreground hover:underline dark:text-slate-100"
						onclick={(e) => {
							e.stopPropagation();
							onEdit(event.event_id);
						}}
					>
						<Highlight text={event.event_title} query={searchQuery} />
					</button>

					{#if event.event_content}
						<div
							bind:this={contentEl}
							class="mt-1.5 max-h-40 min-w-0 overflow-hidden text-xs text-foreground/80 dark:text-slate-300 [&_*]:max-w-full [&_code]:whitespace-pre-wrap [&_code]:break-words [&_img]:max-w-full [&_mark]:rounded-sm [&_mark]:bg-yellow-300/60 [&_mark]:px-0.5 [&_mark]:text-foreground dark:[&_mark]:bg-yellow-400/40 [&_p]:break-words [&_pre]:overflow-x-hidden [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_pre]:dark:bg-slate-800/60 [&_code]:dark:bg-slate-800/60 [&_table]:block [&_table]:overflow-x-auto"
						>
							<MarkDownPreview markdown={event.event_content} />
						</div>
					{/if}

					{#if (event.assets?.length ?? 0) > 0 || (event.iocs?.length ?? 0) > 0 || tags.length > 0}
						<div class="mt-2 flex flex-wrap items-center gap-1">
							{#each event.assets ?? [] as asset, i (asset.id ?? `a-${i}`)}
								{#if asset.id != null}
									<Chip
										kind="asset"
										id={asset.id}
										label={asset.asset_name ?? asset.name}
										title={asset.description ?? undefined}
									/>
								{:else}
									<span class="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1 py-0 text-xs text-amber-700 dark:text-amber-300">
										{asset.name}
									</span>
								{/if}
							{/each}

							{#each event.iocs ?? [] as ioc, i (ioc.id ?? `i-${i}`)}
								{#if ioc.id != null}
									<Chip
										kind="ioc"
										id={ioc.id}
										label={ioc.ioc_value ?? ioc.name}
										title={ioc.description ?? undefined}
									/>
								{:else}
									<span class="inline-flex items-center gap-0.5 rounded bg-red-500/15 px-1 py-0 text-xs text-red-700 dark:text-red-300">
										{ioc.name}
									</span>
								{/if}
							{/each}

							{#each tags as tag}
								<span class="inline-flex items-center rounded bg-muted px-1.5 py-0 text-2xs text-muted-foreground">
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

				<div class="absolute right-2 top-2 z-[1] flex shrink-0 items-center gap-0.5 rounded-md border border-border/40 bg-popover/95 px-1 py-0.5 opacity-0 shadow-md backdrop-blur transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 dark:border-slate-700 dark:bg-slate-800/95">
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger>
								<Button variant="ghost" size="icon" class="size-7" onclick={() => onEdit(event.event_id)}>
									<EditIcon class="size-3.5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Edit</TooltipContent>
						</Tooltip>
					</TooltipProvider>

					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger>
								<Button variant="ghost" size="icon" class="size-7" onclick={() => onAddChild(event.event_id)}>
									<GitBranchPlusIcon class="size-3.5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Add child event</TooltipContent>
						</Tooltip>
					</TooltipProvider>

					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger>
								<Button variant="ghost" size="icon" class="size-7" onclick={() => onFlag(event.event_id)}>
									<FlagIcon class={`size-3.5 ${event.event_is_flagged ? 'fill-red-500 text-red-500' : ''}`} />
								</Button>
							</TooltipTrigger>
							<TooltipContent>{event.event_is_flagged ? 'Unflag' : 'Flag'}</TooltipContent>
						</Tooltip>
					</TooltipProvider>

					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger>
								<Button
									variant="ghost"
									size="icon"
									class="relative size-7"
									onclick={() => onComments(event.event_id)}
								>
									<MessageSquareIcon class="size-3.5" />
									{#if commentsCount}
										<span class="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-semibold text-white">
											{commentsCount}
										</span>
									{/if}
								</Button>
							</TooltipTrigger>
							<TooltipContent>Comments</TooltipContent>
						</Tooltip>
					</TooltipProvider>

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
							<DropdownMenuItem onclick={() => onDuplicate(event.event_id)}>
								<CopyIcon class="mr-2 size-3.5" /> Duplicate
							</DropdownMenuItem>
							<Separator />
							<DropdownMenuItem class="text-red-500" onclick={() => onDelete(event.event_id)}>
								<Trash2Icon class="mr-2 size-3.5" /> Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>
		</div>
	</div>
</div>
