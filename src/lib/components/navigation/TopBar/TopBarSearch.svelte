<!--
  Global topbar search.

  Collapsed: a magnifier icon button.
  On hover (or focus / keyboard activation), the icon expands into an
  inline input. Typing a 2+-character term fires a debounced query
  against `GET /api/v2/search` and shows results in a floating dropdown.

  Features:
    • Scope toggle — search the current case only, or everywhere the
      user has access to. Defaults to "current case" when there is a
      current case, otherwise "everywhere".
    • Infinite scroll — IntersectionObserver on a sentinel inside the
      result list. Fetches the next page transparently.
    • Result rows are deep-linked to the right place in the case-scoped
      UI (asset detail / note detail / timeline / etc.).
    • Press Ctrl/Cmd+/ to focus the input from anywhere, Esc to dismiss.
-->
<script lang="ts">
	import { getContext, onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page as pageStore } from '$app/state';
	import {
		BiohazardIcon,
		BookOpenIcon,
		ClockIcon,
		ComputerIcon,
		FileLock2Icon,
		FileTextIcon,
		MessageSquareTextIcon,
		SearchIcon,
		SquareCheckBigIcon,
		XIcon
	} from 'lucide-svelte';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import {
		SearchService,
		type SearchEnvelope,
		type SearchResultRow,
		type SearchType,
		type IocRow,
		type NoteRow,
		type CommentRow,
		type AssetRow,
		type EventRow,
		type TaskRow,
		type EvidenceRow,
		type SummaryRow
	} from '$lib/services/search.service';

	const cases = getContext<CasesContext>(CASES_CTX);

	// Type metadata mirrors the /search page so chips look identical
	// across the two surfaces.
	const TYPE_META: Record<SearchType, { label: string; Icon: typeof FileTextIcon; color: string }> =
		{
			ioc: { label: 'IOC', Icon: BiohazardIcon, color: 'text-amber-500' },
			assets: { label: 'Asset', Icon: ComputerIcon, color: 'text-sky-500' },
			events: { label: 'Event', Icon: ClockIcon, color: 'text-emerald-500' },
			notes: { label: 'Note', Icon: FileTextIcon, color: 'text-blue-500' },
			tasks: { label: 'Task', Icon: SquareCheckBigIcon, color: 'text-violet-500' },
			evidences: { label: 'Evidence', Icon: FileLock2Icon, color: 'text-rose-500' },
			comments: { label: 'Comment', Icon: MessageSquareTextIcon, color: 'text-violet-500' },
			summaries: { label: 'Summary', Icon: BookOpenIcon, color: 'text-indigo-500' }
		};
	const ALL_TYPES: SearchType[] = Object.keys(TYPE_META) as SearchType[];

	// Two presentation modes share one piece of state:
	//   • inline input (md+): permanently visible; the dropdown is shown
	//     whenever the input has focus or the user is reading results.
	//   • icon trigger (< md): a magnifier opens a popover that contains
	//     the same input + dropdown.
	let inputEl = $state<HTMLInputElement | null>(null);
	// Distinct ref for the narrow-viewport overlay input. Two `bind:this`
	// on the same identifier would race when both inputs exist in the
	// DOM simultaneously (Tailwind's `hidden` only hides, doesn't
	// unmount), so each presentation owns its own ref.
	let mobileInputEl = $state<HTMLInputElement | null>(null);
	let rootEl = $state<HTMLDivElement | null>(null);
	let sentinelEl = $state<HTMLDivElement | null>(null);
	let inputFocused = $state(false);
	// Narrow-viewport overlay toggle. Independent from `inputFocused` so
	// users can scroll the dropdown without it collapsing the moment a
	// result button steals focus.
	let mobileOpen = $state(false);

	let query = $state('');
	let scope = $state<'current' | 'everywhere'>('everywhere');

	let rows = $state<SearchResultRow[]>([]);
	let totalPages = $state(0);
	let total = $state(0);
	let page = $state(1);
	const PER_PAGE = 25;

	let loading = $state(false);
	let loadingMore = $state(false);
	let error = $state<string | null>(null);

	// `currentCaseId` is derived from the URL — that's the only source
	// that's *truly* current. `app.state.currentCaseID` was a stale
	// fallback (it kept the last visited case after navigating away),
	// which caused "In current case" to silently scope to whatever case
	// the user had last opened — even from /dashboard. Reading the URL
	// param keeps this deterministic.
	const currentCaseId = $derived.by<number | null>(() => {
		const match = pageStore.url.pathname.match(/^\/case\/(\d+)\b/);
		if (match) return Number(match[1]);
		// Fall back to the context value only as a hint for the default
		// toggle state; we still won't *send* it unless we're inside a
		// case route (see `buildRequest`).
		const fromCtx = cases.currentCaseId();
		return typeof fromCtx === 'number' && fromCtx > 0 ? fromCtx : null;
	});

	// Whether the user is *actually* on a case route. We only send
	// `case_id` to the backend when this is true — otherwise "In current
	// case" would silently scope to a stale id.
	const insideCase = $derived(/^\/case\/(\d+)\b/.test(pageStore.url.pathname));

	// If the user leaves the case route while the scope is set to
	// "current", auto-flip to "everywhere" — otherwise we'd be quietly
	// scoping to nothing.
	$effect(() => {
		if (!insideCase && scope === 'current') {
			scope = 'everywhere';
		}
	});

	// Initialise scope based on whether the user is currently inside a
	// case. We do this once on mount so it doesn't flip mid-typing.
	onMount(() => {
		scope = insideCase ? 'current' : 'everywhere';

		// Ctrl/Cmd + "/" anywhere to focus the search input. On narrow
		// viewports we also pop the overlay open. Using a modifier
		// shortcut means we don't have to bail out when the user is
		// already typing in another input — the chord is safe to
		// intercept everywhere. Browsers default-bind Ctrl+/ on some
		// platforms (Quick Find in Firefox); we preventDefault to claim
		// it for the app.
		const onKey = (e: KeyboardEvent) => {
			const isSlashChord = e.key === '/' && (e.ctrlKey || e.metaKey);
			if (isSlashChord) {
				e.preventDefault();
				// Focus whichever input is currently visible. On md+ the
				// inline input is mounted and visible; below md we open
				// the mobile overlay first so its input exists.
				if (window.matchMedia('(min-width: 768px)').matches) {
					inputEl?.focus();
				} else {
					mobileOpen = true;
					queueMicrotask(() => mobileInputEl?.focus());
				}
			} else if (e.key === 'Escape') {
				dismiss();
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	// Close when clicking outside. We only need this when the dropdown
	// would actually be visible, otherwise we'd burn cycles on every
	// click on the page.
	const onDocMouseDown = (e: MouseEvent) => {
		const root = rootEl;
		const tgt = e.target as Node | null;
		if (root && tgt && !root.contains(tgt)) {
			dismiss();
		}
	};

	$effect(() => {
		if (dropdownVisible || mobileOpen) {
			document.addEventListener('mousedown', onDocMouseDown);
		} else {
			document.removeEventListener('mousedown', onDocMouseDown);
		}
		return () => document.removeEventListener('mousedown', onDocMouseDown);
	});

	const dismiss = () => {
		inputFocused = false;
		mobileOpen = false;
		inputEl?.blur();
		mobileInputEl?.blur();
		// Don't clear the query — coming back to the same search after
		// glancing at something else feels right. Clearing here would be
		// surprising.
	};

	// Show the dropdown whenever the user is engaging with the search:
	// they've focused the input, OR the narrow-viewport overlay is open.
	// Either gate is enough — that way scrolling the list and clicking a
	// result button (which steals focus from the input) doesn't close it.
	const dropdownVisible = $derived(inputFocused || mobileOpen);

	// Debounced auto-run. We re-fetch any time `query` or `scope`
	// changes; a 250ms idle is enough to feel snappy but skip every
	// keystroke in a fast typist's burst.
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let runId = 0;

	const cancelDebounce = () => {
		if (debounceTimer) clearTimeout(debounceTimer);
	};

	const scheduleSearch = () => {
		cancelDebounce();
		debounceTimer = setTimeout(() => {
			void runFirstPage();
		}, 250);
	};

	$effect(() => {
		const q = query.trim();
		// Bail and clear when the input is too short.
		if (q.length < 2) {
			rows = [];
			total = 0;
			totalPages = 0;
			page = 1;
			error = null;
			loading = false;
			cancelDebounce();
			return;
		}
		// Touching scope, query, the current case id, or whether we're
		// inside a case restarts the search — that way switching cases
		// or selecting a different scope refreshes the dropdown live.
		void scope;
		void q;
		void currentCaseId;
		void insideCase;
		scheduleSearch();
	});

	const buildRequest = (p: number) => ({
		value: query.trim(),
		types: ALL_TYPES,
		page: p,
		per_page: PER_PAGE,
		// Only send `case_id` when the user is actually viewing a case
		// AND has explicitly picked the "current" scope. This prevents
		// the stale-context bug where leaving a case page kept silently
		// filtering subsequent searches by it.
		case_id: scope === 'current' && insideCase && currentCaseId != null ? currentCaseId : undefined
	});

	const runFirstPage = async () => {
		const q = query.trim();
		if (q.length < 2) return;

		const id = ++runId;
		loading = true;
		error = null;
		page = 1;
		try {
			const res = await SearchService.search(buildRequest(1));
			if (id !== runId) return; // Stale response, ignore.
			if (res.ok && res.data && typeof res.data !== 'string') {
				const body = res.data as unknown as SearchEnvelope | { data: SearchEnvelope };
				const env =
					'pagination' in body ? (body as SearchEnvelope) : (body as { data: SearchEnvelope }).data;
				rows = env.data;
				total = env.pagination.total;
				totalPages = env.pagination.total_pages;
			} else {
				rows = [];
				total = 0;
				totalPages = 0;
				error = res.error?.message ?? 'Search failed';
			}
		} finally {
			if (id === runId) loading = false;
		}
	};

	const loadMore = async () => {
		if (loadingMore || loading) return;
		if (page >= totalPages) return;

		const next = page + 1;
		loadingMore = true;
		const id = runId;
		try {
			const res = await SearchService.search(buildRequest(next));
			if (id !== runId) return;
			if (res.ok && res.data && typeof res.data !== 'string') {
				const body = res.data as unknown as SearchEnvelope | { data: SearchEnvelope };
				const env =
					'pagination' in body ? (body as SearchEnvelope) : (body as { data: SearchEnvelope }).data;
				rows = [...rows, ...env.data];
				page = next;
				total = env.pagination.total;
				totalPages = env.pagination.total_pages;
			}
		} finally {
			loadingMore = false;
		}
	};

	// IntersectionObserver wires the sentinel at the bottom of the list
	// to the loadMore call. We re-observe when the sentinel re-mounts
	// (the {#if} below tears it down on empty/error/over states).
	let observer: IntersectionObserver | null = null;
	$effect(() => {
		if (!sentinelEl) return;
		observer?.disconnect();
		observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					void loadMore();
				}
			},
			{ root: null, rootMargin: '120px', threshold: 0 }
		);
		observer.observe(sentinelEl);
		return () => observer?.disconnect();
	});

	onDestroy(() => {
		observer?.disconnect();
		cancelDebounce();
	});

	const stripHtml = (s: string) => s.replace(/<[^>]+>/g, '');

	// Re-uses the same row-render fan-out as the /search page. Kept
	// inline because the dropdown row needs a tighter, single-line
	// layout than the full results page.
	const renderRow = (row: SearchResultRow) => {
		switch (row.type) {
			case 'ioc': {
				const r = row as IocRow;
				return {
					primary: r.ioc_name,
					secondary: r.type_name,
					href: `/case/${r.case_id}/iocs?ioc_id=${r.ioc_id}`
				};
			}
			case 'notes': {
				const r = row as NoteRow;
				return {
					primary: r.note_title,
					secondary: null as string | null,
					href: `/case/${r.case_id}/notes/${r.note_id}`
				};
			}
			case 'comments': {
				const r = row as CommentRow;
				return {
					primary: stripHtml(r.comment_text) || '—',
					secondary: null,
					href: `/case/${r.case_id}`
				};
			}
			case 'assets': {
				const r = row as AssetRow;
				return {
					primary: r.asset_name,
					secondary: r.asset_ip ?? r.asset_domain ?? r.asset_type_name,
					href: `/case/${r.case_id}/assets/${r.asset_id}`
				};
			}
			case 'events': {
				const r = row as EventRow;
				return {
					primary: r.event_title,
					secondary: r.event_date ? new Date(r.event_date).toLocaleString() : null,
					href: `/case/${r.case_id}/timeline?event_id=${r.event_id}`
				};
			}
			case 'tasks': {
				const r = row as TaskRow;
				return {
					primary: r.task_title,
					secondary: r.status_name,
					href: `/case/${r.case_id}/tasks/${r.task_id}`
				};
			}
			case 'evidences': {
				const r = row as EvidenceRow;
				return {
					primary: r.filename,
					secondary: r.file_hash ?? r.file_description,
					href: `/case/${r.case_id}/evidence`
				};
			}
			case 'summaries': {
				const r = row as SummaryRow;
				return {
					primary: r.case_name,
					secondary: r.summary_excerpt ? stripHtml(r.summary_excerpt) : null,
					href: `/case/${r.case_id}`
				};
			}
		}
	};

	const choose = (href: string) => {
		dismiss();
		void goto(href);
	};

	const openFullPage = () => {
		const params = new URLSearchParams();
		params.set('q', query.trim());
		params.set('types', ALL_TYPES.join(','));
		dismiss();
		void goto(`/search?${params.toString()}`);
	};

	// Narrow-viewport magnifier: open the overlay and focus its input.
	const openMobile = () => {
		mobileOpen = true;
		queueMicrotask(() => mobileInputEl?.focus());
	};
</script>

<div bind:this={rootEl} class="relative flex items-center">
	<!--
	  Inline input — visible at md+ where there's room for it. The input
	  stays mounted (no expand animation) and is the canonical input on
	  desktop. The dropdown anchors to this same root.
	-->
	<div
		class="hidden items-center gap-1 rounded-md border border-white/15 bg-white/10 pl-2 pr-1 transition-colors focus-within:border-white/35 focus-within:bg-white/15 md:flex"
	>
		<SearchIcon size={14} class="text-white/70" />
		<input
			bind:this={inputEl}
			bind:value={query}
			type="text"
			placeholder="Search… (ctrl + /)"
			aria-label="Search across cases"
			class="h-8 w-40 min-w-0 bg-transparent text-sm text-white outline-none placeholder:text-white/50 lg:w-52 xl:w-64 2xl:w-72"
			onfocus={() => (inputFocused = true)}
			onkeydown={(e) => {
				if (e.key === 'Escape') dismiss();
				if (e.key === 'Enter') openFullPage();
			}}
		/>
		{#if query}
			<button
				type="button"
				class="inline-flex size-6 items-center justify-center rounded text-white/60 hover:bg-white/10 hover:text-white"
				aria-label="Clear"
				onclick={() => (query = '')}
			>
				<XIcon size={12} />
			</button>
		{/if}
	</div>

	<!--
	  Narrow viewports: just a magnifier. Clicking it opens an overlay
	  containing the same input + dropdown, anchored to the icon.
	-->
	<button
		type="button"
		class="inline-flex h-8 w-8 items-center justify-center rounded-md text-white/85 transition-colors hover:bg-white/10 hover:text-white md:hidden"
		aria-label="Search (Ctrl + /)"
		aria-expanded={mobileOpen}
		onclick={openMobile}
	>
		<SearchIcon size={16} />
	</button>

	{#if mobileOpen}
		<!--
		  Mobile overlay: a borrowed input sits at the top of the
		  dropdown so the user can type with the icon-only trigger.
		  We hide it on md+ as a defence-in-depth — the inline input
		  is the canonical surface there.
		-->
		<div
			class="shadow-elevation-3 absolute right-0 top-[calc(100%+6px)] z-50 flex w-[min(36rem,calc(100vw-1rem))] items-center gap-1 rounded-md border border-border bg-popover px-2 py-1 md:hidden"
		>
			<SearchIcon size={14} class="text-muted-foreground" />
			<input
				bind:this={mobileInputEl}
				bind:value={query}
				type="text"
				placeholder="Search…"
				aria-label="Search across cases"
				class="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
				onfocus={() => (inputFocused = true)}
				onkeydown={(e) => {
					if (e.key === 'Escape') dismiss();
					if (e.key === 'Enter') openFullPage();
				}}
			/>
			{#if query}
				<button
					type="button"
					class="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted/60 hover:text-foreground"
					aria-label="Clear"
					onclick={() => (query = '')}
				>
					<XIcon size={12} />
				</button>
			{/if}
			<button
				type="button"
				class="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted/60 hover:text-foreground"
				aria-label="Close search"
				onclick={dismiss}
			>
				<XIcon size={14} />
			</button>
		</div>
	{/if}

	<!--
	  Shared dropdown panel. Anchored to the root container so it shows
	  beneath whichever input is currently visible. Gated by
	  `dropdownVisible` so it appears only when the user is engaging
	  with the search (input focused OR mobile overlay open).
	-->
	{#if dropdownVisible}
		<div
			role="dialog"
			aria-label="Search results"
			class="shadow-elevation-3 absolute right-0 top-[calc(100%+6px)] z-50 w-[min(36rem,calc(100vw-1rem))] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground"
		>
			<!-- Scope toggle -->
			<div class="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
				<div
					class="inline-flex items-center overflow-hidden rounded-md border border-border text-xs"
					role="tablist"
					aria-label="Search scope"
				>
					<button
						type="button"
						role="tab"
						aria-selected={scope === 'current'}
						disabled={!insideCase}
						title={insideCase ? '' : 'Open a case to enable this scope'}
						onclick={() => (scope = 'current')}
						class="px-2.5 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50 {scope ===
						'current'
							? 'bg-primary/10 text-primary'
							: 'text-muted-foreground hover:bg-muted/50'}"
					>
						In current case
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={scope === 'everywhere'}
						onclick={() => (scope = 'everywhere')}
						class="px-2.5 py-1 transition-colors {scope === 'everywhere'
							? 'bg-primary/10 text-primary'
							: 'text-muted-foreground hover:bg-muted/50'}"
					>
						Everywhere
					</button>
				</div>

				<!--
				  Small live indicator of what scope the next query will hit.
				  Helps confirm that "In current case" really is sending
				  the current case_id (the bug we kept circling on).
				-->
				<div class="flex items-center gap-2 text-2xs text-muted-foreground">
					{#if scope === 'current' && insideCase && currentCaseId != null}
						<span class="tabular-nums">
							scope: case #{currentCaseId}
						</span>
					{:else}
						<span>scope: all accessible cases</span>
					{/if}
					<button
						type="button"
						class="transition-colors hover:text-foreground disabled:opacity-40"
						disabled={query.trim().length < 2}
						onclick={openFullPage}
					>
						Open in Search →
					</button>
				</div>
			</div>

			<div class="max-h-[24rem] overflow-y-auto">
				{#if query.trim().length < 2}
					<p class="px-3 py-6 text-center text-xs text-muted-foreground">
						Type at least two characters.
					</p>
				{:else if loading && rows.length === 0}
					<p class="px-3 py-6 text-center text-xs text-muted-foreground">Searching…</p>
				{:else if error}
					<p class="px-3 py-6 text-center text-xs text-destructive">{error}</p>
				{:else if rows.length === 0}
					<p class="px-3 py-6 text-center text-xs text-muted-foreground">No results.</p>
				{:else}
					<ul class="divide-y">
						{#each rows as row (`${row.type}-${row.result_id}`)}
							{@const view = renderRow(row)}
							{@const meta = TYPE_META[row.type]}
							<li>
								<button
									type="button"
									class="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/60"
									onclick={() => choose(view.href)}
								>
									<span
										class="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded border border-border/60 bg-background px-1.5 py-0.5 text-2xs"
									>
										<meta.Icon size={10} class={meta.color} />
										{meta.label}
									</span>
									<span class="flex min-w-0 flex-1 flex-col gap-0.5">
										<span class="truncate text-sm font-medium" title={view.primary}>
											{view.primary}
										</span>
										<span class="flex items-center gap-1.5 text-2xs text-muted-foreground">
											<span class="font-mono tabular-nums">#{row.case_id}</span>
											<span class="opacity-40">·</span>
											<span class="truncate" title={row.case_name}>{row.case_name}</span>
											{#if view.secondary}
												<span class="opacity-40">·</span>
												<span class="truncate">{view.secondary}</span>
											{/if}
										</span>
									</span>
								</button>
							</li>
						{/each}
					</ul>

					{#if page < totalPages}
						<div
							bind:this={sentinelEl}
							class="px-3 py-2 text-center text-2xs text-muted-foreground"
						>
							{loadingMore ? 'Loading more…' : ''}
						</div>
					{:else if total > 0}
						<div class="px-3 py-2 text-center text-2xs text-muted-foreground">
							{total} result{total === 1 ? '' : 's'}.
						</div>
					{/if}
				{/if}
			</div>
		</div>
	{/if}
</div>
