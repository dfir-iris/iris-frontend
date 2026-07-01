<!--
  Case Objects admin page — Svelte port of the legacy
  `/manage/objects` screen.

  The legacy page bundles five separate taxonomy editors (asset
  types, IOC types, case classifications, case states, evidence
  types) behind a single sidebar entry. They share an identical CRUD
  shape, so this page renders a thin tab strip + one reusable body
  driven by a per-taxonomy config (display columns, form fields,
  primary-key extractor). Switching tabs swaps the config and reloads
  the list; no per-taxonomy components.

  Chrome mirrors /settings/customers — debounced search + infinite
  scroll on the left, detail / edit dialogs on the right.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		LayersIcon,
		MoreHorizontalIcon,
		PencilIcon,
		PlusIcon,
		RefreshCwIcon,
		SearchIcon,
		Trash2Icon,
		XIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toast } from '$lib/components/ui/toast';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import {
		CaseObjectsService,
		assetIconUrl,
		type CaseObjectResource,
		type TaxonomyRow
	} from '$lib/services/case-objects.service';

	const PAGE_SIZE = 25;

	// Per-taxonomy form-field config. `widget` controls whether the
	// modal renders a single-line input or a multi-line textarea;
	// `required` mirrors the backend Marshmallow validation so we can
	// fail fast client-side. `placeholder` is just a UI nicety.
	type FieldWidget = 'input' | 'textarea' | 'icon';
	type FieldConfig = {
		name: string;
		label: string;
		widget: FieldWidget;
		required?: boolean;
		placeholder?: string;
		help?: string;
		/**
		 * For `widget: 'icon'`, the suffix passed to the v2 upload
		 * endpoint (`/asset-types/<id>/icon/<iconField>`). Matches the
		 * column suffix (`asset_icon_<iconField>`).
		 */
		iconField?: 'compromised' | 'not_compromised';
	};

	type TaxonomyConfig = {
		resource: CaseObjectResource;
		label: string;
		// Display the row's primary key under this property.
		pkKey: string;
		// Display the row's "name" under this property in the list.
		nameKey: string;
		// Optional secondary line under the name.
		subKey?: string;
		// Form fields used by the Add/Edit dialog.
		fields: FieldConfig[];
		// Detail panel field order.
		detailFields: FieldConfig[];
	};

	const TAXONOMIES: TaxonomyConfig[] = [
		{
			resource: 'asset-types',
			label: 'Asset types',
			pkKey: 'asset_id',
			nameKey: 'asset_name',
			subKey: 'asset_description',
			fields: [
				{ name: 'asset_name', label: 'Name', widget: 'input', required: true },
				{
					name: 'asset_description',
					label: 'Description',
					widget: 'textarea',
					required: true
				},
				{
					name: 'asset_icon_compromised',
					label: 'Icon (compromised)',
					widget: 'icon',
					iconField: 'compromised',
					help: 'PNG or SVG. Uploaded after the asset type is created.'
				},
				{
					name: 'asset_icon_not_compromised',
					label: 'Icon (not compromised)',
					widget: 'icon',
					iconField: 'not_compromised'
				}
			],
			detailFields: [
				{ name: 'asset_name', label: 'Name', widget: 'input' },
				{ name: 'asset_description', label: 'Description', widget: 'textarea' },
				{
					name: 'asset_icon_compromised',
					label: 'Icon (compromised)',
					widget: 'icon',
					iconField: 'compromised'
				},
				{
					name: 'asset_icon_not_compromised',
					label: 'Icon (not compromised)',
					widget: 'icon',
					iconField: 'not_compromised'
				}
			]
		},
		{
			resource: 'ioc-types',
			label: 'IOC types',
			pkKey: 'type_id',
			nameKey: 'type_name',
			subKey: 'type_description',
			fields: [
				{ name: 'type_name', label: 'Name', widget: 'input', required: true },
				{ name: 'type_description', label: 'Description', widget: 'textarea', required: true },
				{
					name: 'type_taxonomy',
					label: 'Taxonomy',
					widget: 'input',
					help: 'Optional reference taxonomy (e.g. MISP)'
				},
				{
					name: 'type_validation_regex',
					label: 'Validation regex',
					widget: 'input',
					help: 'Optional — IOC value must match this pattern'
				},
				{
					name: 'type_validation_expect',
					label: 'Validation hint',
					widget: 'input',
					help: 'Shown to users when validation fails'
				}
			],
			detailFields: [
				{ name: 'type_name', label: 'Name', widget: 'input' },
				{ name: 'type_description', label: 'Description', widget: 'textarea' },
				{ name: 'type_taxonomy', label: 'Taxonomy', widget: 'input' },
				{ name: 'type_validation_regex', label: 'Validation regex', widget: 'input' },
				{ name: 'type_validation_expect', label: 'Validation hint', widget: 'input' }
			]
		},
		{
			resource: 'case-classifications',
			label: 'Case classifications',
			pkKey: 'id',
			nameKey: 'name',
			subKey: 'name_expanded',
			fields: [
				{
					name: 'name',
					label: 'Short name',
					widget: 'input',
					required: true,
					placeholder: 'malware'
				},
				{
					name: 'name_expanded',
					label: 'Expanded name',
					widget: 'input',
					required: true,
					placeholder: 'Malware infection'
				},
				{ name: 'description', label: 'Description', widget: 'textarea', required: true }
			],
			detailFields: [
				{ name: 'name', label: 'Short name', widget: 'input' },
				{ name: 'name_expanded', label: 'Expanded name', widget: 'input' },
				{ name: 'description', label: 'Description', widget: 'textarea' }
			]
		},
		{
			resource: 'case-states',
			label: 'Case states',
			pkKey: 'state_id',
			nameKey: 'state_name',
			subKey: 'state_description',
			fields: [
				{ name: 'state_name', label: 'Name', widget: 'input', required: true },
				{ name: 'state_description', label: 'Description', widget: 'textarea' }
			],
			detailFields: [
				{ name: 'state_name', label: 'Name', widget: 'input' },
				{ name: 'state_description', label: 'Description', widget: 'textarea' }
			]
		},
		{
			resource: 'evidence-types',
			label: 'Evidence types',
			pkKey: 'id',
			nameKey: 'name',
			subKey: 'description',
			fields: [
				{ name: 'name', label: 'Name', widget: 'input', required: true },
				{ name: 'description', label: 'Description', widget: 'textarea' }
			],
			detailFields: [
				{ name: 'name', label: 'Name', widget: 'input' },
				{ name: 'description', label: 'Description', widget: 'textarea' }
			]
		}
	];

	type ListState = {
		items: TaxonomyRow[];
		total: number;
		nextPage: number | null;
		loading: boolean;
		loadingMore: boolean;
	};

	const emptyListState = (): ListState => ({
		items: [],
		total: 0,
		nextPage: 1,
		loading: false,
		loadingMore: false
	});

	// Active taxonomy and its derived helpers.
	let activeResource = $state<CaseObjectResource>('asset-types');
	const activeConfig = $derived<TaxonomyConfig>(
		TAXONOMIES.find((t) => t.resource === activeResource) ?? TAXONOMIES[0]
	);
	const pkOf = (row: TaxonomyRow): number => Number(row[activeConfig.pkKey] ?? -1);

	let listState = $state<ListState>(emptyListState());
	let selectedId = $state<number | null>(null);
	const selectedRow = $derived<TaxonomyRow | null>(
		selectedId == null ? null : listState.items.find((r) => pkOf(r) === selectedId) ?? null
	);

	// Search ----------------------------------------------------------
	let searchValue = $state('');
	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	const currentSearch = () => searchValue.trim() || undefined;

	// Edit/Add modal --------------------------------------------------
	let editorOpen = $state(false);
	let editorBusy = $state(false);
	let editorError = $state<string | null>(null);
	// `editorRowId === null` means we're creating; otherwise editing.
	let editorRowId = $state<number | null>(null);
	let editorForm = $state<Record<string, string>>({});
	// Pending icon uploads keyed by form-field name. Each value is the
	// File the user just picked; it's flushed to the server *after* the
	// JSON create/update so we always have an `asset_id` to attach to.
	let editorIconFiles = $state<Record<string, File | null>>({});
	// Preview URL (object URL) so the user can see the file they
	// picked before saving. Created lazily and revoked on close.
	let editorIconPreviews = $state<Record<string, string>>({});

	// Confirmation dialog --------------------------------------------
	let confirmOpen = $state(false);
	let confirmTitle = $state('');
	let confirmMessage = $state('');
	let confirmAction = $state<() => Promise<void> | void>(() => {});

	const showError = (msg: string, fallback = 'Operation failed') =>
		toast({ title: msg || fallback, variant: 'destructive' });
	const showSuccess = (msg: string) => toast({ title: msg, variant: 'success' });

	// Data loaders ---------------------------------------------------
	const loadList = async () => {
		listState = { ...emptyListState(), loading: true };
		try {
			const res = await CaseObjectsService.search(activeResource, {
				page: 1,
				per_page: PAGE_SIZE,
				search: currentSearch()
			});
			if (res.ok && res.data && typeof res.data !== 'string') {
				const env = res.data;
				listState = {
					items: env.data as TaxonomyRow[],
					total: env.total,
					nextPage: env.next_page,
					loading: false,
					loadingMore: false
				};
				// Keep current selection if it still exists; otherwise
				// select the first row so the detail pane isn't empty.
				if (selectedId == null || !env.data.find((r) => pkOf(r as TaxonomyRow) === selectedId)) {
					selectedId = env.data.length > 0 ? pkOf(env.data[0] as TaxonomyRow) : null;
				}
			} else {
				showError(res.error?.message ?? 'Failed to load');
				listState = { ...listState, loading: false };
			}
		} catch (e) {
			showError((e as Error).message);
			listState = { ...listState, loading: false };
		}
	};

	const loadMore = async () => {
		if (listState.loading || listState.loadingMore || listState.nextPage == null) return;
		listState = { ...listState, loadingMore: true };
		const page = listState.nextPage as number;
		try {
			const res = await CaseObjectsService.search(activeResource, {
				page,
				per_page: PAGE_SIZE,
				search: currentSearch()
			});
			if (res.ok && res.data && typeof res.data !== 'string') {
				const env = res.data;
				listState = {
					items: [...listState.items, ...(env.data as TaxonomyRow[])],
					total: env.total,
					nextPage: env.next_page,
					loading: false,
					loadingMore: false
				};
			} else {
				listState = { ...listState, loadingMore: false };
			}
		} catch {
			listState = { ...listState, loadingMore: false };
		}
	};

	// Sentinel for infinite scroll. Re-creates the observer whenever
	// the active taxonomy changes because the DOM node moves with it.
	let sentinel = $state<HTMLDivElement | null>(null);
	$effect(() => {
		if (!sentinel) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) void loadMore();
			},
			{ rootMargin: '120px' }
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	});

	// Tab switching: changing `activeResource` triggers an effect that
	// resets state and reloads the list. Doing it in the click handler
	// instead of an effect would race with the URL-bound search field
	// when both change in the same task tick.
	const selectResource = (r: CaseObjectResource) => {
		if (r === activeResource) return;
		activeResource = r;
		selectedId = null;
		searchValue = '';
		listState = emptyListState();
		void loadList();
	};

	const queueSearch = () => {
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			void loadList();
		}, 250);
	};

	onMount(loadList);

	// Editor flow ----------------------------------------------------
	const blankForm = (): Record<string, string> =>
		Object.fromEntries(activeConfig.fields.map((f) => [f.name, '']));

	const resetEditorIcons = () => {
		for (const url of Object.values(editorIconPreviews)) {
			if (url) URL.revokeObjectURL(url);
		}
		editorIconFiles = {};
		editorIconPreviews = {};
	};

	const openAdd = () => {
		resetEditorIcons();
		editorRowId = null;
		editorForm = blankForm();
		editorError = null;
		editorOpen = true;
	};

	const openEdit = (row: TaxonomyRow) => {
		resetEditorIcons();
		editorRowId = pkOf(row);
		editorForm = Object.fromEntries(
			activeConfig.fields.map((f) => [f.name, String(row[f.name] ?? '')])
		);
		editorError = null;
		editorOpen = true;
	};

	const onIconChange = (fieldName: string, file: File | null) => {
		const prev = editorIconPreviews[fieldName];
		if (prev) URL.revokeObjectURL(prev);
		if (file) {
			editorIconFiles = { ...editorIconFiles, [fieldName]: file };
			editorIconPreviews = {
				...editorIconPreviews,
				[fieldName]: URL.createObjectURL(file)
			};
		} else {
			editorIconFiles = { ...editorIconFiles, [fieldName]: null };
			const next = { ...editorIconPreviews };
			delete next[fieldName];
			editorIconPreviews = next;
		}
	};

	const submitEditor = async () => {
		// Required-field check up front — matches the backend
		// Marshmallow `Length(min=2)` rule for these fields.
		for (const f of activeConfig.fields) {
			if (f.required && (editorForm[f.name] ?? '').trim().length < 2) {
				editorError = `${f.label} must be at least 2 characters`;
				return;
			}
		}
		// Send only non-empty values so empty optional fields stay
		// `NULL` rather than being persisted as empty strings. Icon
		// fields are excluded — their filename is owned by the upload
		// endpoint and editing the JSON copy would race with it.
		const body: Record<string, unknown> = {};
		for (const f of activeConfig.fields) {
			if (f.widget === 'icon') continue;
			const value = editorForm[f.name]?.trim() ?? '';
			if (value.length > 0) body[f.name] = value;
		}
		editorBusy = true;
		editorError = null;
		try {
			const res =
				editorRowId == null
					? await CaseObjectsService.create(activeResource, body)
					: await CaseObjectsService.update(activeResource, editorRowId, body);
			if (!(res.ok && res.data && typeof res.data !== 'string')) {
				const data = res.data as { message?: string; data?: unknown } | null;
				editorError = data?.message ?? res.error?.message ?? 'Unable to save';
				return;
			}
			let row = res.data as TaxonomyRow;
			const targetId = pkOf(row);

			// Flush pending icon uploads. We only attempt asset-type
			// uploads — the iconField guard makes that explicit even
			// though the dialog only exposes file inputs for that
			// resource. Each upload returns the full updated row, so we
			// keep the latest one to refresh the local selection.
			const iconFields = activeConfig.fields.filter(
				(f) => f.widget === 'icon' && f.iconField
			);
			const failedUploads: string[] = [];
			for (const f of iconFields) {
				const file = editorIconFiles[f.name];
				if (!file || !f.iconField) continue;
				const up = await CaseObjectsService.uploadAssetTypeIcon(
					targetId,
					f.iconField,
					file
				);
				if (up.ok && up.data && typeof up.data !== 'string') {
					row = up.data as TaxonomyRow;
				} else {
					const data = up.data as { message?: string } | null;
					failedUploads.push(`${f.label}: ${data?.message ?? 'upload failed'}`);
				}
			}

			if (failedUploads.length) {
				editorError = failedUploads.join('\n');
				// The base row was saved; reload so the list reflects
				// the partial success, then surface the upload errors.
				await loadList();
				selectedId = targetId;
				return;
			}

			showSuccess(editorRowId == null ? 'Created' : 'Saved');
			editorOpen = false;
			resetEditorIcons();
			await loadList();
			selectedId = targetId;
		} catch (e) {
			editorError = (e as Error).message;
		} finally {
			editorBusy = false;
		}
	};

	const removeRow = (row: TaxonomyRow) => {
		confirmTitle = `Remove ${activeConfig.label.toLowerCase()} "${String(
			row[activeConfig.nameKey] ?? `#${pkOf(row)}`
		)}"?`;
		confirmMessage =
			'The backend will refuse if this object is still referenced by cases, IOCs or assets.';
		confirmAction = async () => {
			const res = await CaseObjectsService.remove(activeResource, pkOf(row));
			if (res.ok) {
				showSuccess('Removed');
				if (selectedId === pkOf(row)) selectedId = null;
				await loadList();
			} else {
				const data = res.data as { message?: string } | null;
				showError(data?.message ?? res.error?.message ?? 'Unable to remove');
			}
		};
		confirmOpen = true;
	};

	const runConfirm = async () => {
		await confirmAction();
	};
