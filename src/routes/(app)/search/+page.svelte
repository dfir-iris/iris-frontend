<!--
  Search across cases — Svelte port of the legacy search page,
  significantly expanded:
    • multi-select object types (IOC, Notes, Comments, Assets,
      Events, Tasks, Evidences) — query as many as needed in one shot;
    • unified result list with a type chip on each row + deep link to
      the linked entity (asset detail, note detail, timeline event, etc.);
    • server-side pagination (page + per_page);
    • access-scoped — server only returns rows from cases the current
      user has access to.

  Re-uses existing UI components — Card, Input, Button, Skeleton, Badge,
  toast — so the styling slots straight in with the rest of the app.
-->
<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { page as pageStore } from '$app/state';
	import { goto } from '$app/navigation';
	import {
		BiohazardIcon,
		BookOpenIcon,
		ChevronLeftIcon,
		ChevronRightIcon,
		ClockIcon,
		ComputerIcon,
		FileLock2Icon,
		FileTextIcon,
		MessageSquareTextIcon,
		SearchIcon,
		SquareCheckBigIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Card from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Badge } from '$lib/components/ui/badge';
	import { toast } from '$lib/components/ui/toast';
	import CaseScopePicker from '$lib/components/common/selects/CaseScopePicker.svelte';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import { CaseService } from '$lib/services/case.service';
	import type { Case } from '$lib/types/resources/case';
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

	// Catalog of selectable types. Order = display order in the chip row.
	const TYPE_CATALOG: { value: SearchType; label: string; Icon: typeof FileTextIcon; color: string }[] = [
		{ value: 'summaries', label: 'Summaries', Icon: BookOpenIcon, color: 'text-indigo-500' },
		{ value: 'ioc', label: 'IOC', Icon: BiohazardIcon, color: 'text-amber-500' },
		{ value: 'assets', label: 'Assets', Icon: ComputerIcon, color: 'text-sky-500' },
		{ value: 'events', label: 'Events', Icon: ClockIcon, color: 'text-emerald-500' },
		{ value: 'notes', label: 'Notes', Icon: FileTextIcon, color: 'text-blue-500' },
		{ value: 'tasks', label: 'Tasks', Icon: SquareCheckBigIcon, color: 'text-violet-500' },
		{ value: 'evidences', label: 'Evidence', Icon: FileLock2Icon, color: 'text-rose-500' },
		{ value: 'comments', label: 'Comments', Icon: MessageSquareTextIcon, color: 'text-violet-500' }
	];

	const ALL_TYPES = TYPE_CATALOG.map((t) => t.value);

	// State for the form + result list. Default to every type selected so
	// users can search broadly out-of-the-box and narrow down with the
	// chip toggles if they want a sharper query.
	let selectedTypes = $state<SearchType[]>([...ALL_TYPES]);
	let searchValue = $state('');
	let page = $state(1);
	let perPage = $state(25);

	// Optional case scope. `[]` = "All accessible cases" (no filter);
	// otherwise the list of selected case ids (as strings, so they
	// round-trip through the URL querystring without coercion).
	let selectedCaseIds = $state<string[]>([]);

	let loading = $state(false);
	let envelope = $state<SearchEnvelope | null>(null);
	let submitted = $state(false);

	// Snapshot of the last query so paginating doesn't re-read live form
	// fields (which the user could be editing while a previous query is in
	// flight). Page-change refetches use this snapshot.
	let lastQuery = $state<{ value: string; types: SearchType[]; case_ids: number[] } | null>(null);

	// Case scope: a single case id when the user has narrowed the search,
	// `''` otherwise. `CaseScopePicker` does server-side typeahead +
	// infinite scroll against GET /api/v2/cases?quick_search=…&page=…
	// — same primitives the topbar context-switcher uses.
	const cases = getContext<CasesContext>(CASES_CTX);

	// Pretty labels for the selected cases. Keyed by stringified case id
	// so the picker can read straight off `selectedCaseIds`. Resolved
	// from the cases store first; missing entries fall back to a single
	// GET so a shared link `?case_ids=42,57` shows friendly labels even
	// before either case is loaded into the store.
	let caseLabelsById = $state<Record<string, string>>({});

	const formatCaseLabel = (c: Case) => `#${c.case_id} · ${c.case_name}`;

	const resolveCaseLabel = async (id: number) => {
		const key = String(id);
		if (caseLabelsById[key]) return;
		const fromStore = cases.byId[id];
		if (fromStore) {
			caseLabelsById = { ...caseLabelsById, [key]: formatCaseLabel(fromStore) };
			return;
		}
		const res = await CaseService.get(id);
		if (res.ok && res.data && typeof res.data !== 'string') {
			caseLabelsById = { ...caseLabelsById, [key]: formatCaseLabel(res.data as Case) };
		} else {
			caseLabelsById = { ...caseLabelsById, [key]: `#${id}` };
		}
	};

	const onCaseScopeChange = (
		ids: string[],
		labels: Record<string, string>
	) => {
		selectedCaseIds = ids;
		// Merge the picker-provided labels into our cache so the trigger
		// summary stays accurate without round-tripping through the store.
		caseLabelsById = { ...caseLabelsById, ...labels };
	};

	// URL state: persist (q, types, page, per_page, case_ids) in the
	// querystring so refresh and link-sharing preserve the exact query.
	// We replaceState (not push) for in-page interactions so the browser
	// back button doesn't accumulate a step per keystroke / page click.
	const buildUrl = (
		q: string,
		types: SearchType[],
		p: number,
		pp: number,
		caseIds: string[]
	) => {
		const params = new URLSearchParams();
		params.set('q', q);
		if (types.length > 0) params.set('types', types.join(','));
		if (p > 1) params.set('page', String(p));
		if (pp !== 25) params.set('per_page', String(pp));
		if (caseIds.length > 0) params.set('case_ids', caseIds.join(','));
		return `?${params.toString()}`;
	};

	const writeUrl = (
		q: string,
		types: SearchType[],
		p: number,
		pp: number,
		caseIds: string[]
	) => {
		if (!browser) return;
		void goto(buildUrl(q, types, p, pp, caseIds), {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	};

	const parseTypesParam = (raw: string | null): SearchType[] => {
		if (!raw) return [];
		const all = new Set<SearchType>(ALL_TYPES);
		return raw
			.split(',')
			.map((s) => s.trim())
			.filter((s): s is SearchType => all.has(s as SearchType));
	};

	const toggleType = (t: SearchType) => {
		if (selectedTypes.includes(t)) {
			selectedTypes = selectedTypes.filter((x) => x !== t);
		} else {
			selectedTypes = [...selectedTypes, t];
		}
	};

	const selectAll = () => (selectedTypes = [...ALL_TYPES]);
	const selectNone = () => (selectedTypes = []);

	const stripHtml = (s: string) => s.replace(/<[^>]+>/g, '');

	const runQuery = async (
		q: { value: string; types: SearchType[]; case_ids: number[] },
		p: number
	) => {
		loading = true;
		try {
			const res = await SearchService.search({
				value: q.value,
				types: q.types,
				page: p,
				per_page: perPage,
				case_ids: q.case_ids.length > 0 ? q.case_ids : undefined
			});
			if (res.ok && res.data && typeof res.data !== 'string') {
				// API envelope: { data: SearchEnvelope } from response_api_success
				const body = res.data as unknown as SearchEnvelope | { data: SearchEnvelope };
				envelope = ('pagination' in body
					? (body as SearchEnvelope)
					: ((body as { data: SearchEnvelope }).data ?? null)) as SearchEnvelope | null;
			} else {
				envelope = null;
				toast({
					title: 'Search failed',
					description: res.error?.message ?? 'Unknown error',
					variant: 'destructive'
				});
			}
		} finally {
			loading = false;
		}
	};

	const submit = async () => {
		const value = searchValue.trim();
		if (!value) {
			toast({ title: 'Enter a search term', variant: 'warning' });
			return;
		}
		if (selectedTypes.length === 0) {
			toast({ title: 'Pick at least one object type', variant: 'warning' });
			return;
		}

		submitted = true;
		page = 1;
		const caseIdsNum = selectedCaseIds.map((s) => Number(s)).filter((n) => Number.isFinite(n));
		lastQuery = { value, types: [...selectedTypes], case_ids: caseIdsNum };
		writeUrl(value, selectedTypes, 1, perPage, selectedCaseIds);
		await runQuery(lastQuery, 1);
	};

	const goToPage = async (target: number) => {
		if (!lastQuery || !envelope) return;
		const totalPages = envelope.pagination.total_pages || 1;
		const clamped = Math.min(Math.max(1, target), totalPages);
		if (clamped === page) return;
		page = clamped;
		writeUrl(
			lastQuery.value,
			lastQuery.types,
			clamped,
			perPage,
			lastQuery.case_ids.map(String)
		);
		await runQuery(lastQuery, clamped);
	};

	// Hydrate from URL on mount. If `q` is present we auto-run the search
	// so a shared link lands on a fully-populated result page.
	onMount(() => {
		const params = pageStore.url.searchParams;
		const q = params.get('q') ?? '';
		const t = parseTypesParam(params.get('types'));
		const p = Number(params.get('page')) || 1;
		const pp = Number(params.get('per_page')) || 25;
		// Support both new `case_ids=1,2,3` and the older single-case
		// `case_id=42` (used briefly before this turn). If both are
		// present, the multi form wins.
		const rawCaseIds = params.get('case_ids') ?? params.get('case_id') ?? '';
		const cids = rawCaseIds
			.split(',')
			.map((s) => s.trim())
			.filter((s) => s.length > 0);

		if (q) searchValue = q;
		if (t.length > 0) selectedTypes = t;
		if (pp > 0) perPage = pp;
		if (p > 0) page = p;
		if (cids.length > 0) {
			selectedCaseIds = cids;
			// Fire-and-forget label resolution so the trigger summary
			// stops saying "Case #42" the moment the GET returns.
			for (const cid of cids) void resolveCaseLabel(Number(cid));
		}

		if (q && selectedTypes.length > 0) {
			submitted = true;
			lastQuery = {
				value: q,
				types: [...selectedTypes],
				case_ids: cids.map((s) => Number(s)).filter((n) => Number.isFinite(n))
			};
			void runQuery(lastQuery, page);
		}
	});

	const handleKey = (e: KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			void submit();
		}
	};

	// Per-type rendering helpers. Each builds:
	//   • a primary label
	//   • a secondary line (description, hash, ip…)
	//   • a deep-link href into the case-scoped UI.
	const renderRow = (row: SearchResultRow) => {
		switch (row.type) {
			case 'ioc': {
				const r = row as IocRow;
				return {
					primary: r.ioc_name,
					secondary: r.ioc_description ?? r.type_name,
					meta: r.type_name,
					href: `/case/${r.case_id}/iocs?ioc_id=${r.ioc_id}`
				};
			}
			case 'notes': {
				const r = row as NoteRow;
				return {
					primary: r.note_title,
					secondary: null,
					meta: 'Note',
					href: `/case/${r.case_id}/notes/${r.note_id}`
				};
			}
			case 'comments': {
				const r = row as CommentRow;
				return {
					primary: stripHtml(r.comment_text) || '—',
					secondary: null,
					meta: `Comment #${r.comment_id}`,
					href: `/case/${r.case_id}`
				};
			}
			case 'assets': {
				const r = row as AssetRow;
				const secondary = [r.asset_ip, r.asset_domain, r.asset_description]
					.filter(Boolean)
					.join(' · ');
				return {
					primary: r.asset_name,
					secondary: secondary || null,
					meta: r.asset_type_name,
					href: `/case/${r.case_id}/assets/${r.asset_id}`
				};
			}
			case 'events': {
				const r = row as EventRow;
				return {
					primary: r.event_title,
					secondary: r.event_content ? stripHtml(r.event_content) : null,
					meta: r.event_date ? new Date(r.event_date).toLocaleString() : 'Event',
					href: `/case/${r.case_id}/timeline?event_id=${r.event_id}`
				};
			}
			case 'tasks': {
				const r = row as TaskRow;
				return {
					primary: r.task_title,
					secondary: r.task_description,
					meta: r.status_name ?? 'Task',
					href: `/case/${r.case_id}/tasks/${r.task_id}`
				};
			}
			case 'evidences': {
				const r = row as EvidenceRow;
				const secondary = [r.file_description, r.file_hash].filter(Boolean).join(' · ');
				return {
					primary: r.filename,
					secondary: secondary || null,
					meta: 'Evidence',
					href: `/case/${r.case_id}/evidence`
				};
			}
			case 'summaries': {
				const r = row as SummaryRow;
				// The full description would blow out the row height; the
				// list here is a signal, the case page is where the operator
				// reads the whole thing.
				return {
					primary: r.case_name,
					secondary: r.summary_excerpt ? stripHtml(r.summary_excerpt) : null,
					meta: 'Summary',
					href: `/case/${r.case_id}`
				};
			}
		}
	};

	const typeMeta = (t: SearchType) => TYPE_CATALOG.find((c) => c.value === t)!;
</script>

<svelte:head>
	<title>Search | DFIR-IRIS</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-screen-2xl flex-col gap-6 p-8">
	<header class="flex items-center gap-3">
		<SearchIcon size={28} class="!stroke-2" />
		<h1>Search across cases</h1>
	</header>

	<Card.Root>
		<Card.Content class="flex flex-col gap-4 pt-6">
			<!--
			  Search row: term + scope picker + Search button on a single
			  line at md+. Picker sits next to the input so the case
			  scope reads as part of "what to search", not a separate
			  config row. The picker has its own min-width so the
			  trigger label ("All accessible cases" / "2 cases selected")
			  doesn't get truncated to uselessness.
			-->
			<div class="flex flex-col gap-2 md:flex-row md:items-stretch">
				<Input
					bind:value={searchValue}
					onkeydown={handleKey}
					placeholder="Search term — you can use % as a wildcard. Search is context-free."
					class="flex-1"
					aria-label="Search term"
				/>
				<div class="md:w-72">
					<CaseScopePicker
						values={selectedCaseIds}
						labels={caseLabelsById}
						onChange={onCaseScopeChange}
					/>
				</div>
				<Button onclick={submit} disabled={loading}>
					<SearchIcon size={14} class="mr-1.5" />
					{loading ? 'Searching…' : 'Search'}
				</Button>
			</div>

			<div class="flex flex-col gap-2">
				<div class="flex items-center justify-between gap-2">
					<span class="text-xs text-muted-foreground">Search within</span>
					<div class="flex items-center gap-1.5 text-2xs text-muted-foreground">
						<button type="button" class="hover:text-foreground" onclick={selectAll}>
							All
						</button>
						<span class="opacity-40">·</span>
						<button type="button" class="hover:text-foreground" onclick={selectNone}>
							None
						</button>
					</div>
				</div>

				<div class="flex flex-wrap gap-1.5">
					{#each TYPE_CATALOG as t}
						{@const active = selectedTypes.includes(t.value)}
						<button
							type="button"
							onclick={() => toggleType(t.value)}
							aria-pressed={active}
							class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors {active
								? 'border-primary/40 bg-primary/10 text-foreground'
								: 'border-border bg-card text-muted-foreground hover:bg-muted/50'}"
						>
							<t.Icon size={12} class={active ? t.color : 'opacity-70'} />
							{t.label}
						</button>
					{/each}
				</div>
			</div>

		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header class="flex flex-row items-center justify-between gap-2">
			<div class="flex items-center gap-2">
				<Card.Title>Results</Card.Title>
				{#if submitted && !loading && envelope}
					<span class="text-xs text-muted-foreground tabular-nums">
						{envelope.pagination.total}
					</span>
				{/if}
			</div>

			{#if envelope && envelope.pagination.total_pages > 1}
				<div class="flex items-center gap-2 text-xs">
					<Button
						variant="outline"
						size="sm"
						class="h-7 px-2"
						disabled={loading || page <= 1}
						onclick={() => goToPage(page - 1)}
						aria-label="Previous page"
					>
						<ChevronLeftIcon size={14} />
					</Button>
					<span class="tabular-nums text-muted-foreground">
						Page {envelope.pagination.page} / {envelope.pagination.total_pages}
					</span>
					<Button
						variant="outline"
						size="sm"
						class="h-7 px-2"
						disabled={loading || page >= envelope.pagination.total_pages}
						onclick={() => goToPage(page + 1)}
						aria-label="Next page"
					>
						<ChevronRightIcon size={14} />
					</Button>
				</div>
			{/if}
		</Card.Header>

		<Card.Content>
			{#if loading}
				<div class="space-y-2">
					{#each Array(5) as _}
						<Skeleton class="h-14 w-full" />
					{/each}
				</div>
			{:else if !submitted}
				<p class="py-8 text-center text-sm text-muted-foreground">
					Enter a term above and hit Search.
				</p>
			{:else if !envelope || envelope.data.length === 0}
				<p class="py-8 text-center text-sm text-muted-foreground">No results.</p>
			{:else}
				<ul class="divide-y">
					{#each envelope.data as row (`${row.type}-${row.result_id}`)}
						{@const view = renderRow(row)}
						{@const meta = typeMeta(row.type)}
						<li>
							<a
								href={view.href}
								class="flex flex-col gap-1 px-3 py-3 transition-colors hover:bg-muted/40"
							>
								<div class="flex items-start gap-2">
									<Badge
										variant="outline"
										class="shrink-0 border-border/60 bg-background"
									>
										<meta.Icon size={11} class={`mr-1 ${meta.color}`} />
										<span class="text-2xs">{meta.label}</span>
									</Badge>

									<div class="flex min-w-0 flex-1 flex-col gap-0.5">
										<span class="truncate text-sm font-medium" title={view.primary}>
											{view.primary}
										</span>
										{#if view.secondary}
											<span class="line-clamp-2 text-xs text-muted-foreground" title={view.secondary}>
												{view.secondary}
											</span>
										{/if}
										<div class="flex flex-wrap items-center gap-1.5 text-2xs text-muted-foreground">
											<span class="font-mono tabular-nums">#{row.case_id}</span>
											<span class="opacity-40">·</span>
											<span class="truncate" title={row.case_name}>{row.case_name}</span>
											{#if row.customer_name}
												<span class="opacity-40">·</span>
												<span class="truncate">{row.customer_name}</span>
											{/if}
											<span class="opacity-40">·</span>
											<span class="truncate">{view.meta}</span>
										</div>
									</div>
								</div>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
