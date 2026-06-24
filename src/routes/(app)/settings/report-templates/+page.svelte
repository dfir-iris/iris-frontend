<!--
  Report Templates admin page.

  Layout: master/detail
    • LEFT (basis-1/3): paginated template list with debounced
      search + infinite scroll, plus Add / Refresh.
    • RIGHT (basis-2/3): metadata editor + actions panel.
        - Metadata fields (name, description, naming_format,
          language, report type) are rendered dynamically from the
          schema endpoint so adding a column on
          `CaseTemplateReport` only needs a backend change.
        - Actions: Download the source template, Render against a
          case, Delete.
        - Render section has a case picker (server-side scoped to
          cases the current user can read), an optional safe-mode
          toggle, and an inline "Render & download" button that
          streams the resulting docx/html/md back via the browser.

  The Add flow is a modal (not the detail pane) because a new
  template requires a file upload — once created, edits are
  metadata-only and live in the detail pane.

  Permissions:
    • The page itself sits under /settings (admin-gated).
    • Backend requires `server_administrator` for everything except
      Render, which additionally re-checks `read_only`-or-better on
      the target case. So an admin can't accidentally render a
      report for a case they don't have access to.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		DownloadIcon,
		FilePlusIcon,
		FileTextIcon,
		NewspaperIcon,
		PlayIcon,
		PlusIcon,
		RefreshCwIcon,
		SaveIcon,
		SearchIcon,
		Trash2Icon,
		UploadIcon,
		XIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Switch } from '$lib/components/ui/switch';
	import { toast } from '$lib/components/ui/toast';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import {
		ReportTemplatesService,
		type AccessibleCaseSummary,
		type ReportTemplate,
		type ReportTemplateField,
		type ReportTemplateSchemaInfo,
		type ReportTemplateUpdateBody
	} from '$lib/services/report-templates.service';

	const PAGE_SIZE = 25;

	type ListState = {
		items: ReportTemplate[];
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

	let listState = $state<ListState>(emptyListState());
	let selectedId = $state<number | null>(null);
	const selected = $derived<ReportTemplate | null>(
		selectedId == null ? null : listState.items.find((t) => t.id === selectedId) ?? null
	);

	// Search
	let searchValue = $state('');
	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	const currentSearch = () => searchValue.trim() || undefined;

	// Schema + lookups
	let schema = $state<ReportTemplateSchemaInfo | null>(null);
	let schemaError = $state<string | null>(null);

	// Editor (metadata-only update for selected row)
	let editForm = $state<ReportTemplateUpdateBody>({});
	let editDirty = $state(false);
	let editSaving = $state(false);
	let editError = $state<string | null>(null);

	// Add-template modal
	let addOpen = $state(false);
	let addBusy = $state(false);
	let addError = $state<string | null>(null);
	let addName = $state('');
	let addDescription = $state('');
	let addNamingFormat = $state('');
	let addLanguageId = $state<number | null>(null);
	let addReportTypeId = $state<number | null>(null);
	let addFile = $state<File | null>(null);
	let addFileInput: HTMLInputElement | null = $state(null);

	// Render-against-case
	let accessibleCases = $state<AccessibleCaseSummary[]>([]);
	let casesLoading = $state(false);
	let caseSearch = $state('');
	let caseSearchTimer: ReturnType<typeof setTimeout> | null = null;
	let renderCaseId = $state<number | null>(null);
	let renderSafeMode = $state(false);
	let renderRunning = $state(false);
	let renderError = $state<string | null>(null);

	// Confirmation
	let confirmOpen = $state(false);
	let confirmTitle = $state('');
	let confirmMessage = $state('');
	let confirmAction = $state<() => Promise<void> | void>(() => {});

	const showError = (msg: string, fallback = 'Operation failed') =>
		toast({ title: msg || fallback, variant: 'destructive' });
	const showSuccess = (msg: string) => toast({ title: msg, variant: 'success' });

	// ---------- Data loaders ----------
	const loadList = async () => {
		listState = { ...emptyListState(), loading: true };
		try {
			const res = await ReportTemplatesService.search({
				page: 1,
				per_page: PAGE_SIZE,
				search: currentSearch()
			});
			if (res.ok && res.data && typeof res.data !== 'string') {
				const env = res.data;
				listState = {
					items: env.data,
					total: env.total,
					nextPage: env.next_page,
					loading: false,
					loadingMore: false
				};
				if (selectedId == null && env.data.length > 0) {
					void selectTemplate(env.data[0].id);
				} else if (selectedId != null && !env.data.find((t) => t.id === selectedId)) {
					// Selected row dropped out of the first page after
					// a search refine — clear so the detail pane
					// doesn't render stale state.
					selectedId = null;
				}
			} else {
				showError(res.error?.message ?? 'Failed to load templates');
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
			const res = await ReportTemplatesService.search({
				page,
				per_page: PAGE_SIZE,
				search: currentSearch()
			});
			if (res.ok && res.data && typeof res.data !== 'string') {
				const env = res.data;
				listState = {
					items: [...listState.items, ...env.data],
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

	const queueSearch = () => {
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => void loadList(), 250);
	};

	const loadSchema = async () => {
		const res = await ReportTemplatesService.schema();
		if (res.ok && res.data && typeof res.data !== 'string') {
			schema = res.data;
		} else {
			schemaError = res.error?.message ?? 'Failed to load schema';
		}
	};

	const loadAccessibleCases = async (search?: string) => {
		casesLoading = true;
		try {
			const res = await ReportTemplatesService.accessibleCases(search);
			if (res.ok && res.data && typeof res.data !== 'string') {
				accessibleCases = (res.data as { data: AccessibleCaseSummary[] }).data;
			}
		} finally {
			casesLoading = false;
		}
	};

	const queueCaseSearch = () => {
		if (caseSearchTimer) clearTimeout(caseSearchTimer);
		caseSearchTimer = setTimeout(
			() => void loadAccessibleCases(caseSearch.trim() || undefined),
			250
		);
	};

	onMount(async () => {
		await Promise.all([loadList(), loadSchema(), loadAccessibleCases()]);
	});

	// Reset the metadata editor + render state every time the
	// selected template changes so we don't carry edits across rows.
	const selectTemplate = async (id: number) => {
		selectedId = id;
		const tpl = listState.items.find((t) => t.id === id);
		if (tpl) {
			editForm = {
				name: tpl.name,
				description: tpl.description ?? '',
				naming_format: tpl.naming_format ?? '',
				language_id: tpl.language_id,
				report_type_id: tpl.report_type_id
			};
		}
		editDirty = false;
		editError = null;
		renderError = null;
		renderCaseId = null;
	};

	const patchEdit = (next: ReportTemplateUpdateBody) => {
		editForm = { ...editForm, ...next };
		editDirty = true;
	};

	const submitEdit = async () => {
		if (selectedId == null) return;
		editSaving = true;
		editError = null;
		try {
			// Send only the fields the user actually touched? Simpler:
			// the backend accepts a partial dict where missing keys
			// keep their current value. We always send the full
			// editable set since `editForm` only holds editable fields.
			const res = await ReportTemplatesService.update(selectedId, {
				name: editForm.name?.trim() || undefined,
				description: editForm.description?.trim() ?? '',
				naming_format: editForm.naming_format?.trim() ?? '',
				language_id: editForm.language_id,
				report_type_id: editForm.report_type_id
			});
			if (res.ok && res.data && typeof res.data !== 'string') {
				const row = res.data as ReportTemplate;
				showSuccess('Template updated');
				editDirty = false;
				// Patch the row in place so the master list reflects
				// rename/relabel without a refetch.
				listState = {
					...listState,
					items: listState.items.map((t) => (t.id === row.id ? row : t))
				};
			} else {
				const data = res.data as { message?: string } | null;
				editError = data?.message ?? res.error?.message ?? 'Unable to save';
			}
		} catch (e) {
			editError = (e as Error).message;
		} finally {
			editSaving = false;
		}
	};

	// ---------- Add flow ----------
	const openAdd = () => {
		addName = '';
		addDescription = '';
		addNamingFormat = '';
		addLanguageId = schema?.lookups.languages[0]?.id ?? null;
		addReportTypeId = schema?.lookups.report_types[0]?.id ?? null;
		addFile = null;
		addError = null;
		addOpen = true;
	};

	const onAddFilePicked = (event: Event) => {
		const target = event.currentTarget as HTMLInputElement;
		addFile = target.files?.[0] ?? null;
		// If the user hasn't named the template yet, default to the
		// file's basename — drops the extension so the name reads
		// like "Standard investigation" rather than "Standard
		// investigation.docx".
		if (addFile && !addName.trim()) {
			const stem = addFile.name.replace(/\.[^./\\]+$/, '');
			addName = stem;
		}
	};

	const submitAdd = async () => {
		if (!addName.trim()) {
			addError = 'Name is required';
			return;
		}
		if (!addFile) {
			addError = 'A template file is required';
			return;
		}
		if (addLanguageId == null) {
			addError = 'Pick a language';
			return;
		}
		if (addReportTypeId == null) {
			addError = 'Pick a report type';
			return;
		}
		addBusy = true;
		addError = null;
		try {
			const res = await ReportTemplatesService.create({
				name: addName.trim(),
				description: addDescription.trim() || undefined,
				naming_format: addNamingFormat.trim() || undefined,
				language_id: addLanguageId,
				report_type_id: addReportTypeId,
				file: addFile
			});
			if (res.ok && res.data && typeof res.data !== 'string') {
				const row = res.data as ReportTemplate;
				showSuccess(`Template "${row.name}" added`);
				addOpen = false;
				await loadList();
				void selectTemplate(row.id);
			} else {
				const data = res.data as { message?: string; data?: unknown } | null;
				addError = data?.message ?? res.error?.message ?? 'Upload failed';
			}
		} catch (e) {
			addError = (e as Error).message;
		} finally {
			addBusy = false;
		}
	};

	// ---------- Actions ----------
	const downloadCurrent = async () => {
		if (!selected) return;
		const res = await ReportTemplatesService.downloadAndSave(selected.id, selected.name);
		if (!res.ok) showError(res.error ?? 'Download failed');
	};

	const removeCurrent = () => {
		if (!selected) return;
		const tpl = selected;
		confirmTitle = `Delete template "${tpl.name}"?`;
		confirmMessage = 'This deletes the template file from disk. Cases previously rendered from it are unaffected.';
		confirmAction = async () => {
			const res = await ReportTemplatesService.remove(tpl.id);
			if (res.ok) {
				showSuccess('Template deleted');
				selectedId = null;
				await loadList();
			} else {
				const data = res.data as { message?: string } | null;
				showError(data?.message ?? res.error?.message ?? 'Unable to delete');
			}
		};
		confirmOpen = true;
	};

	const runRender = async () => {
		if (!selected) return;
		if (renderCaseId == null) {
			renderError = 'Pick a case first.';
			return;
		}
		renderRunning = true;
		renderError = null;
		try {
			const res = await ReportTemplatesService.renderAndSave(
				selected.id,
				{ case_id: renderCaseId, safe_mode: renderSafeMode },
				`${selected.name}-rendered`
			);
			if (res.ok) {
				showSuccess('Report generated');
			} else {
				renderError = res.error ?? 'Render failed';
			}
		} catch (e) {
			renderError = (e as Error).message;
		} finally {
			renderRunning = false;
		}
	};

	const runConfirm = async () => {
		await confirmAction();
	};

	// ---------- Derived ----------
	const editableFields = $derived<ReportTemplateField[]>(schema?.fields ?? []);
	const formatDate = (iso: string | null) =>
		iso ? new Date(iso).toLocaleString() : '—';
</script>

<svelte:head>
	<title>Report Templates | DFIR-IRIS</title>
</svelte:head>

<div class="flex h-full w-full flex-col overflow-hidden">
	<!-- Page header -->
	<header class="flex items-center justify-between gap-3 border-b px-5 py-3">
		<div class="flex items-center gap-2.5">
			<NewspaperIcon size={18} class="text-muted-foreground" />
			<div class="leading-tight">
				<h1 class="text-sm font-semibold">Report Templates</h1>
				<p class="text-2xs text-muted-foreground">
					Docx, HTML or Markdown skeletons that get filled in with case data on render.
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
			<Button size="sm" class="h-7" onclick={openAdd} disabled={schema == null}>
				<PlusIcon size={12} class="mr-1" />
				Add template
			</Button>
		</div>
	</header>

	<!-- Master / detail body -->
	<div class="flex flex-1 gap-3 overflow-hidden p-4">
		<!-- Master list -->
		<section class="flex min-h-0 flex-1 basis-1/3 flex-col overflow-hidden rounded-md border">
			<div class="flex flex-col gap-2 border-b bg-muted/30 px-3 py-2">
				<div class="flex items-center justify-between gap-2">
					<div class="flex items-baseline gap-2">
						<h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							Templates
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
						placeholder="Search by name or description…"
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
							No templates yet. Click <span class="font-medium">Add template</span> to upload one.
						</p>
					{/if}
				{:else}
					<ul class="divide-y">
						{#each listState.items as tpl (tpl.id)}
							{@const active = tpl.id === selectedId}
							<li>
								<button
									type="button"
									class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors
										{active
										? 'bg-primary/10 font-medium text-foreground'
										: 'hover:bg-muted/40'}"
									onclick={() => selectTemplate(tpl.id)}
								>
									<FileTextIcon size={14} class="shrink-0 text-muted-foreground" />
									<div class="min-w-0 flex-1">
										<div class="truncate">{tpl.name}</div>
										<div class="truncate text-2xs text-muted-foreground">
											{tpl.report_type_name ?? '—'} · {tpl.language_code ?? '—'}
											{#if tpl.description}
												· {tpl.description}
											{/if}
										</div>
									</div>
									<span class="font-mono text-2xs text-muted-foreground">
										#{tpl.id}
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
						<div class="border-t px-3 py-2 text-center text-2xs text-muted-foreground">
							End of list — {listState.total} entries
						</div>
					{/if}
				{/if}
			</div>
		</section>

		<!-- Detail -->
		<section class="flex min-h-0 flex-1 basis-2/3 flex-col overflow-hidden rounded-md border">
			<div class="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
				<div class="flex items-baseline gap-2">
					<h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Template
					</h2>
					{#if selected}
						<span class="text-2xs text-muted-foreground">{selected.name}</span>
					{/if}
				</div>

				{#if selected}
					<div class="flex items-center gap-1.5">
						<Button variant="outline" size="sm" class="h-7" onclick={downloadCurrent}>
							<DownloadIcon size={12} class="mr-1" />
							Download
						</Button>
						<Button
							variant="outline"
							size="sm"
							class="h-7 text-destructive hover:text-destructive"
							onclick={removeCurrent}
						>
							<Trash2Icon size={12} class="mr-1" />
							Delete
						</Button>
					</div>
				{/if}
			</div>

			<div class="flex-1 overflow-y-auto">
				{#if !selected}
					<p class="px-3 py-10 text-center text-xs text-muted-foreground">
						Select a template on the left, or click <span class="font-medium">Add template</span> to upload one.
					</p>
				{:else if schema == null}
					{#if schemaError}
						<p class="px-3 py-6 text-center text-2xs text-destructive">{schemaError}</p>
					{:else}
						<div class="space-y-2 p-3">
							{#each Array(4) as _}
								<Skeleton class="h-10 w-full" />
							{/each}
						</div>
					{/if}
				{:else}
					<!-- Metadata header strip -->
					<dl class="grid grid-cols-2 gap-3 border-b bg-muted/10 px-4 py-3 text-2xs sm:grid-cols-4">
						<div>
							<dt class="uppercase tracking-wide text-muted-foreground">ID</dt>
							<dd class="font-mono">{selected.id}</dd>
						</div>
						<div>
							<dt class="uppercase tracking-wide text-muted-foreground">Added by</dt>
							<dd>{selected.created_by ?? '—'}</dd>
						</div>
						<div>
							<dt class="uppercase tracking-wide text-muted-foreground">Created</dt>
							<dd>{formatDate(selected.date_created)}</dd>
						</div>
						<div>
							<dt class="uppercase tracking-wide text-muted-foreground">File</dt>
							<dd class="truncate font-mono" title={selected.internal_reference}>
								{selected.internal_reference}
							</dd>
						</div>
					</dl>

					<!-- Metadata editor -->
					<form
						class="grid grid-cols-1 gap-3 p-4 md:grid-cols-2"
						onsubmit={(e) => {
							e.preventDefault();
							void submitEdit();
						}}
					>
						{#each editableFields as field (field.name)}
							{@const fid = `tpl-${selected.id}-${field.name}`}
							<div
								class={field.kind === 'text' || field.name === 'naming_format'
									? 'md:col-span-2'
									: ''}
							>
								<div class="flex flex-col gap-1">
									<label
										for={fid}
										class="text-2xs font-medium uppercase tracking-wide text-muted-foreground"
									>
										{field.label}
										{#if field.required}<span class="text-destructive">*</span>{/if}
									</label>
									{#if field.kind === 'string'}
										<Input
											id={fid}
											class="h-7 text-xs"
											value={String((editForm as Record<string, unknown>)[field.name] ?? '')}
											disabled={editSaving}
											oninput={(e) =>
												patchEdit({
													[field.name]: (e.currentTarget as HTMLInputElement).value
												} as ReportTemplateUpdateBody)}
										/>
									{:else if field.kind === 'text'}
										<Textarea
											id={fid}
											rows={3}
											value={String((editForm as Record<string, unknown>)[field.name] ?? '')}
											disabled={editSaving}
											oninput={(e) =>
												patchEdit({
													[field.name]: (e.currentTarget as HTMLTextAreaElement).value
												} as ReportTemplateUpdateBody)}
										/>
									{:else if field.kind === 'select' && field.options_ref}
										{@const options =
											field.options_ref === 'languages'
												? schema.lookups.languages.map((l) => ({
														value: l.id,
														label: `${l.name} (${l.code})`
													}))
												: schema.lookups.report_types.map((r) => ({
														value: r.id,
														label: r.name
													}))}
										<select
											id={fid}
											class="h-7 rounded-md border bg-background px-2 text-xs"
											value={String((editForm as Record<string, unknown>)[field.name] ?? '')}
											disabled={editSaving}
											onchange={(e) => {
												const raw = (e.currentTarget as HTMLSelectElement).value;
												patchEdit({
													[field.name]: raw === '' ? null : Number(raw)
												} as ReportTemplateUpdateBody);
											}}
										>
											{#each options as o (o.value)}
												<option value={String(o.value)}>{o.label}</option>
											{/each}
										</select>
									{/if}
									{#if field.help}
										<p class="text-2xs text-muted-foreground">{field.help}</p>
									{/if}
								</div>
							</div>
						{/each}

						<div class="md:col-span-2 flex items-center justify-end gap-2">
							{#if editError}
								<p class="mr-auto text-2xs text-destructive">{editError}</p>
							{/if}
							<Button type="submit" size="sm" class="h-7" disabled={editSaving || !editDirty}>
								<SaveIcon size={12} class="mr-1" />
								{editSaving ? 'Saving…' : 'Save changes'}
							</Button>
						</div>
					</form>

					<!-- Render against a case -->
					<section class="border-t bg-muted/10">
						<header class="flex items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2">
							<div class="flex items-center gap-2">
								<PlayIcon size={14} class="text-muted-foreground" />
								<h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									Render against a case
								</h3>
							</div>
						</header>

						<div class="flex flex-col gap-3 p-4">
							<p class="text-2xs text-muted-foreground">
								Pick a case you have access to and download the rendered
								{selected.report_type_name ?? 'report'}. Nothing is stored — the file
								streams straight to your browser.
							</p>

							<div class="flex flex-col gap-1.5">
								<label
									for="render-case-search"
									class="text-2xs uppercase tracking-wide text-muted-foreground"
								>
									Case
								</label>
								<div class="relative">
									<SearchIcon
										size={12}
										class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
									/>
									<Input
										id="render-case-search"
										type="search"
										placeholder="Search by case name or SOC id…"
										class="h-7 pl-7 text-xs"
										bind:value={caseSearch}
										oninput={queueCaseSearch}
									/>
								</div>
								<select
									class="h-7 rounded-md border bg-background px-2 text-xs"
									value={renderCaseId == null ? '' : String(renderCaseId)}
									onchange={(e) => {
										const raw = (e.currentTarget as HTMLSelectElement).value;
										renderCaseId = raw === '' ? null : Number(raw);
									}}
								>
									<option value="">
										{casesLoading
											? 'Loading cases…'
											: accessibleCases.length === 0
												? 'No accessible cases'
												: 'Pick a case…'}
									</option>
									{#each accessibleCases as c (c.case_id)}
										<option value={String(c.case_id)}>
											#{c.case_id} — {c.name}{c.soc_id ? ` — SOC:${c.soc_id}` : ''}
										</option>
									{/each}
								</select>
							</div>

							<div class="flex items-center gap-2">
								<Switch
									checked={renderSafeMode}
									onCheckedChange={(v: boolean) => (renderSafeMode = v)}
								/>
								<span class="text-2xs text-muted-foreground">
									Safe mode — skip embedding images (faster, useful for spot-checks)
								</span>
							</div>

							<div class="flex items-center gap-2">
								<Button
									size="sm"
									class="h-7"
									onclick={runRender}
									disabled={renderRunning || renderCaseId == null}
								>
									<PlayIcon size={12} class="mr-1" />
									{renderRunning ? 'Rendering…' : 'Render & download'}
								</Button>
								{#if renderError}
									<p class="text-2xs text-destructive">{renderError}</p>
								{/if}
							</div>
						</div>
					</section>
				{/if}
			</div>
		</section>
	</div>
</div>

<!-- Add template modal -->
<Dialog.Root bind:open={addOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2">
				<FilePlusIcon size={16} class="text-muted-foreground" />
				Add report template
			</Dialog.Title>
			<Dialog.Description>
				Upload a {schema?.allowed_extensions.join(' / ') ?? 'docx / html / md'} file plus the metadata used by the renderer.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-3 pt-2">
			<div class="flex flex-col gap-1">
				<label
					for="add-template-file"
					class="text-2xs uppercase tracking-wide text-muted-foreground"
				>
					Template file *
				</label>
				<div class="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						class="h-7"
						onclick={() => addFileInput?.click()}
						disabled={addBusy}
					>
						<UploadIcon size={12} class="mr-1" />
						Pick file
					</Button>
					<span class="truncate text-2xs text-muted-foreground" title={addFile?.name ?? ''}>
						{addFile?.name ?? 'No file selected'}
					</span>
				</div>
				<input
					id="add-template-file"
					bind:this={addFileInput}
					type="file"
					accept={schema?.allowed_extensions.map((e) => `.${e}`).join(',') ?? '.docx,.html,.md'}
					class="hidden"
					onchange={onAddFilePicked}
				/>
			</div>

			<div class="flex flex-col gap-1">
				<label for="add-template-name" class="text-2xs uppercase tracking-wide text-muted-foreground">
					Name *
				</label>
				<Input
					id="add-template-name"
					class="h-7 text-xs"
					bind:value={addName}
					disabled={addBusy}
				/>
			</div>

			<div class="flex flex-col gap-1">
				<label
					for="add-template-description"
					class="text-2xs uppercase tracking-wide text-muted-foreground"
				>
					Description
				</label>
				<Textarea
					id="add-template-description"
					rows={2}
					bind:value={addDescription}
					disabled={addBusy}
				/>
			</div>

			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div class="flex flex-col gap-1">
					<label
						for="add-template-language"
						class="text-2xs uppercase tracking-wide text-muted-foreground"
					>
						Language *
					</label>
					<select
						id="add-template-language"
						class="h-7 rounded-md border bg-background px-2 text-xs"
						value={addLanguageId == null ? '' : String(addLanguageId)}
						disabled={addBusy}
						onchange={(e) => {
							const raw = (e.currentTarget as HTMLSelectElement).value;
							addLanguageId = raw === '' ? null : Number(raw);
						}}
					>
						{#each schema?.lookups.languages ?? [] as l (l.id)}
							<option value={String(l.id)}>{l.name} ({l.code})</option>
						{/each}
					</select>
				</div>

				<div class="flex flex-col gap-1">
					<label
						for="add-template-type"
						class="text-2xs uppercase tracking-wide text-muted-foreground"
					>
						Report type *
					</label>
					<select
						id="add-template-type"
						class="h-7 rounded-md border bg-background px-2 text-xs"
						value={addReportTypeId == null ? '' : String(addReportTypeId)}
						disabled={addBusy}
						onchange={(e) => {
							const raw = (e.currentTarget as HTMLSelectElement).value;
							addReportTypeId = raw === '' ? null : Number(raw);
						}}
					>
						{#each schema?.lookups.report_types ?? [] as r (r.id)}
							<option value={String(r.id)}>{r.name}</option>
						{/each}
					</select>
				</div>
			</div>

			<div class="flex flex-col gap-1">
				<label
					for="add-template-naming"
					class="text-2xs uppercase tracking-wide text-muted-foreground"
				>
					Output filename format
				</label>
				<Input
					id="add-template-naming"
					class="h-7 text-xs"
					placeholder="report-%case_name%-%date%"
					bind:value={addNamingFormat}
					disabled={addBusy}
				/>
				<p class="text-2xs text-muted-foreground">
					Tags: <span class="font-mono">
						{schema?.naming_format_tags.join(', ') ?? '%date%, %customer%, %case_name%, %code_name%'}
					</span>
				</p>
			</div>

			{#if addError}
				<p class="whitespace-pre-wrap text-2xs text-destructive">{addError}</p>
			{/if}
		</div>

		<Dialog.Footer class="pt-3">
			<Button
				variant="outline"
				onclick={() => (addOpen = false)}
				disabled={addBusy}
			>
				Cancel
			</Button>
			<Button onclick={submitAdd} disabled={addBusy}>
				{addBusy ? 'Uploading…' : 'Upload'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<ConfirmationDialog
	bind:open={confirmOpen}
	title={confirmTitle}
	message={confirmMessage}
	confirmText="Delete"
	onConfirm={runConfirm}
/>