</script>

<svelte:head>
	<title>Case Objects</title>
</svelte:head>

<div class="flex h-full w-full flex-col overflow-hidden">
	<!-- Page header. Tab strip lives in the body for finer alignment. -->
	<header class="flex items-center justify-between gap-3 border-b px-5 py-3">
		<div class="flex items-center gap-2.5">
			<LayersIcon size={18} class="text-muted-foreground" />
			<div class="leading-tight">
				<h1 class="text-sm font-semibold">Case Objects</h1>
				<p class="text-2xs text-muted-foreground">
					Manage the taxonomies used by cases, IOCs, assets and evidence.
				</p>
			</div>
		</div>

		<div class="flex items-center gap-1.5">
			<Button
				variant="outline"
				size="sm"
				class="h-7"
				onclick={loadList}
				disabled={listState.loading}
			>
				<RefreshCwIcon
					size={12}
					class={`mr-1 ${listState.loading ? 'animate-spin' : ''}`}
				/>
				Refresh
			</Button>
			<Button size="sm" class="h-7" onclick={openAdd}>
				<PlusIcon size={12} class="mr-1" />
				Add {activeConfig.label.toLowerCase().replace(/s$/, '')}
			</Button>
		</div>
	</header>

	<!-- Tab strip -->
	<nav
		class="flex shrink-0 items-center gap-1 overflow-x-auto border-b bg-muted/20 px-3 py-1.5"
		aria-label="Case object taxonomies"
	>
		{#each TAXONOMIES as tax (tax.resource)}
			{@const active = tax.resource === activeResource}
			<button
				type="button"
				onclick={() => selectResource(tax.resource)}
				class="rounded-md px-2.5 py-1 text-xs transition-colors {active
					? 'bg-card font-medium text-foreground shadow-sm'
					: 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}"
				aria-pressed={active}
			>
				{tax.label}
			</button>
		{/each}
	</nav>

	<!-- Master/detail body -->
	<div class="flex flex-1 gap-3 overflow-hidden p-4">
		<!-- List (master) -->
		<section class="flex min-h-0 flex-1 basis-2/5 flex-col overflow-hidden rounded-md border">
			<div class="flex flex-col gap-2 border-b bg-muted/30 px-3 py-2">
				<div class="flex items-center justify-between gap-2">
					<div class="flex items-baseline gap-2">
						<h2
							class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
						>
							{activeConfig.label}
						</h2>
						<span class="text-2xs text-muted-foreground tabular-nums">
							{listState.items.length} / {listState.total}
						</span>
					</div>
				</div>

				<div class="relative">
					<SearchIcon
						size={12}
						class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						type="search"
						placeholder={`Search ${activeConfig.label.toLowerCase()}…`}
						class="h-7 pl-7 pr-7 text-xs"
						bind:value={searchValue}
						oninput={queueSearch}
					/>
					{#if searchValue}
						<button
							type="button"
							aria-label="Clear search"
							class="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
							onclick={() => {
								searchValue = '';
								queueSearch();
							}}
						>
							<XIcon size={11} />
						</button>
					{/if}
				</div>
			</div>

			<div class="flex-1 overflow-y-auto">
				{#if listState.loading && listState.items.length === 0}
					<div class="space-y-1 p-3">
						{#each Array(6) as _}
							<Skeleton class="h-7 w-full" />
						{/each}
					</div>
				{:else if listState.items.length === 0}
					{#if searchValue.trim()}
						<p class="px-3 py-6 text-center text-xs text-muted-foreground">
							No matches for <span class="font-mono">{searchValue.trim()}</span>.
						</p>
					{:else}
						<p class="px-3 py-6 text-center text-xs text-muted-foreground">
							No {activeConfig.label.toLowerCase()} yet.
						</p>
					{/if}
				{:else}
					<ul class="divide-y">
						{#each listState.items as row (pkOf(row))}
							{@const id = pkOf(row)}
							{@const active = id === selectedId}
							{@const iconSrc =
								activeResource === 'asset-types'
									? assetIconUrl(row.asset_icon_not_compromised as string | null) ??
										assetIconUrl(row.asset_icon_compromised as string | null)
									: null}
							<li>
								<button
									type="button"
									class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors
										{active
										? 'bg-primary/10 font-medium text-foreground'
										: 'hover:bg-muted/40'}"
									onclick={() => (selectedId = id)}
								>
									{#if iconSrc}
										<img
											src={iconSrc}
											alt=""
											class="h-5 w-5 shrink-0 rounded-sm bg-muted/40 object-contain"
											loading="lazy"
										/>
									{/if}
									<div class="min-w-0 flex-1">
										<div class="truncate">
											{String(row[activeConfig.nameKey] ?? '—')}
										</div>
										{#if activeConfig.subKey && row[activeConfig.subKey]}
											<div class="truncate text-2xs text-muted-foreground">
												{String(row[activeConfig.subKey])}
											</div>
										{/if}
									</div>
									<span class="font-mono text-2xs text-muted-foreground">
										#{id}
									</span>
								</button>
							</li>
						{/each}
					</ul>

					{#if listState.nextPage != null}
						<div
							bind:this={sentinel}
							class="flex items-center justify-center gap-2 border-t px-3 py-2 text-2xs text-muted-foreground"
						>
							{#if listState.loadingMore}
								<RefreshCwIcon size={11} class="animate-spin" />
								Loading more…
							{:else}
								<span class="opacity-0">Loading more…</span>
							{/if}
						</div>
					{:else if listState.total > PAGE_SIZE}
						<div
							class="border-t px-3 py-2 text-center text-2xs text-muted-foreground"
						>
							End of list — {listState.total} entries
						</div>
					{/if}
				{/if}
			</div>
		</section>

		<!-- Detail pane -->
		<section class="flex min-h-0 flex-1 basis-3/5 flex-col overflow-hidden rounded-md border">
			<div
				class="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2"
			>
				<div class="flex items-baseline gap-2">
					<h2
						class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
					>
						Details
					</h2>
					{#if selectedRow}
						<span class="text-2xs text-muted-foreground">
							{String(selectedRow[activeConfig.nameKey] ?? '')}
						</span>
					{/if}
				</div>

				{#if selectedRow}
					<div class="flex items-center gap-1.5">
						<Button
							variant="outline"
							size="sm"
							class="h-7"
							onclick={() => selectedRow && openEdit(selectedRow)}
						>
							<PencilIcon size={12} class="mr-1" />
							Edit
						</Button>
						<Button
							variant="outline"
							size="sm"
							class="h-7 text-destructive hover:text-destructive"
							onclick={() => selectedRow && removeRow(selectedRow)}
						>
							<Trash2Icon size={12} class="mr-1" />
							Delete
						</Button>
					</div>
				{/if}
			</div>

			<div class="flex-1 overflow-y-auto">
				{#if !selectedRow}
					<p class="px-3 py-10 text-center text-xs text-muted-foreground">
						Select an entry on the left to see its details.
					</p>
				{:else}
					<dl class="grid grid-cols-1 gap-3 p-4 text-xs sm:grid-cols-2">
						<div>
							<dt class="text-2xs uppercase tracking-wide text-muted-foreground">
								{activeConfig.label.replace(/s$/, '')} ID
							</dt>
							<dd class="font-mono text-2xs">{pkOf(selectedRow)}</dd>
						</div>
						{#each activeConfig.detailFields as f (f.name)}
							<div class={f.widget === 'textarea' || f.widget === 'icon' ? 'sm:col-span-2' : ''}>
								<dt class="text-2xs uppercase tracking-wide text-muted-foreground">
									{f.label}
								</dt>
								{#if f.widget === 'icon'}
									{@const url = assetIconUrl(selectedRow[f.name] as string | null)}
									{#if url}
										<dd class="flex items-center gap-2">
											<img
												src={url}
												alt=""
												class="h-10 w-10 rounded-sm border bg-muted/30 object-contain p-1"
											/>
											<span class="font-mono text-2xs text-muted-foreground">
												{String(selectedRow[f.name])}
											</span>
										</dd>
									{:else}
										<dd class="text-muted-foreground">—</dd>
									{/if}
								{:else}
									<dd class="whitespace-pre-wrap">
										{String(selectedRow[f.name] ?? '—') || '—'}
									</dd>
								{/if}
							</div>
						{/each}
					</dl>
				{/if}
			</div>
		</section>
	</div>
</div>

<!-- Add / Edit dialog -->
<Dialog.Root bind:open={editorOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>
				{editorRowId == null ? 'Add' : 'Edit'} {activeConfig.label.toLowerCase().replace(/s$/, '')}
			</Dialog.Title>
			<Dialog.Description>
				{editorRowId == null
					? `Create a new ${activeConfig.label.toLowerCase().replace(/s$/, '')}.`
					: `Update this ${activeConfig.label.toLowerCase().replace(/s$/, '')}.`}
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-3 pt-2">
			{#each activeConfig.fields as field (field.name)}
				<div class="flex flex-col gap-1">
					<label
						for={`editor-${field.name}`}
						class="text-2xs uppercase tracking-wide text-muted-foreground"
					>
						{field.label}{field.required ? ' *' : ''}
					</label>
					{#if field.widget === 'textarea'}
						<Textarea
							id={`editor-${field.name}`}
							rows={3}
							placeholder={field.placeholder}
							bind:value={editorForm[field.name]}
							disabled={editorBusy}
						/>
					{:else if field.widget === 'icon'}
						{@const previewUrl =
							editorIconPreviews[field.name] ??
							assetIconUrl(editorForm[field.name] || null)}
						<div class="flex items-center gap-3">
							<div
								class="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border bg-muted/30"
							>
								{#if previewUrl}
									<img
										src={previewUrl}
										alt=""
										class="h-10 w-10 object-contain"
									/>
								{:else}
									<span class="text-2xs text-muted-foreground">none</span>
								{/if}
							</div>
							<div class="flex flex-1 flex-col gap-1">
								<input
									id={`editor-${field.name}`}
									type="file"
									accept="image/png,image/svg+xml,.png,.svg"
									class="text-2xs file:mr-2 file:rounded-md file:border file:bg-muted file:px-2 file:py-1 file:text-2xs file:font-medium hover:file:bg-muted/70"
									disabled={editorBusy}
									onchange={(e) => {
										const f =
											(e.currentTarget as HTMLInputElement).files?.[0] ?? null;
										onIconChange(field.name, f);
									}}
								/>
								{#if editorRowId == null}
									<p class="text-2xs text-muted-foreground">
										Upload runs after the asset type is created.
									</p>
								{:else if editorIconFiles[field.name]}
									<p class="text-2xs text-muted-foreground">
										Replaces the current icon on save.
									</p>
								{/if}
							</div>
						</div>
					{:else}
						<Input
							id={`editor-${field.name}`}
							placeholder={field.placeholder}
							bind:value={editorForm[field.name]}
							disabled={editorBusy}
						/>
					{/if}
					{#if field.help}
						<p class="text-2xs text-muted-foreground">{field.help}</p>
					{/if}
				</div>
			{/each}

			{#if editorError}
				<p class="text-2xs text-destructive">{editorError}</p>
			{/if}
		</div>

		<Dialog.Footer class="pt-3">
			<Button
				variant="outline"
				onclick={() => {
					resetEditorIcons();
					editorOpen = false;
				}}
				disabled={editorBusy}
			>
				Cancel
			</Button>
			<Button onclick={submitEditor} disabled={editorBusy}>
				{editorBusy ? 'Saving…' : editorRowId == null ? 'Create' : 'Save'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<ConfirmationDialog
	bind:open={confirmOpen}
	title={confirmTitle}
	message={confirmMessage}
	confirmText="Remove"
	onConfirm={runConfirm}
/>
