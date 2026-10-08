<!--
  War-room "Scope" tab.

  The assets and IOCs of every attached case the caller can read, in one
  place: spot the same machine tracked in several cases, set or remove
  status flags in bulk, push objects into the cases that are missing
  them, and drain the war-room staging inbox. The server only
  ever returns cases the caller can read; writes are re-checked per case
  (full access + attached) and come back as one result per case.
  Assets and IOCs are paged server-side (with per-case totals) so a room
  with hundreds of cases and thousands of objects stays responsive;
  selections survive page changes.
-->
<script lang="ts">
	import { getContext, onMount, untrack } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import {
		AlertTriangle,
		Bug,
		Columns3,
		Download,
		Flag,
		Inbox,
		Loader2,
		Pin,
		Plus,
		ShieldPlus,
		Rows3,
		Search,
		Send,
		Server,
		ShieldAlert,
		XIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Switch } from '$lib/components/ui/switch';
	import { Popover, PopoverContent, PopoverTrigger } from '$lib/components/ui/popover';
	import { SearchableSelect } from '$lib/components/ui/searchable-select';
	import { toast } from '$lib/components/ui/toast';
	import { USER_CTX, type UserCtx } from '$lib/contexts/user-context.context.svelte';
	import { assetFlags, loadAssetFlags } from '$lib/stores/asset-flags.store.svelte';
	import type { AssetFlag } from '$lib/services/asset-flags.service';
	import { AssetTypesService, type AssetType } from '$lib/services/asset-types.service';
	import {
		AnalysisStatusService,
		type AnalysisStatusItem
	} from '$lib/services/analysis-status.service';
	import { IocTypesService, type IocType } from '$lib/services/ioc-types.service';
	import { TlpService, type TlpItem } from '$lib/services/tlp.service';
	import {
		WarRoomScopeService,
		type ScopeAsset,
		type ScopeAssetCaseTotals,
		type ScopeAssetPage,
		type ScopeCase,
		type ScopeExportFormat,
		type ScopeFlagAction,
		type ScopeIocPage,
		type StagedObject
	} from '$lib/services/war-room-scope.service';
	import ScopeAssetsTable from './components/scope-assets-table.svelte';
	import ScopeFlagBoard from './components/scope-flag-board.svelte';
	import ScopeIocsMatrix from './components/scope-iocs-matrix.svelte';
	import ScopeStaging from './components/scope-staging.svelte';
	import ScopeFlagDialog from './components/scope-flag-dialog.svelte';
	import ScopePushDialog from './components/scope-push-dialog.svelte';
	import ScopeAddDialog from './components/scope-add-dialog.svelte';
	import ScopePager from './components/scope-pager.svelte';
	import ScopeVulnerabilitiesMatrix from './components/scope-vulnerabilities-matrix.svelte';
	import ScopeRecordVulnerabilityDialog from './components/scope-record-vulnerability-dialog.svelte';
	import ScopeTrackVulnerabilityDialog from './components/scope-track-vulnerability-dialog.svelte';
	import VulnerabilityFormDialog from '$lib/components/vulnerabilities/VulnerabilityFormDialog.svelte';
	import {
		canCreateVulnerability,
		canReadVulnerabilities,
		vulnerabilityTabFallback
	} from '$lib/components/vulnerabilities/permissions';
	import type { VulnerabilityChoice } from '$lib/components/vulnerabilities/findings/finding-form';
	import { apiErrorMessage } from '$lib/utils/error-handler';
	import {
		VulnerabilitiesService,
		type VulnerabilityInput,
		type VulnerabilityMatrix,
		type VulnerabilityMatrixRow
	} from '$lib/services/vulnerabilities.service';
	import {
		VULNERABLE_FILTERS,
		parseVulnerableFilter,
		scopeVulnIdentifiers,
		type VulnerableFilter
	} from './components/vulnerability-helpers';
	import {
		buildIocRows,
		errorMessage,
		groupSightings,
		summariseOutcomes,
		type IocRow,
		type ScopeOutcome
	} from './components/helpers';

	type Tab = 'assets' | 'iocs' | 'vulnerabilities' | 'staging';
	const TABS: { key: Tab; label: string; icon: typeof Server }[] = [
		{ key: 'assets', label: 'Assets', icon: Server },
		{ key: 'iocs', label: 'IOCs', icon: Bug },
		{ key: 'vulnerabilities', label: 'Vulnerabilities', icon: ShieldAlert },
		{ key: 'staging', label: 'Staging', icon: Inbox }
	];

	const userCtx = getContext<UserCtx>(USER_CTX);
	// The backend is authoritative (war-room write + full access on each
	// case); this only hides controls that would be refused anyway.
	const canWrite = $derived(userCtx?.can('war_rooms_write') === true);
	// Vulnerability data needs `vulnerabilities_read`: without it the tab,
	// the filters and the Vulns column are hidden (the API refuses them).
	const canReadVulns = $derived(userCtx ? canReadVulnerabilities(userCtx) : false);
	const permsReady = $derived(userCtx?.ready === true);
	// Catalogue entries and case findings are not war-room objects: each
	// case re-checks its own write access.
	const canRecord = $derived(userCtx ? canCreateVulnerability(userCtx) : false);
	// Tracking an entry on the room is a war-room write.
	const canTrack = $derived(canWrite && canRecord);
	const visibleTabs = $derived(TABS.filter((t) => t.key !== 'vulnerabilities' || canReadVulns));

	const warRoomId = $derived(Number(page.params.war_room_id));

	const tabFromUrl = (): Tab => {
		const t = page.url.searchParams.get('tab');
		return t === 'iocs' || t === 'vulnerabilities' || t === 'staging' ? t : 'assets';
	};
	let tab = $state<Tab>(tabFromUrl());
	let assetView = $state<'table' | 'board'>(
		page.url.searchParams.get('view') === 'board' ? 'board' : 'table'
	);

	// --- Filters --------------------------------------------------------
	// Initial values can come from the URL so the Board can deep-link
	// (`?compromised=1`, `?vulnerable=open|exploited|none`, `?flag=<id>|none`,
	// `?case=<id>`, `?vulnerability=<identifier>`).
	const positiveIntParam = (name: string): number | null => {
		const n = Number(page.url.searchParams.get(name));
		return Number.isInteger(n) && n > 0 ? n : null;
	};
	const flagFromUrl = (): number | 'none' | null =>
		page.url.searchParams.get('flag') === 'none' ? 'none' : positiveIntParam('flag');

	let search = $state('');
	let debouncedSearch = $state('');
	let caseFilter = $state<number | null>(positiveIntParam('case'));
	let flagFilter = $state<number | 'none' | null>(flagFromUrl());
	let compromisedOnly = $state(page.url.searchParams.get('compromised') === '1');
	let vulnerableFilter = $state<VulnerableFilter | null>(
		parseVulnerableFilter(page.url.searchParams.get('vulnerable'))
	);
	// Applied on Enter / change / tag click, not per keystroke: a partial
	// CVE identifier is refused by the backend.
	const vulnerabilityFromUrl = page.url.searchParams.get('vulnerability')?.trim() || null;
	let vulnerabilityFilter = $state<string | null>(vulnerabilityFromUrl);
	let vulnerabilityInput = $state(vulnerabilityFromUrl ?? '');
	const applyVulnerabilityFilter = (value: string | null) => {
		const next = value?.trim() || null;
		vulnerabilityInput = next ?? '';
		vulnerabilityFilter = next;
	};
	let groupByCase = $state(true);
	let searchTimer: ReturnType<typeof setTimeout> | null = null;

	const onSearch = (value: string) => {
		search = value;
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => (debouncedSearch = search), 300);
	};

	const anyFilterActive = $derived(
		search.trim() !== '' ||
			caseFilter !== null ||
			flagFilter !== null ||
			compromisedOnly ||
			(canReadVulns && (vulnerableFilter !== null || vulnerabilityFilter !== null))
	);

	const clearFilters = () => {
		search = '';
		debouncedSearch = '';
		caseFilter = null;
		flagFilter = null;
		compromisedOnly = false;
		vulnerableFilter = null;
		applyVulnerabilityFilter(null);
	};

	// --- Data -----------------------------------------------------------
	const PER_PAGE = 100;
	let assetsRes = $state<ScopeAssetPage | null>(null);
	let iocsRes = $state<ScopeIocPage | null>(null);
	let assetsPage = $state(1);
	let iocsPage = $state(1);
	// Grouped tables need the page ordered by case so groups are contiguous.
	const assetSort = $derived<'name' | 'case'>(
		groupByCase && caseFilter === null && assetView === 'table' ? 'case' : 'name'
	);
	let staging = $state<StagedObject[]>([]);
	let loadingAssets = $state(true);
	let loadingIocs = $state(true);
	let loadingStaging = $state(true);
	let cases = $state<ScopeCase[]>([]);

	let assetTypes = $state<AssetType[]>([]);
	let analysisStatuses = $state<AnalysisStatusItem[]>([]);
	let iocTypes = $state<IocType[]>([]);
	let tlps = $state<TlpItem[]>([]);

	const flags = $derived(assetFlags.items);

	/**
	 * Load the current assets page. `prune` (filters changed) drops the
	 * selected assets that are not on the new page; page changes and
	 * reloads after an action keep the selection.
	 */
	let assetsSeq = 0;
	const loadAssets = async (prune = false) => {
		const seq = ++assetsSeq;
		loadingAssets = assetsRes === null;
		const res = await WarRoomScopeService.listAssets(warRoomId, {
			q: debouncedSearch,
			case_id: caseFilter ?? undefined,
			flag_id: flagFilter ?? undefined,
			compromised: compromisedOnly,
			vulnerable: canReadVulns ? (vulnerableFilter ?? undefined) : undefined,
			vulnerability: canReadVulns ? (vulnerabilityFilter ?? undefined) : undefined,
			page: assetsPage,
			per_page: PER_PAGE,
			sort: assetSort
		});
		if (seq !== assetsSeq) return;
		if (res.ok && res.data && typeof res.data !== 'string') {
			assetsRes = res.data;
			cases = res.data.cases ?? [];
			for (const a of res.data.data) assetCache.set(a.asset_id, a);
			if (prune) {
				const ids = new Set(res.data.data.map((a) => a.asset_id));
				selectedAssets = selectedAssets.filter((id) => ids.has(id));
			}
			// Past the last page (rows removed meanwhile): step back.
			const total = res.data.total ?? 0;
			if (res.data.data.length === 0 && assetsPage > 1 && total > 0) {
				assetsPage = Math.max(1, Math.ceil(total / PER_PAGE));
				void loadAssets();
			}
		} else {
			toast({
				title: 'Could not load the scope assets',
				description: errorMessage(res, 'The server refused the request.'),
				variant: 'destructive'
			});
		}
		loadingAssets = false;
	};

	let iocsSeq = 0;
	const loadIocs = async (prune = false) => {
		const seq = ++iocsSeq;
		loadingIocs = iocsRes === null;
		const res = await WarRoomScopeService.listIocs(warRoomId, {
			q: debouncedSearch,
			case_id: caseFilter ?? undefined,
			page: iocsPage,
			per_page: PER_PAGE
		});
		if (seq !== iocsSeq) return;
		if (res.ok && res.data && typeof res.data !== 'string') {
			iocsRes = res.data;
			cases = res.data.cases ?? cases;
			for (const r of buildIocRows(res.data.data)) iocRowCache.set(r.key, r);
			if (prune) {
				const keys = new Set(res.data.data.map((i) => i.group_key));
				selectedIocs = selectedIocs.filter((k) => keys.has(k));
			}
			const total = res.data.total ?? 0;
			if (res.data.data.length === 0 && iocsPage > 1 && total > 0) {
				iocsPage = Math.max(1, Math.ceil(total / PER_PAGE));
				void loadIocs();
			}
		} else {
			toast({
				title: 'Could not load the scope IOCs',
				description: errorMessage(res, 'The server refused the request.'),
				variant: 'destructive'
			});
		}
		loadingIocs = false;
	};

	// The matrix is paged and filtered server-side (search, case). Reloaded
	// after every record / create / track, and when the tab is shown again
	// once the page is older than MATRIX_STALE_MS (findings also change
	// from the case pages) — not on every tab switch.
	const MATRIX_STALE_MS = 60_000;
	const MATRIX_PER_PAGE = 50;
	let matrix = $state<VulnerabilityMatrix | null>(null);
	let loadingMatrix = $state(true);
	let matrixPage = $state(1);
	let matrixSeq = 0;
	let matrixLoadedAt = 0;
	const loadMatrix = async () => {
		const seq = ++matrixSeq;
		loadingMatrix = matrix === null;
		const res = await VulnerabilitiesService.warRoomMatrix(warRoomId, {
			page: matrixPage,
			per_page: MATRIX_PER_PAGE,
			search: debouncedSearch,
			case_id: caseFilter
		});
		if (seq !== matrixSeq) return;
		if (res.ok && res.data && typeof res.data === 'object') {
			matrix = res.data;
			matrixLoadedAt = Date.now();
			// Past the last page (rows untracked or fixed meanwhile): back to it.
			const total = res.data.total ?? 0;
			if (res.data.vulnerabilities.length === 0 && matrixPage > 1 && total > 0) {
				matrixPage = Math.max(1, Math.ceil(total / MATRIX_PER_PAGE));
				void loadMatrix();
			}
		} else {
			toast({
				title: 'Could not load the scope vulnerabilities',
				description: errorMessage(res, 'The server refused the request.'),
				variant: 'destructive'
			});
		}
		loadingMatrix = false;
	};

	const loadStaging = async () => {
		const res = await WarRoomScopeService.listStaging(warRoomId);
		if (res.ok && Array.isArray(res.data)) staging = res.data;
		loadingStaging = false;
	};

	const loadTaxonomies = async () => {
		const [types, statuses, iTypes, tlpRes] = await Promise.all([
			AssetTypesService.list(),
			AnalysisStatusService.list(),
			IocTypesService.list(),
			TlpService.list()
		]);
		if (types.ok && Array.isArray(types.data)) assetTypes = types.data;
		if (statuses.ok && Array.isArray(statuses.data)) analysisStatuses = statuses.data;
		if (iTypes.ok && Array.isArray(iTypes.data)) iocTypes = iTypes.data;
		if (tlpRes.ok && Array.isArray(tlpRes.data)) tlps = tlpRes.data;
	};

	onMount(() => {
		void loadAssetFlags();
		void loadTaxonomies();
		void loadStaging();
		return () => {
			if (searchTimer) clearTimeout(searchTimer);
		};
	});

	// Server-side filters: back to page 1 and refetch whenever they (or
	// the room, or the order) change. The loaders read their own state
	// (previous result, selection), so they run untracked: only the
	// listed inputs re-trigger a fetch.
	$effect(() => {
		void [
			warRoomId,
			debouncedSearch,
			caseFilter,
			flagFilter,
			compromisedOnly,
			vulnerableFilter,
			vulnerabilityFilter,
			canReadVulns,
			assetSort
		];
		untrack(() => {
			assetsPage = 1;
			void loadAssets(true);
		});
	});
	$effect(() => {
		void [warRoomId, debouncedSearch, caseFilter];
		untrack(() => {
			iocsPage = 1;
			void loadIocs(true);
		});
	});

	const goAssetsPage = (p: number) => {
		assetsPage = p;
		void loadAssets();
	};
	const goIocsPage = (p: number) => {
		iocsPage = p;
		void loadIocs();
	};
	const goMatrixPage = (p: number) => {
		matrixPage = p;
		void loadMatrix();
	};
	// Loaded up front (for the tab count), back to page 1 whenever the
	// room or the filters change. Never without vulnerability read.
	let matrixRoom: number | null = null;
	$effect(() => {
		const room = warRoomId;
		const readable = canReadVulns;
		void [debouncedSearch, caseFilter];
		untrack(() => {
			if (!readable) return;
			if (room !== matrixRoom) {
				matrixRoom = room;
				matrix = null;
			}
			matrixPage = 1;
			void loadMatrix();
		});
	});
	// Refreshed when the Vulnerabilities tab is (re)activated with a stale
	// page: findings change from the case pages too.
	$effect(() => {
		const active = tab === 'vulnerabilities';
		untrack(() => {
			if (
				active &&
				canReadVulns &&
				matrix !== null &&
				Date.now() - matrixLoadedAt > MATRIX_STALE_MS
			) {
				void loadMatrix();
			}
		});
	});

	// Without vulnerability read (once known): off the Vulnerabilities tab,
	// and the vulnerability filters (e.g. from a Board deep link) dropped.
	$effect(() => {
		if (!permsReady || canReadVulns) return;
		untrack(() => {
			const next = vulnerabilityTabFallback(tab, false, true, 'assets') as Tab;
			if (next !== tab) selectTab(next);
			if (vulnerableFilter !== null) vulnerableFilter = null;
			if (vulnerabilityFilter !== null) applyVulnerabilityFilter(null);
		});
	});

	const selectTab = (next: Tab) => {
		tab = next;
		const url = new URL(page.url);
		if (next === 'assets') url.searchParams.delete('tab');
		else url.searchParams.set('tab', next);
		void goto(url, { replaceState: true, noScroll: true, keepFocus: true });
	};

	const assets = $derived(assetsRes?.data ?? []);
	const sightings = $derived(groupSightings(assets));
	const caseTotals = $derived(
		assetsRes?.case_totals
			? new Map<number, ScopeAssetCaseTotals>(assetsRes.case_totals.map((t) => [t.case_id, t]))
			: undefined
	);
	const flagTotals = $derived(
		assetsRes?.flag_totals
			? new Map<number | null, number>(assetsRes.flag_totals.map((t) => [t.flag_id, t.assets]))
			: undefined
	);
	const vulnIdentifiers = $derived(scopeVulnIdentifiers(assets));
	const iocRows = $derived<IocRow[]>(buildIocRows(iocsRes?.data ?? []));
	const caseFilterItems = $derived([
		{ value: 'all', label: 'All cases' },
		...cases.map((c) => ({ value: String(c.case_id), label: `#${c.case_id} ${c.case_name}` }))
	]);
	const matrixRows = $derived(matrix?.vulnerabilities ?? []);
	const truncated = $derived(
		tab === 'assets' ? !!assetsRes?.truncated : tab === 'iocs' ? !!iocsRes?.truncated : false
	);
	const truncatedLimit = $derived(tab === 'assets' ? assetsRes?.limit : iocsRes?.limit);

	const tabCount = (key: Tab): number | null => {
		if (key === 'assets') return assetsRes ? (assetsRes.total ?? assets.length) : null;
		if (key === 'iocs') return iocsRes ? (iocsRes.total ?? iocRows.length) : null;
		if (key === 'vulnerabilities') return matrix ? (matrix.total ?? matrixRows.length) : null;
		return loadingStaging ? null : staging.length;
	};

	// --- Selection ------------------------------------------------------
	// Selections span pages: rows are resolved from every row loaded so far.
	let selectedAssets = $state<number[]>([]);
	let selectedIocs = $state<string[]>([]);
	const assetCache = new SvelteMap<number, ScopeAsset>();
	const iocRowCache = new SvelteMap<string, IocRow>();
	const selectedAssetRows = $derived(
		selectedAssets.map((id) => assetCache.get(id)).filter((a): a is ScopeAsset => !!a)
	);
	const selectedIocRows = $derived(
		selectedIocs.map((k) => iocRowCache.get(k)).filter((r): r is IocRow => !!r)
	);
	const selectedCaseCount = $derived(new Set(selectedAssetRows.map((a) => a.case_id)).size);

	// --- Flag dialog ----------------------------------------------------
	let flagOpen = $state(false);
	let flagTargets = $state<ScopeAsset[]>([]);
	let flagInitialId = $state<number | null | undefined>(undefined);
	let flagInitialAction = $state<ScopeFlagAction>('set');

	const openFlag = (
		rows: ScopeAsset[],
		flagId?: number | null,
		action: ScopeFlagAction = 'set'
	) => {
		flagTargets = rows;
		flagInitialId = flagId;
		flagInitialAction = action;
		flagOpen = true;
	};

	const afterFlag = () => {
		selectedAssets = [];
		void loadAssets();
	};

	// Board drop: set directly unless the flag needs a reason or a
	// decision, in which case the dialog collects them first.
	const setFlag = async (asset: ScopeAsset, flag: AssetFlag) => {
		if (flag.requires_reason || flag.requires_decision) {
			openFlag([asset], flag.id, 'set');
			return;
		}
		const res = await WarRoomScopeService.bulkFlag(warRoomId, {
			asset_ids: [asset.asset_id],
			flag_id: flag.id,
			action: 'set'
		});
		if (!res.ok || !res.data || typeof res.data === 'string') {
			toast({
				title: 'Could not set the flag',
				description: errorMessage(res, 'The server refused the change.'),
				variant: 'destructive'
			});
			return;
		}
		const result = res.data.results[0];
		if (result && (result.status === 'denied' || result.status === 'error')) {
			toast({
				title: 'Could not set the flag',
				description: result.message ?? `Flag change ${result.status} for ${asset.asset_name}.`,
				variant: 'destructive'
			});
		} else {
			toast({ title: `${asset.asset_name}: ${flag.name} set`, variant: 'success' });
		}
		void loadAssets();
	};

	// --- Push dialog (assets and IOCs share it) -------------------------
	let pushOpen = $state(false);
	let pushTitle = $state('');
	let pushDescription = $state('');
	let pushSources = $state<{ customer_id: number | null; customer_name: string | null }[]>([]);
	let pushInitial = $state<number[]>([]);
	let pushDisabled = $state<number[]>([]);
	let pushRun = $state<(caseIds: number[]) => Promise<ScopeOutcome[] | null>>(async () => null);
	let pushAfter = $state<() => void>(() => {});

	let pushDisabledNote = $state('source');

	const pushFailed = (description: string) => {
		toast({ title: 'Could not push', description, variant: 'destructive' });
	};

	const openAssetPush = (rows: ScopeAsset[]) => {
		if (rows.length === 0) return;
		const names = new Map(rows.map((a) => [a.asset_id, a.asset_name]));
		pushTitle =
			rows.length === 1 ? `Push ${rows[0].asset_name}` : `Push ${rows.length} assets to cases`;
		pushDescription =
			'Copies name, type, description, IP, domain, tags, compromise and analysis status. The flags are not copied.';
		pushSources = rows;
		pushInitial = [];
		pushDisabled = rows.length === 1 ? [rows[0].case_id] : [];
		pushDisabledNote = 'source';
		pushRun = async (caseIds) => {
			const res = await WarRoomScopeService.pushAssets(warRoomId, {
				asset_ids: rows.map((a) => a.asset_id),
				case_ids: caseIds
			});
			if (!res.ok || !res.data || typeof res.data === 'string') {
				pushFailed(errorMessage(res, 'The server refused the request.'));
				return null;
			}
			return res.data.results.map((r) => ({
				case_id: r.case_id,
				status: r.status,
				label: names.get(r.asset_id ?? -1) ?? `Asset #${r.asset_id}`,
				message: r.message
			}));
		};
		pushAfter = () => {
			selectedAssets = [];
			void loadAssets();
		};
		pushOpen = true;
	};

	const openIocPush = (rows: IocRow[], initial: number[] = []) => {
		if (rows.length === 0) return;
		const names = new Map(rows.map((r) => [r.first.ioc_id, r.first.ioc_value]));
		pushTitle =
			rows.length === 1 ? `Push ${rows[0].first.ioc_value}` : `Push ${rows.length} IOCs to cases`;
		pushDescription = 'Copies value, type, TLP, description and tags.';
		pushSources = rows.flatMap((r) => r.items);
		pushInitial = initial;
		pushDisabled = rows.length === 1 ? [...rows[0].caseIds] : [];
		pushDisabledNote = 'already there';
		pushRun = async (caseIds) => {
			const res = await WarRoomScopeService.pushIocs(warRoomId, {
				ioc_ids: rows.map((r) => r.first.ioc_id),
				case_ids: caseIds
			});
			if (!res.ok || !res.data || typeof res.data === 'string') {
				pushFailed(errorMessage(res, 'The server refused the request.'));
				return null;
			}
			return res.data.results.map((r) => ({
				case_id: r.case_id,
				status: r.status,
				label: names.get(r.ioc_id ?? -1) ?? `IOC #${r.ioc_id}`,
				message: r.message
			}));
		};
		pushAfter = () => {
			selectedIocs = [];
			void loadIocs();
		};
		pushOpen = true;
	};

	const runPush = async (caseIds: number[]) => {
		const rows = await pushRun(caseIds);
		if (rows && !rows.some((r) => r.status === 'denied' || r.status === 'error')) {
			toast({ title: 'Pushed', description: summariseOutcomes(rows), variant: 'success' });
		}
		return rows;
	};

	// --- Add dialog -----------------------------------------------------
	let addOpen = $state(false);
	let addKind = $state<'asset' | 'ioc'>('asset');

	const openAdd = (kind: 'asset' | 'ioc') => {
		addKind = kind;
		addOpen = true;
	};

	const afterAdd = () => {
		if (addKind === 'asset') void loadAssets();
		else void loadIocs();
	};

	// --- Vulnerabilities: catalogue entry + record on assets -------------
	let recordOpen = $state(false);
	let recordAssets = $state<ScopeAsset[]>([]);
	let recordChoice = $state<VulnerabilityChoice | null>(null);
	let recordDescription = $state<string | null>(null);

	const openRecord = (
		rows: ScopeAsset[],
		choice: VulnerabilityChoice | null = null,
		description: string | null = null
	) => {
		recordAssets = rows;
		recordChoice = choice;
		recordDescription = description;
		recordOpen = true;
	};

	const afterRecord = () => {
		selectedAssets = [];
		void loadAssets();
		void loadMatrix();
	};

	let vulnFormOpen = $state(false);
	let vulnSaving = $state(false);

	const createVulnerability = async (payload: VulnerabilityInput) => {
		vulnSaving = true;
		try {
			const res = await VulnerabilitiesService.create(payload);
			if (res.ok && res.data && typeof res.data === 'object') {
				const created = res.data;
				vulnFormOpen = false;
				// Created from the war room: tracked on it straight away, so it
				// is listed here even before any asset is found affected.
				const tracked =
					canTrack &&
					(await VulnerabilitiesService.warRoomTrack(warRoomId, {
						vulnerability_id: created.vulnerability_id
					}).then(
						(r) => r.ok,
						() => false
					));
				toast({
					title: `Created ${created.identifier}`,
					description: tracked ? 'Tracked on the war room.' : undefined,
					variant: 'success'
				});
				void loadMatrix();
				// Offer to record it straight away; cancelling keeps it
				// tracked (or in the catalogue only).
				openRecord(
					[],
					{ type: 'existing', vulnerability: created },
					`${created.identifier} is ${tracked ? 'tracked on the war room' : 'in the catalogue'}. Pick the scope assets it affects, or cancel to record it later.`
				);
			} else if (res.status !== 403) {
				toast({
					title: 'Failed to create the vulnerability',
					description: apiErrorMessage(res, 'Unknown error'),
					variant: 'destructive'
				});
			}
		} finally {
			vulnSaving = false;
		}
	};

	// --- Vulnerabilities: tracked on the war room ------------------------
	let trackOpen = $state(false);

	const trackRow = async (row: VulnerabilityMatrixRow) => {
		const v = row.vulnerability;
		const res = await VulnerabilitiesService.warRoomTrack(warRoomId, {
			vulnerability_id: v.vulnerability_id
		});
		if (res.ok) {
			toast({ title: `${v.identifier} tracked`, variant: 'success' });
			void loadMatrix();
		}
	};

	const untrackRow = async (row: VulnerabilityMatrixRow) => {
		const v = row.vulnerability;
		const res = await VulnerabilitiesService.warRoomUntrack(warRoomId, v.vulnerability_id);
		if (res.ok) {
			toast({
				title: `${v.identifier} no longer tracked`,
				description: row.totals.findings > 0 ? 'Its findings are kept and still listed.' : undefined
			});
			void loadMatrix();
		}
	};

	const saveTrackedNote = async (
		row: VulnerabilityMatrixRow,
		note: string | null
	): Promise<boolean> => {
		const res = await VulnerabilitiesService.warRoomUpdateTracked(
			warRoomId,
			row.vulnerability.vulnerability_id,
			note
		);
		if (res.ok) void loadMatrix();
		return res.ok === true;
	};

	// --- Export ---------------------------------------------------------
	let exportOpen = $state(false);
	let includeRed = $state(false);
	let exporting = $state<ScopeExportFormat | null>(null);

	const exportIocs = async (format: ScopeExportFormat) => {
		if (exporting) return;
		exporting = format;
		const res = await WarRoomScopeService.exportIocs(warRoomId, format, includeRed);
		exporting = null;
		if (!res.ok) {
			toast({
				title: 'Export failed',
				description: res.error.message,
				variant: 'destructive'
			});
			return;
		}
		WarRoomScopeService.saveFile(res.value);
		exportOpen = false;
	};
