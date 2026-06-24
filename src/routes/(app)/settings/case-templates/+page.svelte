<!--
  Case Templates admin page — Svelte port of the legacy
  /manage/case-templates list + ACE-editor modal.

  Layout: master/detail
    • LEFT (basis-1/3): paginated template list with debounced
      search + infinite scroll, plus Add / Import / Refresh.
    • RIGHT (basis-2/3): the editor. A tab strip switches between
      JSON Editor and a Schema reference card. The editor uses the
      existing JsonEditor (Ace, JSON mode, live validation).

  Permissions:
    • The page itself sits under /settings (admin-gated).
    • Backend requires `case_templates_read` (list/get) and
      `case_templates_write` (create/update/delete).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		BookDashedIcon,
		DownloadIcon,
		FileCodeIcon,
		HelpCircleIcon,
		PlusIcon,
		RefreshCwIcon,
		SaveIcon,
		SearchIcon,
		Trash2Icon,
		UploadIcon,
		XIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from '$lib/components/ui/toast';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import JsonEditor from '$lib/components/common/editors/JsonEditor.svelte';
	import {
		CaseTemplatesV2Service,
		type CaseTemplateBodyV2,
		type CaseTemplateV2
	} from '$lib/services/case-templates.service';

	const PAGE_SIZE = 25;

	// Default body offered when the user clicks "Add template". Matches
	// the shape of the legacy seed and the schema fields the backend
	// validates against.
	const DEFAULT_TEMPLATE_BODY: CaseTemplateBodyV2 = {
		name: 'new-template',
		display_name: 'New template',
		description: '',
		author: '',
		title_prefix: '',
		summary: '',
		tags: [],
		classification: '',
		note_directories: [],
		tasks: []
	};

	type ListState = {
		items: CaseTemplateV2[];
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

	// Editor state ----------------------------------------------------
	type EditorMode = 'closed' | 'new' | 'edit';
	let editorMode = $state<EditorMode>('closed');
	let editorBody = $state<string>('');
	let editorIsValid = $state(true);
	let editorJsonError = $state<string | null>(null);
	let editorSaving = $state(false);
	let editorSaveError = $state<string | null>(null);

	type DetailTab = 'editor' | 'schema';
	let detailTab = $state<DetailTab>('editor');

	// Search ----------------------------------------------------------
	let searchValue = $state('');
	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	const currentSearch = () => searchValue.trim() || undefined;

	// Confirmation ---------------------------------------------------
	let confirmOpen = $state(false);
	let confirmTitle = $state('');
	let confirmMessage = $state('');
	let confirmAction = $state<() => Promise<void> | void>(() => {});

	// Import file picker ---------------------------------------------
	let importInput: HTMLInputElement | null = $state(null);

	const showError = (msg: string, fallback = 'Operation failed') =>
		toast({ title: msg || fallback, variant: 'destructive' });
	const showSuccess = (msg: string) => toast({ title: msg, variant: 'success' });

	// List loading ----------------------------------------------------
	const loadList = async () => {
		listState = { ...emptyListState(), loading: true };
		try {
			const res = await CaseTemplatesV2Service.search({
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
				if (selectedId == null || !env.data.find((r) => r.id === selectedId)) {
					selectedId = env.data.length > 0 ? env.data[0].id : null;
					if (selectedId != null) await openExisting(selectedId);
					else closeEditor();
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
			const res = await CaseTemplatesV2Service.search({
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
		searchTimer = setTimeout(() => {
			void loadList();
		}, 250);
	};

	onMount(loadList);

	// Editor flow ----------------------------------------------------
	const formatJson = (obj: unknown) => JSON.stringify(obj, null, 2);

	const closeEditor = () => {
		editorMode = 'closed';
		editorBody = '';
		editorJsonError = null;
		editorSaveError = null;
	};

	const openExisting = async (id: number) => {
		const res = await CaseTemplatesV2Service.get(id);
		if (res.ok && res.data && typeof res.data !== 'string') {
			const tpl = res.data as CaseTemplateV2;
			// Strip metadata fields — they're dump-only on the
			// backend and serving them back on update is harmless but
			// noisy when the user is editing the JSON manually.
			const {
				id: _id,
				created_at,
				updated_at,
				created_by_user_id,
				...editable
			} = tpl;
			void _id;
			void created_at;
			void updated_at;
			void created_by_user_id;
			editorBody = formatJson(editable);
			editorMode = 'edit';
			editorJsonError = null;
			editorSaveError = null;
			detailTab = 'editor';
		} else {
			showError(res.error?.message ?? 'Failed to load template');
		}
	};

	const openNew = () => {
		selectedId = null;
		editorBody = formatJson(DEFAULT_TEMPLATE_BODY);
		editorMode = 'new';
		editorJsonError = null;
		editorSaveError = null;
		detailTab = 'editor';
	};

	const onSelect = async (id: number) => {
		if (id === selectedId && editorMode === 'edit') return;
		selectedId = id;
		await openExisting(id);
	};

	const parsedEditorBody = (): CaseTemplateBodyV2 | null => {
		try {
			return JSON.parse(editorBody);
		} catch {
			return null;
		}
	};

	const saveEditor = async () => {
		if (!editorIsValid) {
			editorSaveError = 'Fix the JSON syntax before saving.';
			return;
		}
		const parsed = parsedEditorBody();
		if (parsed == null) {
			editorSaveError = 'Body is not valid JSON.';
			return;
		}
		editorSaving = true;
		editorSaveError = null;
		try {
			const res =
				editorMode === 'new'
					? await CaseTemplatesV2Service.create(parsed)
					: selectedId != null
						? await CaseTemplatesV2Service.update(selectedId, parsed)
						: null;
			if (res == null) {
				editorSaveError = 'Nothing to save.';
				return;
			}
			if (res.ok && res.data && typeof res.data !== 'string') {
				const row = res.data as CaseTemplateV2;
				showSuccess(editorMode === 'new' ? 'Template created' : 'Template saved');
				selectedId = row.id;
				await loadList();
				await openExisting(row.id);
			} else {
				const data = res.data as { message?: string; data?: unknown } | null;
				editorSaveError = data?.message ?? res.error?.message ?? 'Unable to save';
			}
		} catch (e) {
			editorSaveError = (e as Error).message;
		} finally {
			editorSaving = false;
		}
	};

	const removeCurrent = () => {
		if (selectedId == null) return;
		const id = selectedId;
		const tpl = listState.items.find((t) => t.id === id);
		confirmTitle = `Delete template "${tpl?.display_name || tpl?.name || `#${id}`}"?`;
		confirmMessage = 'This cannot be undone. Existing cases that were created from this template are unaffected.';
		confirmAction = async () => {
			const res = await CaseTemplatesV2Service.remove(id);
			if (res.ok) {
				showSuccess('Template deleted');
				selectedId = null;
				closeEditor();
				await loadList();
			} else {
				const data = res.data as { message?: string } | null;
				showError(data?.message ?? res.error?.message ?? 'Unable to delete');
			}
		};
		confirmOpen = true;
	};

	// Export current editor JSON as a downloadable file.
	const exportCurrent = () => {
		const parsed = parsedEditorBody();
		if (parsed == null) {
			showError('Body is not valid JSON; fix it before exporting.');
			return;
		}
		const blob = new Blob([JSON.stringify(parsed, null, 2)], {
			type: 'application/json'
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${parsed.name || 'case-template'}.json`;
		a.click();
		URL.revokeObjectURL(url);
	};

	const triggerImport = () => importInput?.click();

	const handleImportFile = async (event: Event) => {
		const target = event.currentTarget as HTMLInputElement;
		const file = target.files?.[0];
		target.value = '';
		if (!file) return;
		try {
			const text = await file.text();
			JSON.parse(text); // syntax check
			editorBody = text;
			editorMode = 'new';
			selectedId = null;
			editorJsonError = null;
			editorSaveError = null;
			detailTab = 'editor';
		} catch (e) {
			showError(`File is not valid JSON: ${(e as Error).message}`);
		}
	};

	const runConfirm = async () => {
		await confirmAction();
	};

	// Derived display ------------------------------------------------
	const selectedTemplate = $derived<CaseTemplateV2 | null>(
		selectedId == null
			? null
			: listState.items.find((t) => t.id === selectedId) ?? null
	);
</script>

<svelte:head>
	<title>Case Templates | DFIR-IRIS</title>
</svelte:head>

<div class="flex h-full w-full flex-col overflow-hidden">
	<!-- Page header -->
	<header class="flex items-center justify-between gap-3 border-b px-5 py-3">
		<div class="flex items-center gap-2.5">
			<BookDashedIcon size={18} class="text-muted-foreground" />
			<div class="leading-tight">
				<h1 class="text-sm font-semibold">Case Templates</h1>
				<p class="text-2xs text-muted-foreground">
					Reusable case skeletons — title prefix, classification, tags, tasks and notes.
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
			<Button variant="outline" size="sm" class="h-7" onclick={triggerImport}>
				<UploadIcon size={12} class="mr-1" />
				Import
			</Button>
			<input
				bind:this={importInput}
				type="file"
				accept="application/json,.json"
				class="hidden"
				onchange={handleImportFile}
			/>
			<Button size="sm" class="h-7" onclick={openNew}>
				<PlusIcon size={12} class="mr-1" />
				Add template
			</Button>
		</div>
	</header>

	<!-- Body -->
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
						placeholder="Search by name, description, author…"
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
							No templates yet. Click <span class="font-medium">Add template</span> to get started.
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
									onclick={() => onSelect(tpl.id)}
								>
									<div class="min-w-0 flex-1">
										<div class="truncate">{tpl.display_name || tpl.name}</div>
										{#if tpl.description}
											<div class="truncate text-2xs text-muted-foreground">
												{tpl.description}
											</div>
										{/if}
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

		<!-- Detail / editor -->
		<section class="flex min-h-0 flex-1 basis-2/3 flex-col overflow-hidden rounded-md border">
			<div class="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
				<div class="flex items-baseline gap-2">
					<h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Editor
					</h2>
					{#if editorMode === 'new'}
						<span class="text-2xs text-muted-foreground">New template</span>
					{:else if selectedTemplate}
						<span class="text-2xs text-muted-foreground">
							{selectedTemplate.display_name || selectedTemplate.name}
						</span>
					{/if}
				</div>

				{#if editorMode !== 'closed'}
					<div class="flex items-center gap-1.5">
						<Button
							variant="outline"
							size="sm"
							class="h-7"
							onclick={exportCurrent}
							disabled={!editorIsValid}
						>
							<DownloadIcon size={12} class="mr-1" />
							Export
						</Button>
						{#if editorMode === 'edit' && selectedId != null}
							<Button
								variant="outline"
								size="sm"
								class="h-7 text-destructive hover:text-destructive"
								onclick={removeCurrent}
							>
								<Trash2Icon size={12} class="mr-1" />
								Delete
							</Button>
						{/if}
						<Button
							size="sm"
							class="h-7"
							onclick={saveEditor}
							disabled={editorSaving || !editorIsValid}
						>
							<SaveIcon size={12} class="mr-1" />
							{editorSaving ? 'Saving…' : editorMode === 'new' ? 'Create' : 'Save'}
						</Button>
					</div>
				{/if}
			</div>

			{#if editorMode === 'closed'}
				<p class="flex-1 px-3 py-10 text-center text-xs text-muted-foreground">
					Select a template on the left, or click <span class="font-medium">Add template</span> to create one.
				</p>
			{:else}
				{@const tabs: { id: DetailTab; label: string; icon: typeof FileCodeIcon }[] = [
					{ id: 'editor', label: 'JSON Editor', icon: FileCodeIcon },
					{ id: 'schema', label: 'Schema', icon: HelpCircleIcon }
				]}
				<!-- Tab strip -->
				<nav
					class="flex shrink-0 items-center gap-1 border-b bg-muted/10 px-3 py-1.5"
					aria-label="Editor sections"
				>
					{#each tabs as t}
						{@const active = detailTab === t.id}
						<button
							type="button"
							onclick={() => (detailTab = t.id)}
							class="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors {active
								? 'bg-card font-medium text-foreground shadow-sm'
								: 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}"
							aria-pressed={active}
						>
							<t.icon size={12} />
							{t.label}
						</button>
					{/each}
				</nav>

				<div class="flex-1 overflow-y-auto">
					{#if detailTab === 'editor'}
						<div class="flex flex-col gap-2 p-3">
							<JsonEditor
								value={editorBody}
								mode="json"
								minLines={20}
								maxLines={48}
								onInput={(val, ok, err) => {
									editorBody = val;
									editorIsValid = ok;
									editorJsonError = err;
								}}
							/>
							{#if editorJsonError && !editorIsValid}
								<p class="text-2xs text-destructive">
									JSON syntax error: {editorJsonError}
								</p>
							{/if}
							{#if editorSaveError}
								<p class="whitespace-pre-wrap text-2xs text-destructive">
									{editorSaveError}
								</p>
							{/if}
						</div>
					{:else if detailTab === 'schema'}
						<div class="prose prose-sm flex max-w-none flex-col gap-3 p-4 text-xs">
							<h3 class="text-sm font-semibold">Case template structure</h3>
							<p class="text-muted-foreground">
								A case template is a JSON document describing how a new case should be
								seeded — title prefix, classification, tags, tasks and note directories.
								When applied, the post-modifier appends the summary to the case
								description, materialises tags, creates tasks (status "To Do") and walks
								the note directory tree creating notes.
							</p>
							<table class="w-full border-collapse text-2xs">
								<thead class="border-b bg-muted/40 text-left uppercase tracking-wide text-muted-foreground">
									<tr>
										<th class="px-2 py-1 font-medium">Field</th>
										<th class="px-2 py-1 font-medium">Type</th>
										<th class="px-2 py-1 font-medium">Notes</th>
									</tr>
								</thead>
								<tbody class="divide-y">
									<tr><td class="px-2 py-1 font-mono">name</td><td class="px-2 py-1">string</td><td class="px-2 py-1">Required. Unique short slug.</td></tr>
									<tr><td class="px-2 py-1 font-mono">display_name</td><td class="px-2 py-1">string</td><td class="px-2 py-1">Optional. Falls back to <code>name</code>.</td></tr>
									<tr><td class="px-2 py-1 font-mono">description</td><td class="px-2 py-1">string</td><td class="px-2 py-1">Admin-side description (not shown on the case).</td></tr>
									<tr><td class="px-2 py-1 font-mono">author</td><td class="px-2 py-1">string</td><td class="px-2 py-1">Max 128 chars.</td></tr>
									<tr><td class="px-2 py-1 font-mono">title_prefix</td><td class="px-2 py-1">string</td><td class="px-2 py-1">Max 32 chars. Prepended to the case name.</td></tr>
									<tr><td class="px-2 py-1 font-mono">summary</td><td class="px-2 py-1">string</td><td class="px-2 py-1">Appended to the case description on apply.</td></tr>
									<tr><td class="px-2 py-1 font-mono">tags</td><td class="px-2 py-1">string[]</td><td class="px-2 py-1">Appended to the case tags.</td></tr>
									<tr><td class="px-2 py-1 font-mono">classification</td><td class="px-2 py-1">string</td><td class="px-2 py-1">Must match an existing case classification's <code>name</code>.</td></tr>
									<tr>
										<td class="px-2 py-1 font-mono">tasks</td>
										<td class="px-2 py-1">object[]</td>
										<td class="px-2 py-1">
											Each <code>{`{title, description?, tags?}`}</code>.
										</td>
									</tr>
									<tr>
										<td class="px-2 py-1 font-mono">note_directories</td>
										<td class="px-2 py-1">object[]</td>
										<td class="px-2 py-1">
											Each <code>{`{title, notes?: [{title, content?}]}`}</code>.
										</td>
									</tr>
								</tbody>
							</table>
						</div>
					{/if}
				</div>
			{/if}
		</section>
	</div>
</div>

<ConfirmationDialog
	bind:open={confirmOpen}
	title={confirmTitle}
	message={confirmMessage}
	confirmText="Delete"
	onConfirm={runConfirm}
/>
