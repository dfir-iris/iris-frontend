<!--
  War-room "Decisions" tab: the D-n register.

  Left: filterable register (status pills, search, case). Right: the
  selected decision with its target date & time, approvers and their
  verdicts, linked cases / assets and a short trail. Mutations need
  `war_rooms_write`; voting only needs to be a listed approver (the
  backend is authoritative for both).
-->
<script lang="ts">
	import { getContext, onDestroy, onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import {
		Check,
		CircleCheck,
		CircleDashed,
		CircleX,
		EllipsisVertical,
		Gavel,
		Hourglass,
		Loader2,
		MessageSquare,
		Pencil,
		Plus,
		Replace,
		RotateCcw,
		Search,
		Server,
		Timer,
		Trash2,
		WaypointsIcon,
		XIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuSeparator,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from '$lib/components/ui/toast';
	import { USER_CTX, type UserCtx } from '$lib/contexts/user-context.context.svelte';
	import { current_user } from '$lib/stores/auth.store';
	import {
		formatDateTime,
		fromDateTimeInputValue,
		toDateTimeInputValue,
		toNaiveUtc
	} from '$lib/utils/time-formatter';
	import {
		WarRoomsService,
		type WarRoomCaseAttachment,
		type WarRoomMember
	} from '$lib/services/war-rooms.service';
	import {
		WarRoomDecisionsService,
		formatDecisionTarget,
		isDecisionOpen,
		type WarRoomDecision,
		type WarRoomDecisionAssetCandidate,
		type WarRoomDecisionChatCandidate,
		type WarRoomDecisionStatus,
		type WarRoomDecisionVerdict
	} from '$lib/services/war-room-decisions.service';
	import type { RequestResponse } from '$lib/services/api.service';

	const warRoomId = $derived(Number(page.params.war_room_id));
	const userCtx = getContext<UserCtx>(USER_CTX);
	const canWrite = $derived(userCtx?.can('war_rooms_write') === true);
	const currentUserId = $derived(
		($current_user?.user_id ?? $current_user?.id ?? null) as number | null
	);

	const STATUS_META: Record<
		WarRoomDecisionStatus,
		{ label: string; cls: string; icon: typeof Hourglass }
	> = {
		proposed: {
			label: 'Proposed',
			cls: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
			icon: Hourglass
		},
		approved: {
			label: 'Approved',
			cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
			icon: CircleCheck
		},
		rejected: {
			label: 'Rejected',
			cls: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
			icon: CircleX
		},
		superseded: {
			label: 'Superseded',
			cls: 'border-border bg-muted text-muted-foreground',
			icon: Replace
		}
	};

	type StatusFilter = 'all' | WarRoomDecisionStatus;
	const FILTERS: { key: StatusFilter; label: string }[] = [
		{ key: 'all', label: 'All' },
		{ key: 'proposed', label: 'Pending' },
		{ key: 'approved', label: 'Approved' },
		{ key: 'rejected', label: 'Rejected' },
		{ key: 'superseded', label: 'Superseded' }
	];

	const errorMessage = (res: RequestResponse<unknown>, fallback: string): string => {
		const data = res.data as { message?: unknown } | string | null;
		if (data && typeof data === 'object' && typeof data.message === 'string') return data.message;
		return res.error?.message ?? fallback;
	};

	// --- Data ------------------------------------------------------------
	let decisions = $state<WarRoomDecision[]>([]);
	let loading = $state(true);
	let selectedId = $state<number | null>(null);
	let members = $state<WarRoomMember[]>([]);
	let attachedCases = $state<WarRoomCaseAttachment[]>([]);
	let busy = $state(false);

	// Relative target labels ("in 3 h") tick on their own.
	let now = $state(Date.now());
	let ticker: ReturnType<typeof setInterval> | null = null;

	const load = async () => {
		loading = true;
		const res = await WarRoomDecisionsService.list(warRoomId);
		if (res.ok && Array.isArray(res.data)) {
			decisions = res.data;
			if (selectedId == null || !decisions.some((d) => d.decision_id === selectedId)) {
				selectedId = decisions[0]?.decision_id ?? null;
			}
		} else {
			toast({
				title: 'Could not load decisions',
				description: errorMessage(res, 'Unknown error'),
				variant: 'destructive'
			});
		}
		loading = false;
	};

	const loadSupporting = async () => {
		const [m, c] = await Promise.all([
			WarRoomsService.listMembers(warRoomId),
			WarRoomsService.listCases(warRoomId)
		]);
		if (m.ok && Array.isArray(m.data)) members = m.data;
		if (c.ok && Array.isArray(c.data)) attachedCases = c.data;
	};

	onMount(() => {
		const fromUrl = Number(page.url.searchParams.get('d'));
		if (Number.isInteger(fromUrl) && fromUrl > 0) selectedId = fromUrl;
		void load();
		void loadSupporting();
		ticker = setInterval(() => (now = Date.now()), 30_000);
	});

	onDestroy(() => {
		if (ticker) clearInterval(ticker);
	});

	const upsert = (d: WarRoomDecision) => {
		const idx = decisions.findIndex((x) => x.decision_id === d.decision_id);
		if (idx === -1) decisions = [d, ...decisions].sort((a, b) => b.number - a.number);
		else decisions = decisions.map((x) => (x.decision_id === d.decision_id ? d : x));
	};

	const select = (id: number) => {
		selectedId = id;
		const url = new URL(page.url);
		url.searchParams.set('d', String(id));
		void goto(`${url.pathname}${url.search}`, {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	};

	// --- Filters ---------------------------------------------------------
	let statusFilter = $state<StatusFilter>('all');
	let search = $state('');
	let caseFilter = $state<number | null>(null);

	const counts = $derived.by(() => {
		const out: Record<StatusFilter, number> = {
			all: decisions.length,
			proposed: 0,
			approved: 0,
			rejected: 0,
			superseded: 0
		};
		for (const d of decisions) out[d.status] += 1;
		return out;
	});

	const filtered = $derived.by(() => {
		const needle = search.trim().toLowerCase();
		return decisions.filter((d) => {
			if (statusFilter !== 'all' && d.status !== statusFilter) return false;
			if (caseFilter != null && !d.case_ids.includes(caseFilter)) return false;
			if (needle) {
				const hay = [d.ref, d.title, d.rationale ?? '', d.owner_name ?? ''].join(' ').toLowerCase();
				if (!hay.includes(needle)) return false;
			}
			return true;
		});
	});

	const anyFilterActive = $derived(
		statusFilter !== 'all' || search.trim().length > 0 || caseFilter != null
	);

	const clearFilters = () => {
		statusFilter = 'all';
		search = '';
		caseFilter = null;
	};

	const selected = $derived(decisions.find((d) => d.decision_id === selectedId) ?? null);
	const supersededBy = $derived(
		selected?.superseded_by_id != null
			? (decisions.find((d) => d.decision_id === selected.superseded_by_id) ?? null)
			: null
	);
	const myApproval = $derived(
		selected && currentUserId != null
			? (selected.approvers.find((a) => a.user_id === currentUserId) ?? null)
			: null
	);
	const canVote = $derived(selected?.status === 'proposed' && myApproval != null);

	const targetTone = (d: WarRoomDecision): string => {
		if (d.is_overdue) return 'text-red-700 dark:text-red-300';
		if (isDecisionOpen(d)) return 'text-amber-700 dark:text-amber-300';
		return 'text-muted-foreground';
	};

	const verdictMeta = (verdict: WarRoomDecisionVerdict | null) => {
		if (verdict === 'approved')
			return {
				label: 'approved',
				icon: CircleCheck,
				cls: 'text-emerald-700 dark:text-emerald-400'
			};
		if (verdict === 'rejected')
			return { label: 'rejected', icon: CircleX, cls: 'text-red-700 dark:text-red-400' };
		return { label: 'pending', icon: CircleDashed, cls: 'text-muted-foreground' };
	};

	// --- Actions ---------------------------------------------------------
	const vote = async (verdict: WarRoomDecisionVerdict) => {
		if (!selected) return;
		busy = true;
		const res = await WarRoomDecisionsService.vote(warRoomId, selected.decision_id, { verdict });
		busy = false;
		if (res.ok && res.data && typeof res.data !== 'string') {
			const d = res.data as WarRoomDecision;
			upsert(d);
			toast({
				title: `${d.ref} ${verdict === 'approved' ? 'approved' : 'rejected'} by you`,
				variant: 'success'
			});
		} else {
			toast({
				title: 'Could not record your vote',
				description: errorMessage(res, 'Unknown error'),
				variant: 'destructive'
			});
		}
	};

	const toggleImplemented = async () => {
		if (!selected) return;
		busy = true;
		const res = selected.implemented_at
			? await WarRoomDecisionsService.reopen(warRoomId, selected.decision_id)
			: await WarRoomDecisionsService.markImplemented(warRoomId, selected.decision_id);
		busy = false;
		if (res.ok && res.data && typeof res.data !== 'string') {
			const d = res.data as WarRoomDecision;
			upsert(d);
			toast({
				title: d.implemented_at ? `${d.ref} marked implemented` : `${d.ref} reopened`,
				variant: 'success'
			});
		} else {
			toast({
				title: 'Could not update decision',
				description: errorMessage(res, 'Unknown error'),
				variant: 'destructive'
			});
		}
	};

	let confirmOpen = $state(false);
	let confirmTarget = $state<WarRoomDecision | null>(null);

	const askDelete = (d: WarRoomDecision) => {
		confirmTarget = d;
		confirmOpen = true;
	};

	const runDelete = async () => {
		const d = confirmTarget;
		confirmTarget = null;
		if (!d) return;
		const res = await WarRoomDecisionsService.remove(warRoomId, d.decision_id);
		if (res.ok) {
			decisions = decisions.filter((x) => x.decision_id !== d.decision_id);
			if (selectedId === d.decision_id) selectedId = decisions[0]?.decision_id ?? null;
			toast({ title: `${d.ref} deleted` });
		} else {
			toast({
				title: 'Could not delete decision',
				description: errorMessage(res, 'Unknown error'),
				variant: 'destructive'
			});
		}
	};

	// --- Create / edit dialog -------------------------------------------
	type FormMode = 'create' | 'edit' | 'supersede';
	type FormState = {
		title: string;
		rationale: string;
		status: WarRoomDecisionStatus;
		target: string;
		ownerId: string;
		approverIds: number[];
		caseIds: number[];
		assetIds: number[];
		supersedesId: number | null;
		chatMessageId: number | null;
	};

	const emptyForm = (): FormState => ({
		title: '',
		rationale: '',
		status: 'proposed',
		target: '',
		ownerId: currentUserId != null ? String(currentUserId) : '',
		approverIds: [],
		caseIds: [],
		assetIds: [],
		supersedesId: null,
		chatMessageId: null
	});

	let formOpen = $state(false);
	let formMode = $state<FormMode>('create');
	let formDecisionId = $state<number | null>(null);
	let form = $state<FormState>(emptyForm());
	let formSaving = $state(false);
	// Display names of linked assets, kept across picker searches.
	let assetLabels = $state<Record<number, string>>({});

	const openCreate = (prefill: Partial<FormState> = {}) => {
		formMode = 'create';
		formDecisionId = null;
		form = { ...emptyForm(), ...prefill };
		assetLabels = {};
		assetQuery = '';
		assetResults = [];
		assetsUnavailable = false;
		formOpen = true;
		void searchAssets('');
	};

	const fillFromDecision = (d: WarRoomDecision): FormState => ({
		title: d.title,
		rationale: d.rationale ?? '',
		status: d.status,
		target: d.target_at ? toDateTimeInputValue(d.target_at) : '',
		ownerId: d.owner_id != null ? String(d.owner_id) : '',
		approverIds: d.approvers.map((a) => a.user_id),
		caseIds: [...d.case_ids],
		assetIds: [...d.asset_ids],
		supersedesId: null,
		chatMessageId: null
	});

	const assetLabelsFrom = (d: WarRoomDecision): Record<number, string> => {
		const out: Record<number, string> = {};
		for (const a of d.assets) out[a.asset_id] = a.asset_name ?? `Asset #${a.asset_id}`;
		return out;
	};

	const openEdit = (d: WarRoomDecision) => {
		formMode = 'edit';
		formDecisionId = d.decision_id;
		form = fillFromDecision(d);
		assetLabels = assetLabelsFrom(d);
		assetQuery = '';
		assetResults = [];
		assetsUnavailable = false;
		formOpen = true;
		void searchAssets('');
	};

	const openSupersede = (d: WarRoomDecision) => {
		formMode = 'supersede';
		formDecisionId = null;
		form = {
			...fillFromDecision(d),
			status: 'proposed',
			target: '',
			// A new decision may only link assets the caller can read.
			assetIds: d.assets.filter((a) => a.accessible !== false).map((a) => a.asset_id),
			supersedesId: d.decision_id
		};
		assetLabels = assetLabelsFrom(d);
		assetQuery = '';
		assetResults = [];
		assetsUnavailable = false;
		formOpen = true;
		void searchAssets('');
	};

	const toggleIn = (list: number[], id: number): number[] =>
		list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

	// Asset picker: backed by the war-room scope listing, which only
	// returns assets of attached cases the caller can read.
	let assetQuery = $state('');
	let assetResults = $state<WarRoomDecisionAssetCandidate[]>([]);
	let assetsLoading = $state(false);
	let assetsUnavailable = $state(false);
	let assetTimer: ReturnType<typeof setTimeout> | null = null;

	const searchAssets = async (q: string) => {
		assetsLoading = true;
		const res = await WarRoomDecisionsService.assetCandidates(warRoomId, q);
		assetsLoading = false;
		if (res.ok && res.data && typeof res.data === 'object' && 'data' in res.data) {
			assetResults = (res.data.data ?? []).slice(0, 50);
			assetsUnavailable = false;
		} else {
			assetResults = [];
			assetsUnavailable = true;
		}
	};

	const onAssetQuery = (value: string) => {
		assetQuery = value;
		if (assetTimer) clearTimeout(assetTimer);
		assetTimer = setTimeout(() => void searchAssets(value), 250);
	};

	const toggleAsset = (a: WarRoomDecisionAssetCandidate) => {
		assetLabels = { ...assetLabels, [a.asset_id]: a.asset_name };
		form.assetIds = toggleIn(form.assetIds, a.asset_id);
	};

	const formTitle = $derived(
		formMode === 'edit'
			? 'Edit decision'
			: formMode === 'supersede'
				? 'Supersede decision'
				: 'Propose a decision'
	);

	const submitForm = async () => {
		const title = form.title.trim();
		if (!title) {
			toast({ title: 'A title is required', variant: 'destructive' });
			return;
		}
		if (title.length > 256) {
			toast({ title: 'Title is too long (256 characters max)', variant: 'destructive' });
			return;
		}
		let targetAt: string | null = null;
		if (form.target) {
			const parsed = fromDateTimeInputValue(form.target);
			if (!parsed) {
				toast({ title: 'Invalid target date & time', variant: 'destructive' });
				return;
			}
			targetAt = toNaiveUtc(parsed) ?? null;
		}
		const ownerId = form.ownerId ? Number(form.ownerId) : null;
		const common = {
			title,
			rationale: form.rationale.trim() || null,
			target_at: targetAt,
			owner_id: ownerId,
			approver_ids: form.approverIds,
			case_ids: form.caseIds,
			asset_ids: form.assetIds
		};

		formSaving = true;
		let res: RequestResponse<WarRoomDecision>;
		if (formMode === 'edit' && formDecisionId != null) {
			res = await WarRoomDecisionsService.update(warRoomId, formDecisionId, {
				...common,
				status: form.status
			});
		} else {
			res = await WarRoomDecisionsService.create(warRoomId, {
				...common,
				status: form.status === 'approved' ? 'approved' : 'proposed',
				supersedes_id: form.supersedesId,
				chat_message_id: form.chatMessageId
			});
		}
		formSaving = false;

		if (res.ok && res.data && typeof res.data !== 'string') {
			const d = res.data as WarRoomDecision;
			upsert(d);
			formOpen = false;
			if (formMode === 'edit') {
				toast({ title: `${d.ref} updated`, variant: 'success' });
			} else {
				toast({ title: `${d.ref} recorded`, variant: 'success' });
				// The superseded decision changed status server-side.
				if (form.supersedesId != null || form.chatMessageId != null) void load();
				select(d.decision_id);
			}
		} else {
			toast({
				title: formMode === 'edit' ? 'Could not update decision' : 'Could not create decision',
				description: errorMessage(res, 'Unknown error'),
				variant: 'destructive'
			});
		}
	};

	// --- Promote from chat ------------------------------------------------
	let promoteOpen = $state(false);
	let candidates = $state<WarRoomDecisionChatCandidate[]>([]);
	let candidatesLoading = $state(false);

	const openPromote = async () => {
		promoteOpen = true;
		candidatesLoading = true;
		const res = await WarRoomDecisionsService.chatCandidates(warRoomId);
		candidatesLoading = false;
		candidates = res.ok && Array.isArray(res.data) ? res.data : [];
		if (!res.ok) {
			toast({
				title: 'Could not load chat decisions',
				description: errorMessage(res, 'Unknown error'),
				variant: 'destructive'
			});
		}
	};

	const promote = (c: WarRoomDecisionChatCandidate) => {
		promoteOpen = false;
		const body = c.body.trim();
		const firstLine = body.split('\n')[0] ?? '';
		openCreate({
			title: firstLine.slice(0, 256),
			rationale: body.length > firstLine.length ? body : '',
			chatMessageId: c.message_id
		});
	};
</script>

<div class="flex h-full w-full min-w-0 overflow-hidden">
	<!-- Register -->
	<aside class="flex min-h-0 w-[clamp(320px,36%,480px)] shrink-0 flex-col border-r bg-card/30">
		<header class="flex items-center gap-2 px-4 pb-2 pt-3">
			<div class="min-w-0 flex-1">
				<h2 class="truncate text-lg font-semibold leading-tight">Decisions</h2>
				<p class="truncate text-2xs text-muted-foreground">
					{counts.all}
					{counts.all === 1 ? 'decision' : 'decisions'} · {counts.proposed} pending
				</p>
			</div>
			{#if canWrite}
				<Button
					size="sm"
					variant="outline"
					class="shrink-0"
					onclick={openPromote}
					title="Promote a /decision chat message to the register"
				>
					<MessageSquare class="mr-1 h-3.5 w-3.5" /> From chat
				</Button>
				<Button size="sm" class="shrink-0" onclick={() => openCreate()}>
					<Plus class="mr-1 h-3.5 w-3.5" /> Propose
				</Button>
			{/if}
		</header>

		<div
			class="flex flex-nowrap gap-1 overflow-x-auto px-4 pb-2"
			role="group"
			aria-label="Filter by status"
		>
			{#each FILTERS as f (f.key)}
				{@const on = statusFilter === f.key}
				<button
					type="button"
					aria-pressed={on}
					class={[
						'shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs transition-colors',
						on
							? 'border-primary bg-primary/10 font-medium text-primary'
							: 'text-muted-foreground hover:bg-muted'
					]}
					onclick={() => (statusFilter = f.key)}
				>
					{f.label} <span class="tabular-nums">{counts[f.key]}</span>
				</button>
			{/each}
		</div>

		<div class="flex items-center gap-2 px-4 pb-2">
			<div class="relative min-w-0 flex-1">
				<Search
					class="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					value={search}
					oninput={(e) => (search = (e.target as HTMLInputElement).value)}
					placeholder="Search D-n, title, owner…"
					class="h-8 pl-7 text-xs"
					aria-label="Search decisions"
				/>
			</div>
			<select
				class="h-8 w-[9.5rem] shrink-0 truncate rounded-md border bg-background px-2 text-xs"
				aria-label="Filter by case"
				value={caseFilter == null ? '' : String(caseFilter)}
				onchange={(e) => {
					const v = (e.target as HTMLSelectElement).value;
					caseFilter = v ? Number(v) : null;
				}}
			>
				<option value="">All cases</option>
				{#each attachedCases as c (c.case_id)}
					<option value={String(c.case_id)}>#{c.case_id} {c.case_name}</option>
				{/each}
			</select>
			{#if anyFilterActive}
				<button
					type="button"
					class="inline-flex shrink-0 items-center gap-1 text-2xs text-muted-foreground transition-colors hover:text-foreground"
					onclick={clearFilters}
				>
					<XIcon class="h-3 w-3" /> Clear
				</button>
			{/if}
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto border-t">
			{#if loading}
				<div class="flex flex-col gap-1 p-2">
					{#each Array(3) as _}
						<Skeleton class="h-14 w-full" />
					{/each}
				</div>
			{:else if decisions.length === 0}
				<p class="px-4 py-6 text-center text-xs text-muted-foreground">No decisions yet.</p>
			{:else if filtered.length === 0}
				<p class="px-4 py-6 text-center text-xs text-muted-foreground">
					No decisions match the current filters.
				</p>
			{:else}
				<ul data-testid="decisions-register">
					{#each filtered as d (d.decision_id)}
						{@const on = d.decision_id === selectedId}
						{@const meta = STATUS_META[d.status]}
						<li>
							<button
								type="button"
								id={`decision-${d.decision_id}`}
								data-testid="decision-row"
								aria-current={on ? 'true' : undefined}
								class={[
									'relative w-full border-b border-l-[3px] border-b-border/50 px-3 py-2.5 text-left transition-colors',
									on ? 'border-l-primary bg-accent' : 'border-l-transparent hover:bg-muted/40'
								]}
								onclick={() => select(d.decision_id)}
							>
								<span class="flex items-center gap-2">
									<span
										class="rounded bg-indigo-500/10 px-1.5 py-0.5 font-mono text-2xs font-semibold text-indigo-700 dark:text-indigo-300"
										>{d.ref}</span
									>
									<span
										class={[
											'min-w-0 flex-1 truncate text-sm font-semibold leading-tight',
											d.status === 'superseded' && 'text-muted-foreground line-through'
										]}>{d.title}</span
									>
									{#if d.is_overdue}
										<span
											class="shrink-0 rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-2xs font-medium text-red-700 dark:text-red-300"
											>Overdue</span
										>
									{:else if d.implemented_at}
										<span
											class="shrink-0 rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-2xs font-medium text-emerald-700 dark:text-emerald-300"
											>Implemented</span
										>
									{/if}
								</span>
								<span class="mt-1 flex items-center gap-1.5 pl-0.5 text-xs text-muted-foreground">
									<span
										class={[
											'inline-flex h-5 shrink-0 items-center gap-1 rounded-md border px-1.5 text-2xs font-medium',
											meta.cls
										]}
									>
										<meta.icon class="h-3 w-3" />{meta.label}
									</span>
									{#if d.owner_name}
										<span class="truncate">{d.owner_name}</span>
									{/if}
									{#if d.target_at}
										<span
											class={['ml-auto inline-flex shrink-0 items-center gap-1', targetTone(d)]}
											title={formatDateTime(d.target_at)}
										>
											<Timer class="h-3 w-3" />{formatDecisionTarget(d.target_at, now)}
										</span>
									{/if}
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</aside>

	<!-- Detail -->
	<section class="flex min-w-0 flex-1 flex-col" aria-label="Decision detail">
		{#if !selected}
			{#if !loading}
				<div
					class="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
					data-testid="decisions-empty"
				>
					<div class="rounded-full bg-indigo-500/10 p-3 text-indigo-700 dark:text-indigo-300">
						<Gavel class="h-6 w-6" />
					</div>
					{#if decisions.length === 0}
						<div class="max-w-md">
							<h3 class="text-base font-semibold">No decisions yet</h3>
							<p class="mt-1 text-sm text-muted-foreground">
								Record the calls the room makes — isolate a site, reset credentials, accept a risk.
								Each one gets a D-number, an owner, a target date and time, and optional approvers
								who vote on it.
							</p>
						</div>
						{#if canWrite}
							<div class="flex flex-wrap justify-center gap-2">
								<Button size="sm" onclick={() => openCreate()}>
									<Plus class="mr-1 h-3.5 w-3.5" /> Propose a decision
								</Button>
								<Button size="sm" variant="outline" onclick={openPromote}>
									<MessageSquare class="mr-1 h-3.5 w-3.5" /> Promote from chat
								</Button>
							</div>
						{/if}
					{:else}
						<p class="text-sm text-muted-foreground">Select a decision in the register.</p>
					{/if}
				</div>
			{/if}
		{:else}
			{@const meta = STATUS_META[selected.status]}
			<div class="flex shrink-0 items-center gap-2.5 px-5 pb-2 pt-4">
				<div
					class="shrink-0 rounded-md bg-indigo-500/10 p-1.5 text-indigo-700 dark:text-indigo-300"
				>
					<Gavel class="h-4 w-4" />
				</div>
				<div class="min-w-0 flex-1">
					<h2 class="truncate text-base font-semibold leading-tight" data-testid="decision-title">
						{selected.title}
					</h2>
					<p class="truncate text-2xs text-muted-foreground">
						{selected.ref}
						{#if selected.created_by_name}· proposed by {selected.created_by_name}{/if}
						{#if selected.created_at}· {formatDateTime(selected.created_at)}{/if}
					</p>
				</div>
				{#if selected.is_overdue}
					<span
						class="inline-flex h-6 shrink-0 items-center rounded-md border border-red-500/40 bg-red-500/10 px-2 text-xs font-medium text-red-700 dark:text-red-300"
						>Overdue</span
					>
				{/if}
				<span
					class={[
						'inline-flex h-6 shrink-0 items-center gap-1 rounded-md border px-2 text-xs font-medium',
						meta.cls
					]}
				>
					<meta.icon class="h-3 w-3" />{meta.label}
				</span>
				{#if canWrite}
					<DropdownMenu>
						<DropdownMenuTrigger
							class="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
							aria-label="Decision actions"
						>
							<EllipsisVertical class="h-4 w-4" />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" class="min-w-[220px]">
							<DropdownMenuItem onclick={() => selected && openEdit(selected)}>
								<Pencil class="mr-2 h-3.5 w-3.5" /> Edit
							</DropdownMenuItem>
							{#if selected.status !== 'superseded'}
								<DropdownMenuItem onclick={() => selected && openSupersede(selected)}>
									<Replace class="mr-2 h-3.5 w-3.5" /> Supersede with a new decision…
								</DropdownMenuItem>
							{/if}
							<DropdownMenuItem disabled={busy} onclick={toggleImplemented}>
								{#if selected.implemented_at}
									<RotateCcw class="mr-2 h-3.5 w-3.5" /> Reopen
								{:else}
									<Check class="mr-2 h-3.5 w-3.5" /> Mark implemented
								{/if}
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								class="text-destructive"
								onclick={() => selected && askDelete(selected)}
							>
								<Trash2 class="mr-2 h-3.5 w-3.5" /> Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				{/if}
			</div>

			<div class="min-h-0 flex-1 overflow-y-auto px-5 pb-16">
				{#if canVote}
					<div
						class="mt-2 flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3"
					>
						<Hourglass class="h-4 w-4 shrink-0 text-amber-600" />
						<div class="min-w-0 flex-1 text-sm">
							<p class="font-medium">
								{myApproval?.verdict
									? `You ${myApproval.verdict} this decision`
									: 'Your approval is requested'}
							</p>
							<p class="text-xs text-muted-foreground">
								{#if selected.target_at}
									Target {formatDateTime(selected.target_at)} ({formatDecisionTarget(
										selected.target_at,
										now
									)}).
								{/if}
								The outcome is posted to the stream.
							</p>
						</div>
						<Button
							size="sm"
							variant="outline"
							disabled={busy || myApproval?.verdict === 'rejected'}
							onclick={() => vote('rejected')}>Reject</Button
						>
						<Button
							size="sm"
							disabled={busy || myApproval?.verdict === 'approved'}
							onclick={() => vote('approved')}
						>
							<Check class="mr-1 h-3.5 w-3.5" /> Approve
						</Button>
					</div>
				{/if}

				{#if supersededBy}
					<div
						class="mt-2 flex items-center gap-2 rounded-lg border bg-muted/40 px-4 py-2.5 text-sm"
					>
						<Replace class="h-4 w-4 text-muted-foreground" />
						Superseded by
						<button
							type="button"
							class="font-mono font-semibold text-primary hover:underline"
							onclick={() => supersededBy && select(supersededBy.decision_id)}
							>{supersededBy.ref}</button
						>
						<span class="truncate">{supersededBy.title}</span>
					</div>
				{/if}

				<div class="mt-4 grid gap-5 lg:grid-cols-3">
					<section>
						<p class="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
							Target
						</p>
						{#if selected.target_at}
							<p class="text-sm">{formatDateTime(selected.target_at)}</p>
							<p class={['text-xs', targetTone(selected)]} data-testid="decision-target-relative">
								{formatDecisionTarget(selected.target_at, now)}
							</p>
						{:else}
							<p class="text-sm text-muted-foreground">No target set</p>
						{/if}
					</section>
					<section>
						<p class="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
							Owner
						</p>
						<p class="text-sm">{selected.owner_name ?? 'Unassigned'}</p>
					</section>
					<section>
						<p class="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
							Implementation
						</p>
						{#if selected.implemented_at}
							<p class="text-sm text-emerald-700 dark:text-emerald-400">
								Implemented {formatDateTime(selected.implemented_at)}
							</p>
						{:else}
							<p class="text-sm text-muted-foreground">Not implemented</p>
						{/if}
					</section>
				</div>

				<section class="mt-5">
					<p class="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
						Rationale
					</p>
					<p class="whitespace-pre-wrap text-sm leading-relaxed">
						{selected.rationale || '—'}
					</p>
					{#if selected.supersedes_id != null}
						<p class="mt-2 text-xs text-muted-foreground">
							Supersedes
							<button
								type="button"
								class="font-mono font-semibold text-primary hover:underline"
								onclick={() => selected?.supersedes_id != null && select(selected.supersedes_id)}
								>{selected.supersedes_ref ?? `#${selected.supersedes_id}`}</button
							>
						</p>
					{/if}
				</section>

				<div class="mt-5 grid gap-5 lg:grid-cols-2">
					<section>
						<p class="mb-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
							Approvers
						</p>
						{#if selected.approvers.length === 0}
							<p class="text-xs text-muted-foreground">No approver required.</p>
						{:else}
							<ul class="divide-y">
								{#each selected.approvers as a (a.user_id)}
									{@const v = verdictMeta(a.verdict)}
									<li class="flex items-center gap-2 py-1.5">
										<span class="text-sm">{a.user_name ?? `User #${a.user_id}`}</span>
										{#if a.comment}
											<span class="truncate text-2xs text-muted-foreground" title={a.comment}
												>{a.comment}</span
											>
										{/if}
										<span
											class={['ml-auto inline-flex items-center gap-1 text-xs', v.cls]}
											title={a.responded_at ? formatDateTime(a.responded_at) : undefined}
										>
											<v.icon class="h-3.5 w-3.5" />{v.label}
										</span>
									</li>
								{/each}
							</ul>
						{/if}
					</section>
					<section>
						<p class="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
							Applies to
						</p>
						{#if selected.cases.length === 0 && selected.assets.length === 0}
							<span class="text-xs text-muted-foreground">Whole war room</span>
						{:else}
							<div class="flex flex-wrap gap-1">
								{#each selected.cases as c (c.case_id)}
									{#if c.accessible}
										<a
											href={`/case/${c.case_id}`}
											class="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs hover:bg-muted"
										>
											<WaypointsIcon class="h-3 w-3 text-muted-foreground" />
											<span class="font-mono text-muted-foreground">#{c.case_id}</span>
											{c.case_name ?? ''}
										</a>
									{:else}
										<span
											class="inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-0.5 text-xs text-muted-foreground"
											title="You don't have access to this case"
										>
											<span class="font-mono">#{c.case_id}</span> restricted
										</span>
									{/if}
								{/each}
							</div>
							{#if selected.assets.length}
								<div class="mt-2 grid gap-1">
									{#each selected.assets as a (a.asset_id)}
										{#if a.accessible !== false && a.case_id != null}
											<a
												href={`/case/${a.case_id}/assets/${a.asset_id}`}
												class="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm hover:bg-muted/40"
											>
												<Server class="h-3.5 w-3.5 text-muted-foreground" />
												<span class="font-medium">{a.asset_name ?? `Asset #${a.asset_id}`}</span>
												<span class="ml-auto font-mono text-2xs text-muted-foreground"
													>#{a.case_id}</span
												>
											</a>
										{:else}
											<span
												class="flex items-center gap-2 rounded-md border border-dashed px-2.5 py-1.5 text-sm text-muted-foreground"
											>
												<Server class="h-3.5 w-3.5" /> Restricted asset
											</span>
										{/if}
									{/each}
								</div>
							{/if}
						{/if}
					</section>
				</div>

				<section class="mt-5">
					<p class="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
						Trail
					</p>
					<ol class="relative ml-2 border-l border-border/60 pl-4 text-xs">
						<li class="relative pb-3">
							<span
								class="absolute -left-[21px] top-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-card"
							></span>
							<span class="font-medium">{selected.created_by_name ?? 'Someone'}</span> proposed
							{#if selected.created_at}
								<span class="text-muted-foreground">· {formatDateTime(selected.created_at)}</span>
							{/if}
						</li>
						{#if selected.decided_at && (selected.status === 'approved' || selected.status === 'rejected' || selected.status === 'superseded')}
							<li class="relative pb-3">
								<span
									class={[
										'absolute -left-[21px] top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-card',
										selected.status === 'rejected' ? 'bg-red-500' : 'bg-emerald-500'
									]}
								></span>
								<span class="font-medium">{selected.decided_by_name ?? 'Approvers'}</span>
								{selected.status === 'rejected' ? 'rejected' : 'approved'}
								<span class="text-muted-foreground">· {formatDateTime(selected.decided_at)}</span>
							</li>
						{/if}
						{#if selected.implemented_at}
							<li class="relative pb-3">
								<span
									class="absolute -left-[21px] top-0.5 h-2.5 w-2.5 rounded-full bg-sky-500 ring-2 ring-card"
								></span>
								implemented
								<span class="text-muted-foreground"
									>· {formatDateTime(selected.implemented_at)}</span
								>
							</li>
						{/if}
						{#if supersededBy}
							<li class="relative">
								<span
									class="absolute -left-[21px] top-0.5 h-2.5 w-2.5 rounded-full bg-muted-foreground ring-2 ring-card"
								></span>
								superseded by {supersededBy.ref}
							</li>
						{/if}
					</ol>
				</section>
			</div>
		{/if}
	</section>
</div>

<!-- Create / edit / supersede -->
<Dialog bind:open={formOpen}>
	<DialogContent class="max-w-xl">
		<DialogHeader>
			<DialogTitle>{formTitle}</DialogTitle>
			<DialogDescription>
				{#if formMode === 'edit'}
					Changes are recorded on the decision and visible to the whole war room.
				{:else}
					Gets the next D-number and appears on the Board until it is decided and implemented.
				{/if}
			</DialogDescription>
		</DialogHeader>

		<form
			class="grid max-h-[65vh] gap-3 overflow-y-auto py-1 pr-1"
			onsubmit={(e) => {
				e.preventDefault();
				void submitForm();
			}}
		>
			<div class="grid gap-1.5">
				<label class="text-xs font-medium text-muted-foreground" for="decision-title-input"
					>Decision</label
				>
				<Input
					id="decision-title-input"
					bind:value={form.title}
					maxlength={256}
					placeholder="e.g. Keep the Lyon site offline overnight"
					required
				/>
			</div>
			<div class="grid gap-1.5">
				<label class="text-xs font-medium text-muted-foreground" for="decision-rationale"
					>Rationale</label
				>
				<Textarea id="decision-rationale" bind:value={form.rationale} rows={3} />
			</div>
			<div class="grid grid-cols-2 gap-3">
				<div class="grid gap-1.5">
					<label class="text-xs font-medium text-muted-foreground" for="decision-target"
						>Target date &amp; time</label
					>
					<Input id="decision-target" type="datetime-local" bind:value={form.target} />
				</div>
				<div class="grid gap-1.5">
					<label class="text-xs font-medium text-muted-foreground" for="decision-status"
						>Status</label
					>
					<select
						id="decision-status"
						class="h-9 w-full rounded-md border bg-background px-2 text-sm"
						bind:value={form.status}
					>
						<option value="proposed">Proposed</option>
						<option value="approved">Approved</option>
						{#if formMode === 'edit'}
							<option value="rejected">Rejected</option>
							<option value="superseded">Superseded</option>
						{/if}
					</select>
				</div>
			</div>
			<div class="grid gap-1.5">
				<label class="text-xs font-medium text-muted-foreground" for="decision-owner">Owner</label>
				<select
					id="decision-owner"
					class="h-9 w-full rounded-md border bg-background px-2 text-sm"
					bind:value={form.ownerId}
				>
					<option value="">Unassigned</option>
					{#each members as m (m.user_id)}
						<option value={String(m.user_id)}>{m.user_name} ({m.user_login})</option>
					{/each}
				</select>
			</div>

			<fieldset class="grid gap-1.5">
				<legend class="mb-1.5 text-xs font-medium text-muted-foreground">Approvers</legend>
				{#if members.length === 0}
					<p class="text-xs text-muted-foreground">No war-room members.</p>
				{:else}
					<div class="grid max-h-36 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
						{#each members as m (m.user_id)}
							<label class="flex cursor-pointer items-center gap-2 text-sm">
								<Checkbox
									checked={form.approverIds.includes(m.user_id)}
									onCheckedChange={() => (form.approverIds = toggleIn(form.approverIds, m.user_id))}
									aria-label={`Approver ${m.user_name}`}
								/>
								<span class="truncate">{m.user_name}</span>
							</label>
						{/each}
					</div>
				{/if}
			</fieldset>

			<fieldset class="grid gap-1.5">
				<legend class="mb-1.5 text-xs font-medium text-muted-foreground">Applies to cases</legend>
				{#if attachedCases.length === 0}
					<p class="text-xs text-muted-foreground">No case attached to this war room.</p>
				{:else}
					<div class="flex flex-wrap gap-1">
						{#each attachedCases as c (c.case_id)}
							{@const on = form.caseIds.includes(c.case_id)}
							<button
								type="button"
								aria-pressed={on}
								class={[
									'rounded-md border px-2 py-1 text-xs transition-colors',
									on ? 'border-primary bg-primary/10' : 'hover:bg-muted'
								]}
								onclick={() => (form.caseIds = toggleIn(form.caseIds, c.case_id))}
							>
								<span class="font-mono text-muted-foreground">#{c.case_id}</span>
								{c.case_name}
							</button>
						{/each}
					</div>
				{/if}
			</fieldset>

			<fieldset class="grid gap-1.5">
				<legend class="mb-1.5 text-xs font-medium text-muted-foreground">Applies to assets</legend>
				{#if form.assetIds.length}
					<div class="flex flex-wrap gap-1">
						{#each form.assetIds as id (id)}
							<span
								class="inline-flex items-center gap-1 rounded-md border border-primary bg-primary/10 px-2 py-0.5 text-xs"
							>
								{assetLabels[id] ?? `Asset #${id}`}
								<button
									type="button"
									aria-label={`Remove ${assetLabels[id] ?? `asset #${id}`}`}
									onclick={() => (form.assetIds = form.assetIds.filter((x) => x !== id))}
								>
									<XIcon class="h-3 w-3" />
								</button>
							</span>
						{/each}
					</div>
				{/if}
				{#if assetsUnavailable}
					<p class="text-xs text-muted-foreground">Asset search is not available.</p>
				{:else}
					<div class="relative">
						<Search
							class="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
						/>
						<Input
							value={assetQuery}
							oninput={(e) => onAssetQuery((e.target as HTMLInputElement).value)}
							placeholder="Search assets of attached cases…"
							class="h-8 pl-7 text-xs"
							aria-label="Search assets"
						/>
					</div>
					<ul class="max-h-32 overflow-y-auto rounded-md border">
						{#if assetsLoading}
							<li class="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
								<Loader2 class="h-3 w-3 animate-spin" /> Searching…
							</li>
						{:else if assetResults.length === 0}
							<li class="px-2 py-1.5 text-xs text-muted-foreground">No asset found.</li>
						{:else}
							{#each assetResults as a (`${a.case_id}:${a.asset_id}`)}
								{@const on = form.assetIds.includes(a.asset_id)}
								<li>
									<button
										type="button"
										aria-pressed={on}
										class={[
											'flex w-full items-center gap-2 px-2 py-1 text-left text-xs transition-colors',
											on ? 'bg-primary/10' : 'hover:bg-muted/50'
										]}
										onclick={() => toggleAsset(a)}
									>
										<Server class="h-3 w-3 text-muted-foreground" />
										<span class="truncate font-medium">{a.asset_name}</span>
										<span class="ml-auto shrink-0 font-mono text-2xs text-muted-foreground"
											>#{a.case_id}</span
										>
									</button>
								</li>
							{/each}
						{/if}
					</ul>
				{/if}
			</fieldset>
		</form>

		<DialogFooter>
			<Button variant="ghost" onclick={() => (formOpen = false)} disabled={formSaving}
				>Cancel</Button
			>
			<Button onclick={submitForm} disabled={formSaving || !form.title.trim()}>
				{#if formSaving}
					<Loader2 class="mr-1 h-3.5 w-3.5 animate-spin" />
				{:else}
					<Gavel class="mr-1 h-3.5 w-3.5" />
				{/if}
				{formMode === 'edit' ? 'Save' : 'Propose'}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>

<!-- Promote from chat -->
<Dialog bind:open={promoteOpen}>
	<DialogContent class="max-w-xl">
		<DialogHeader>
			<DialogTitle>Promote a chat decision</DialogTitle>
			<DialogDescription>
				Decisions posted in the stream with <code>/decision</code> that are not in the register yet.
			</DialogDescription>
		</DialogHeader>
		<div class="max-h-[50vh] overflow-y-auto">
			{#if candidatesLoading}
				<div class="flex flex-col gap-1">
					{#each Array(3) as _}
						<Skeleton class="h-12 w-full" />
					{/each}
				</div>
			{:else if candidates.length === 0}
				<p class="py-6 text-center text-xs text-muted-foreground">
					No unregistered decision in the stream.
				</p>
			{:else}
				<ul class="divide-y rounded-md border">
					{#each candidates as c (c.message_id)}
						<li class="flex items-start gap-3 px-3 py-2">
							<div class="min-w-0 flex-1">
								<p class="line-clamp-2 whitespace-pre-wrap text-sm">{c.body}</p>
								<p class="text-2xs text-muted-foreground">
									{c.author_name ?? 'Unknown'}
									{#if c.created_at}· {formatDateTime(c.created_at)}{/if}
								</p>
							</div>
							<Button size="sm" variant="outline" onclick={() => promote(c)}>Register</Button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
		<DialogFooter>
			<Button variant="ghost" onclick={() => (promoteOpen = false)}>Close</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>

<ConfirmationDialog
	bind:open={confirmOpen}
	title={confirmTarget ? `Delete ${confirmTarget.ref}?` : 'Delete decision?'}
	message="The decision is removed from the register. This cannot be undone."
	confirmText="Delete"
	confirmButtonVariant="destructive"
	onConfirm={runDelete}
	showIcon={true}
/>