</script>

<div class="flex h-full w-full flex-col gap-4 overflow-y-auto p-4 sm:p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 class="text-lg font-semibold">Scope</h2>
			<p class="text-xs text-muted-foreground">
				Assets and IOCs across every attached case you can access. Set flags in bulk and push
				objects to the cases missing them.
			</p>
		</div>
		{#if canWrite}
			<div class="flex items-center gap-2">
				<Button variant="outline" onclick={() => openAdd('asset')} class="gap-1.5">
					<Server class="h-4 w-4" /> Add asset
				</Button>
				<Button onclick={() => openAdd('ioc')} class="gap-1.5">
					<Plus class="h-4 w-4" /> Add IOC
				</Button>
			</div>
		{/if}
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<div
			class="flex items-center gap-0.5 rounded-md border p-0.5"
			role="tablist"
			aria-label="Scope"
		>
			{#each visibleTabs as t (t.key)}
				{@const Icon = t.icon}
				{@const count = tabCount(t.key)}
				<button
					type="button"
					role="tab"
					aria-selected={tab === t.key}
					class={[
						'inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors',
						tab === t.key
							? 'bg-secondary text-secondary-foreground'
							: 'text-muted-foreground hover:text-foreground'
					]}
					onclick={() => selectTab(t.key)}
					data-testid={`scope-tab-${t.key}`}
				>
					<Icon class="h-3.5 w-3.5" />
					{t.label}
					{#if count !== null}
						<span class="rounded-full bg-muted px-1.5 text-2xs tabular-nums text-muted-foreground">
							{count}
						</span>
					{/if}
				</button>
			{/each}
		</div>

		{#if tab === 'assets'}
			<div class="flex items-center gap-0.5 rounded-md border p-0.5">
				<Button
					size="icon"
					variant={assetView === 'table' ? 'secondary' : 'ghost'}
					class="h-7 w-7"
					onclick={() => (assetView = 'table')}
					aria-label="Table view"
					title="Table view"
				>
					<Rows3 class="h-4 w-4" />
				</Button>
				<Button
					size="icon"
					variant={assetView === 'board' ? 'secondary' : 'ghost'}
					class="h-7 w-7"
					onclick={() => (assetView = 'board')}
					aria-label="Flag board view"
					title="Flag board — drag a card onto a flag to set it"
					data-testid="scope-view-board"
				>
					<Columns3 class="h-4 w-4" />
				</Button>
			</div>
		{/if}

		{#if tab === 'vulnerabilities' && canRecord && canReadVulns}
			<div class="ml-auto flex items-center gap-2">
				{#if canTrack}
					<Button
						variant="outline"
						size="sm"
						class="gap-1.5"
						onclick={() => (trackOpen = true)}
						data-testid="scope-vuln-track-open"
					>
						<Pin class="h-3.5 w-3.5" /> Track vulnerability
					</Button>
				{/if}
				<Button
					variant="outline"
					size="sm"
					class="gap-1.5"
					onclick={() => (vulnFormOpen = true)}
					data-testid="scope-vuln-new"
				>
					<Plus class="h-3.5 w-3.5" /> New vulnerability
				</Button>
				<Button
					size="sm"
					class="gap-1.5"
					onclick={() => openRecord([])}
					disabled={cases.length === 0}
					data-testid="scope-vuln-record"
				>
					<ShieldPlus class="h-3.5 w-3.5" /> Record on assets
				</Button>
			</div>
		{/if}

		{#if tab === 'iocs'}
			<Popover bind:open={exportOpen}>
				<PopoverTrigger>
					<Button variant="outline" size="sm" class="gap-1.5">
						<Download class="h-3.5 w-3.5" /> Export
					</Button>
				</PopoverTrigger>
				<PopoverContent align="start" class="w-64 p-3">
					<p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						Export blocklist
					</p>
					<p class="mt-1 text-2xs text-muted-foreground">
						Every IOC you can see in the attached cases, deduplicated.
					</p>
					<label class="mt-3 flex items-center gap-2 text-xs" for="scope-export-red">
						<Checkbox
							id="scope-export-red"
							checked={includeRed}
							onCheckedChange={(v) => (includeRed = !!v)}
						/>
						Include TLP:RED
					</label>
					<div class="mt-3 flex flex-col gap-1">
						{#each [{ f: 'txt', l: 'Plain text (one per line)' }, { f: 'csv', l: 'CSV' }, { f: 'stix', l: 'STIX 2.1 bundle' }] as opt (opt.f)}
							<Button
								variant="ghost"
								size="sm"
								class="justify-start gap-2"
								disabled={exporting !== null}
								onclick={() => exportIocs(opt.f as ScopeExportFormat)}
							>
								{#if exporting === opt.f}
									<Loader2 class="h-3.5 w-3.5 animate-spin" />
								{:else}
									<Download class="h-3.5 w-3.5" />
								{/if}
								{opt.l}
							</Button>
						{/each}
					</div>
				</PopoverContent>
			</Popover>
		{/if}
	</div>

	{#if tab !== 'staging'}
		<div class="flex flex-wrap items-center gap-2 rounded-md border bg-card/40 px-3 py-2">
			<div class="relative min-w-[240px] flex-1">
				<Search
					class="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					value={search}
					oninput={(e) => onSearch((e.target as HTMLInputElement).value)}
					placeholder={tab === 'assets'
						? 'Filter by name, IP, domain, tags…'
						: tab === 'vulnerabilities'
							? 'Filter by identifier or title…'
							: 'Filter by value, description, tags…'}
					class="h-8 pl-7 text-xs"
					aria-label="Search"
				/>
			</div>

			<div class="flex shrink-0 items-center gap-1.5 text-2xs">
				<span class="text-muted-foreground" id="scope-filter-case-label">Case</span>
				<SearchableSelect
					id="scope-filter-case"
					class="w-56 text-xs"
					items={caseFilterItems}
					value={caseFilter == null ? 'all' : String(caseFilter)}
					onValueChange={(v) => {
						caseFilter = v && v !== 'all' ? Number(v) : null;
					}}
					placeholder="All cases"
					searchPlaceholder="Search #id, name…"
					aria-label="Filter by case"
				/>
			</div>

			{#if tab === 'assets'}
				<label class="flex shrink-0 items-center gap-1.5 text-2xs" for="scope-filter-flag">
					<span class="text-muted-foreground">Flag</span>
					<select
						id="scope-filter-flag"
						class="h-8 rounded-md border bg-background px-2 text-xs"
						value={flagFilter == null ? '' : String(flagFilter)}
						onchange={(e) => {
							const v = (e.target as HTMLSelectElement).value;
							flagFilter = v === '' ? null : v === 'none' ? 'none' : Number(v);
						}}
					>
						<option value="">All flags</option>
						<option value="none">No flag</option>
						{#each flags as f (f.id)}
							<option value={String(f.id)}>{f.name}</option>
						{/each}
					</select>
				</label>

				<label class="flex shrink-0 items-center gap-1.5 text-2xs" for="scope-filter-compromised">
					<Checkbox
						id="scope-filter-compromised"
						checked={compromisedOnly}
						onCheckedChange={(v) => (compromisedOnly = !!v)}
					/>
					<span class="text-muted-foreground">Compromised only</span>
				</label>

				{#if canReadVulns}
					<label class="flex shrink-0 items-center gap-1.5 text-2xs" for="scope-filter-vulnerable">
						<span class="text-muted-foreground">Vulnerable</span>
						<select
							id="scope-filter-vulnerable"
							class="h-8 rounded-md border bg-background px-2 text-xs"
							value={vulnerableFilter ?? ''}
							onchange={(e) =>
								(vulnerableFilter = parseVulnerableFilter((e.target as HTMLSelectElement).value))}
							data-testid="scope-filter-vulnerable"
						>
							<option value="">All</option>
							{#each VULNERABLE_FILTERS as f (f.value)}
								<option value={f.value}>{f.label}</option>
							{/each}
						</select>
					</label>

					<form
						class="flex shrink-0 items-center gap-1.5 text-2xs"
						onsubmit={(e) => {
							e.preventDefault();
							applyVulnerabilityFilter(vulnerabilityInput);
						}}
					>
						<label class="text-muted-foreground" for="scope-filter-vulnerability">Vuln ID</label>
						<Input
							id="scope-filter-vulnerability"
							class="h-8 w-40 font-mono text-xs"
							placeholder="CVE-2024-3400"
							list="scope-vuln-identifiers"
							bind:value={vulnerabilityInput}
							onchange={() => applyVulnerabilityFilter(vulnerabilityInput)}
							data-testid="scope-filter-vulnerability"
						/>
						<datalist id="scope-vuln-identifiers">
							{#each vulnIdentifiers as id (id)}
								<option value={id}></option>
							{/each}
						</datalist>
						{#if vulnerabilityFilter}
							<button
								type="button"
								class="text-muted-foreground transition-colors hover:text-foreground"
								onclick={() => applyVulnerabilityFilter(null)}
								aria-label="Clear the vulnerability filter"
								title="Clear the vulnerability filter"
							>
								<XIcon class="h-3 w-3" />
							</button>
						{/if}
					</form>
				{/if}

				{#if assetView === 'table'}
					<label class="flex shrink-0 items-center gap-1.5 text-2xs" for="scope-group-case">
						<span class="text-muted-foreground">Group by case</span>
						<Switch
							id="scope-group-case"
							checked={groupByCase}
							onCheckedChange={(v) => (groupByCase = !!v)}
						/>
					</label>
				{/if}
			{/if}

			{#if anyFilterActive}
				<button
					type="button"
					class="ml-auto inline-flex items-center gap-1 text-2xs text-muted-foreground transition-colors hover:text-foreground"
					onclick={clearFilters}
				>
					<XIcon class="h-3 w-3" />
					Clear
				</button>
			{/if}
		</div>
	{/if}

	{#if truncated}
		<div
			class="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
			role="status"
		>
			<AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
			<p>
				Only the first {truncatedLimit ?? ''} rows are shown. Narrow the search or filter by case to
				see the rest.
			</p>
		</div>
	{/if}

	{#if tab === 'assets'}
		{#if selectedAssets.length > 0 && assetView === 'table'}
			<div
				class="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs"
				data-testid="scope-assets-bulkbar"
			>
				<span class="font-medium">{selectedAssets.length} selected</span>
				<span class="text-muted-foreground">
					in {selectedCaseCount}
					{selectedCaseCount === 1 ? 'case' : 'cases'}
				</span>
				<div class="ml-auto flex items-center gap-1.5">
					{#if canWrite}
						<Button
							variant="outline"
							size="sm"
							class="h-7 gap-1.5 text-xs"
							onclick={() => openFlag(selectedAssetRows)}
						>
							<Flag class="h-3.5 w-3.5" /> Set flag
						</Button>
						<Button
							variant="outline"
							size="sm"
							class="h-7 gap-1.5 text-xs"
							onclick={() => openAssetPush(selectedAssetRows)}
						>
							<Send class="h-3.5 w-3.5" /> Push to cases
						</Button>
					{/if}
					{#if canRecord && canReadVulns}
						<Button
							variant="outline"
							size="sm"
							class="h-7 gap-1.5 text-xs"
							onclick={() => openRecord(selectedAssetRows)}
							data-testid="scope-assets-record-vuln"
						>
							<ShieldPlus class="h-3.5 w-3.5" /> Record vulnerability
						</Button>
					{/if}
					<Button
						variant="ghost"
						size="sm"
						class="h-7 text-xs"
						onclick={() => (selectedAssets = [])}
					>
						Clear
					</Button>
				</div>
			</div>
		{/if}

		{#if loadingAssets}
			<div class="flex flex-col gap-2">
				{#each Array(4) as _, i (i)}
					<Skeleton class="h-10 w-full" />
				{/each}
			</div>
		{:else if cases.length === 0}
			<div class="flex flex-1 flex-col items-center justify-center gap-2 text-center">
				<p class="text-sm text-muted-foreground">
					No attached case you can access. Attach cases from the Cases tab first.
				</p>
			</div>
		{:else if assetView === 'board'}
			<ScopeFlagBoard
				{assets}
				{flags}
				{canWrite}
				{flagTotals}
				onSet={setFlag}
				onOpen={(a, f) => openFlag([a], f?.id, 'set')}
			/>
		{:else}
			<ScopeAssetsTable
				{assets}
				{sightings}
				{caseTotals}
				{flags}
				{cases}
				selected={selectedAssets}
				onSelectionChange={(next) => (selectedAssets = next)}
				groupByCase={groupByCase && caseFilter === null}
				{canWrite}
				onFlag={(a) => openFlag([a])}
				onPush={(a) => openAssetPush([a])}
				onRecordVulnerability={canRecord && canReadVulns ? (a) => openRecord([a]) : undefined}
				onFilterVulnerability={(identifier) =>
					applyVulnerabilityFilter(vulnerabilityFilter === identifier ? null : identifier)}
				activeVulnerability={vulnerabilityFilter}
				showVulnerabilities={canReadVulns}
			/>
		{/if}
		{#if !loadingAssets && assetsRes}
			<ScopePager
				page={assetsPage}
				perPage={PER_PAGE}
				total={assetsRes.total ?? assets.length}
				noun="assets"
				onPage={goAssetsPage}
				testId="scope-assets-pager"
			/>
		{/if}
	{:else if tab === 'iocs'}
		{#if selectedIocs.length > 0}
			<div
				class="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs"
			>
				<span class="font-medium">{selectedIocs.length} selected</span>
				<div class="ml-auto flex items-center gap-1.5">
					{#if canWrite}
						<Button
							variant="outline"
							size="sm"
							class="h-7 gap-1.5 text-xs"
							onclick={() => openIocPush(selectedIocRows)}
						>
							<Send class="h-3.5 w-3.5" /> Push to cases
						</Button>
					{/if}
					<Button variant="ghost" size="sm" class="h-7 text-xs" onclick={() => (selectedIocs = [])}>
						Clear
					</Button>
				</div>
			</div>
		{/if}

		{#if loadingIocs}
			<div class="flex flex-col gap-2">
				{#each Array(4) as _, i (i)}
					<Skeleton class="h-10 w-full" />
				{/each}
			</div>
		{:else if cases.length === 0}
			<div class="flex flex-1 flex-col items-center justify-center gap-2 text-center">
				<p class="text-sm text-muted-foreground">
					No attached case you can access. Attach cases from the Cases tab first.
				</p>
			</div>
		{:else}
			<ScopeIocsMatrix
				rows={iocRows}
				cases={caseFilter === null ? cases : cases.filter((c) => c.case_id === caseFilter)}
				selected={selectedIocs}
				onSelectionChange={(next) => (selectedIocs = next)}
				{canWrite}
				onPush={(row, ids) => openIocPush([row], ids)}
			/>
			{#if iocsRes}
				<ScopePager
					page={iocsPage}
					perPage={PER_PAGE}
					total={iocsRes.total ?? iocRows.length}
					noun="IOCs"
					onPage={goIocsPage}
					testId="scope-iocs-pager"
				/>
			{/if}
		{/if}
	{:else if tab === 'vulnerabilities' && canReadVulns}
		{#if loadingMatrix}
			<div class="flex flex-col gap-2">
				{#each Array(4) as _, i (i)}
					<Skeleton class="h-10 w-full" />
				{/each}
			</div>
		{:else}
			<!-- Tracked entries are listed even with no attached case. -->
			<ScopeVulnerabilitiesMatrix
				rows={matrixRows}
				cases={caseFilter === null ? cases : cases.filter((c) => c.case_id === caseFilter)}
				summary={matrix?.summary ?? null}
				caseTotals={matrix?.case_totals ?? {}}
				page={matrixPage}
				perPage={MATRIX_PER_PAGE}
				total={matrix?.total ?? matrixRows.length}
				onPage={goMatrixPage}
				filtered={debouncedSearch.trim() !== '' || caseFilter !== null}
				{canTrack}
				canRecord={canRecord && cases.length > 0}
				onTrack={trackRow}
				onUntrack={untrackRow}
				onSaveNote={saveTrackedNote}
				onRecord={(row) => openRecord([], { type: 'existing', vulnerability: row.vulnerability })}
			/>
		{/if}
	{:else if loadingStaging}
		<div class="flex flex-col gap-2">
			{#each Array(3) as _, i (i)}
				<Skeleton class="h-14 w-full" />
			{/each}
		</div>
	{:else}
		<ScopeStaging
			{warRoomId}
			items={staging}
			{cases}
			{canWrite}
			{assetTypes}
			{analysisStatuses}
			{iocTypes}
			{tlps}
			onChanged={() => {
				void loadStaging();
				void loadAssets();
				void loadIocs();
			}}
		/>
	{/if}
</div>

<ScopeFlagDialog
	bind:open={flagOpen}
	{warRoomId}
	{flags}
	assets={flagTargets}
	initialFlagId={flagInitialId}
	initialAction={flagInitialAction}
	onDone={afterFlag}
/>

<ScopePushDialog
	bind:open={pushOpen}
	title={pushTitle}
	description={pushDescription}
	{cases}
	sourceCustomers={pushSources}
	initialCaseIds={pushInitial}
	disabledIds={pushDisabled}
	disabledNote={pushDisabledNote}
	onSubmit={runPush}
	onDone={pushAfter}
/>

{#if canReadVulns && canRecord}
	<ScopeRecordVulnerabilityDialog
		bind:open={recordOpen}
		{warRoomId}
		{cases}
		presetAssets={recordAssets}
		initialChoice={recordChoice}
		description={recordDescription}
		onRecorded={afterRecord}
	/>

	<VulnerabilityFormDialog
		bind:open={vulnFormOpen}
		saving={vulnSaving}
		onSubmit={createVulnerability}
	/>

	{#if canTrack}
		<ScopeTrackVulnerabilityDialog
			bind:open={trackOpen}
			{warRoomId}
			onTracked={() => void loadMatrix()}
		/>
	{/if}
{/if}

<ScopeAddDialog
	bind:open={addOpen}
	kind={addKind}
	{warRoomId}
	{cases}
	{flags}
	{assetTypes}
	{analysisStatuses}
	{iocTypes}
	{tlps}
	onDone={afterAdd}
	onStaged={() => {
		void loadStaging();
		selectTab('staging');
	}}
/>
