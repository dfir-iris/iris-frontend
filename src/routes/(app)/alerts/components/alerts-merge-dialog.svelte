<script lang="ts">
	import { getContext } from 'svelte';
	import { AlertService, type MergeAlertBody } from '$lib/services/alerts.service';
	import {
		CASE_TEMPLATES_CTX,
		type CaseTemplatesContext
	} from '$lib/contexts/case-templates.context.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import Button from '$lib/components/ui/button/button.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import Label from '$lib/components/ui/label/label.svelte';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import SearchSelect, {
		type SelectOption
	} from '$lib/components/common/selects/SearchSelect.svelte';
	import { SegmentedSelect, type SegmentedSelectOption } from '$lib/components/ui/segmented-select';
	import TagInput from '$lib/components/common/tag/TagInput.svelte';
	import type { Alert } from '$lib/types/resources/alert';
	import { CaseService } from '$lib/services/case.service';
	import type { Case } from '$lib/types/resources/case';
	import type { Paginated } from '$lib/services/api.service';
	import { CheckIcon, SearchIcon } from 'lucide-svelte';
	import { groupImportableObservables, type ImportGroup } from '../helpers/alerts-merge';

	export type MergeMode = 'new' | 'existing';

	export interface MergeAlertPayload
		extends Omit<MergeAlertBody, 'target_case_id' | 'case_template_id'> {
		target_case_id: number | null;
		case_template_id: number | null;
		case_title: string;
		case_tags: string;
	}

	type Props = {
		open: boolean;
		selectedAlertIds: number[];
		selectedAlert?: Alert;
		/**
		 * Which half of the dialog to open on. "Escalate" means a brand new
		 * case, "Merge" means folding the alerts into one that already
		 * exists — same dialog, different starting point.
		 */
		defaultMode?: MergeMode;
		onClose: () => void;
		onConfirm: (payload: MergeAlertPayload) => void;
	};

	let {
		open = $bindable(),
		selectedAlertIds,
		selectedAlert,
		defaultMode = 'new',
		onClose,
		onConfirm
	}: Props = $props();

	const caseTemplates = getContext<CaseTemplatesContext>(CASE_TEMPLATES_CTX);

	let mergeMode = $state<MergeMode>('new');
	let targetCaseId = $state<number | null>(null);
	let targetCaseName = $state('');
	let caseTitle = $state('');
	let caseTemplateId = $state('');
	let note = $state('');
	let tags = $state('');
	let importAsEvent = $state(true);

	// --- Async case picker state ---
	const PAGE_SIZE = 30;
	const DEBOUNCE_MS = 250;

	let pickerCases = $state<Case[]>([]);
	let pickerLoading = $state(false);
	let pickerLoadingMore = $state(false);
	let pickerNextPage = $state<number | null>(null);
	let pickerSearch = $state('');
	let pickerError = $state<string | null>(null);
	let pickerListEl = $state<HTMLDivElement | null>(null);
	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	let reqSeq = 0;

	const fetchCasePage = async (
		search: string,
		page: number
	): Promise<{ data: Case[]; nextPage: number | null }> => {
		const res = await CaseService.list({
			page,
			per_page: PAGE_SIZE,
			quick_search: search.trim() === '' ? undefined : search.trim(),
			order_by: 'open_date',
			sort_dir: 'desc'
		});
		if (!res.ok || !res.data) throw new Error(res.error?.message ?? 'Failed to load cases');
		const p = res.data as Paginated<Case>;
		return { data: p.data ?? [], nextPage: p.next_page ?? null };
	};

	const loadPickerInitial = async (search: string) => {
		const seq = ++reqSeq;
		pickerLoading = true;
		pickerError = null;
		try {
			const { data, nextPage } = await fetchCasePage(search, 1);
			if (seq !== reqSeq) return;
			pickerCases = data;
			pickerNextPage = nextPage;
		} catch (e) {
			if (seq !== reqSeq) return;
			pickerError = e instanceof Error ? e.message : String(e);
		} finally {
			if (seq === reqSeq) pickerLoading = false;
		}
	};

	const loadPickerMore = async () => {
		if (pickerLoading || pickerLoadingMore || pickerNextPage === null) return;
		const seq = ++reqSeq;
		pickerLoadingMore = true;
		try {
			const { data, nextPage } = await fetchCasePage(pickerSearch, pickerNextPage);
			if (seq !== reqSeq) return;
			const seen = new Set(pickerCases.map((c) => c.case_id));
			pickerCases = [...pickerCases, ...data.filter((c) => !seen.has(c.case_id))];
			pickerNextPage = nextPage;
		} catch {
			// silently ignore load-more errors
		} finally {
			if (seq === reqSeq) pickerLoadingMore = false;
		}
	};

	const onPickerSearch = (value: string) => {
		pickerSearch = value;
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => void loadPickerInitial(value), DEBOUNCE_MS);
	};

	const onPickerScroll = () => {
		if (!pickerListEl || pickerNextPage === null || pickerLoading || pickerLoadingMore) return;
		if (pickerListEl.scrollTop + pickerListEl.clientHeight + 80 >= pickerListEl.scrollHeight) {
			void loadPickerMore();
		}
	};

	// Reload picker when switching to existing mode
	$effect(() => {
		if (mergeMode === 'existing') {
			pickerSearch = '';
			pickerCases = [];
			pickerNextPage = null;
			pickerError = null;
			void loadPickerInitial('');
		}
	});

	// --- IOCs / assets to import ---
	type ImportKind = 'iocs' | 'assets';

	let importGroups = $state<Record<ImportKind, ImportGroup[]>>({ iocs: [], assets: [] });
	let selectedImportKeys = $state<Record<ImportKind, string[]>>({ iocs: [], assets: [] });
	let importLoading = $state(false);
	let importError = $state<string | null>(null);
	let importSeq = 0;

	// The queue rows and `selectedAlert` may be summaries without their
	// IOCs/assets, so the full alerts are always fetched.
	const loadImportables = async (alertIds: number[]) => {
		const seq = ++importSeq;
		importLoading = true;
		importError = null;
		importGroups = { iocs: [], assets: [] };
		selectedImportKeys = { iocs: [], assets: [] };
		try {
			const responses = await Promise.all(alertIds.map((id) => AlertService.get(id)));
			if (seq !== importSeq) return;
			const loaded = responses
				.map((res) => (res.ok ? res.data : null))
				.filter((data): data is Alert => typeof data === 'object' && data !== null);
			if (loaded.length !== responses.length) {
				const failed = responses.find((res) => !res.ok);
				throw new Error(failed?.error?.message ?? 'Failed to load alerts');
			}
			const groups = groupImportableObservables(loaded);
			importGroups = groups;
			selectedImportKeys = {
				iocs: groups.iocs.map((g) => g.key),
				assets: groups.assets.map((g) => g.key)
			};
		} catch (e) {
			if (seq !== importSeq) return;
			importError = e instanceof Error ? e.message : String(e);
		} finally {
			if (seq === importSeq) importLoading = false;
		}
	};

	const toggleImport = (kind: ImportKind, key: string, checked: boolean) => {
		const current = selectedImportKeys[kind];
		selectedImportKeys[kind] = checked ? [...current, key] : current.filter((k) => k !== key);
	};

	const setAllImports = (kind: ImportKind, checked: boolean) => {
		selectedImportKeys[kind] = checked ? importGroups[kind].map((g) => g.key) : [];
	};

	// `undefined` when the alerts could not be loaded: the merge helper then
	// falls back to importing everything, as before the picker existed.
	const getImportList = (kind: ImportKind): string[] | undefined => {
		if (importError) return undefined;
		const selected = new Set(selectedImportKeys[kind]);
		return importGroups[kind].filter((g) => selected.has(g.key)).flatMap((g) => g.uuids);
	};

	// ---

	const mergeOptions = $derived.by<SegmentedSelectOption[]>(() => [
		{ value: 'new', label: 'Merge into a new case' },
		{ value: 'existing', label: 'Merge into existing case' }
	]);

	const caseTemplateOptions = $derived.by<SelectOption[]>(() =>
		caseTemplates.caseTemplates.map((t) => ({
			value: String(t.id),
			label: t.display_name || t.name
		}))
	);

	const getTitle = () =>
		mergeMode === 'existing'
			? 'Merge multiple alerts in an existing case'
			: 'Merge multiple alerts in a new case';

	const resetForm = () => {
		mergeMode = defaultMode;
		targetCaseId = null;
		targetCaseName = '';
		caseTitle = selectedAlert
			? `[ALERT] ${selectedAlert.alert_title}`
			: `[ALERT] Escalation of ${selectedAlertIds.length} alert${selectedAlertIds.length > 1 ? 's' : ''}`;
		caseTemplateId = '';
		note = '';
		tags = selectedAlert ? selectedAlert.alert_tags : '';
		importAsEvent = true;
	};

	$effect(() => {
		if (open) {
			resetForm();
			// Templates are also created from Settings, which writes through
			// its own service rather than this context, and the app layout
			// only loads them once at mount. Refresh on open so anything
			// added since is picked up without a full page reload.
			void caseTemplates.refresh();
			void loadImportables(selectedAlertIds);
		}
	});
</script>

{#snippet importList(kind: ImportKind, title: string)}
	{@const groups = importGroups[kind]}
	{@const selected = selectedImportKeys[kind]}
	<div class="flex flex-col gap-1.5">
		<div class="flex items-center justify-between gap-2">
			<span class="text-sm text-muted-foreground">
				{title} ({selected.length}/{groups.length})
			</span>
			{#if groups.length > 0}
				<div class="flex gap-1">
					<Button variant="ghost" size="xs" onclick={() => setAllImports(kind, true)}>All</Button>
					<Button variant="ghost" size="xs" onclick={() => setAllImports(kind, false)}>None</Button>
				</div>
			{/if}
		</div>

		<div class="max-h-48 overflow-auto rounded-md border bg-background">
			{#if groups.length === 0}
				<div class="p-3 text-sm text-muted-foreground">
					No {title} on the selected alert{selectedAlertIds.length > 1 ? 's' : ''}.
				</div>
			{:else}
				<ul class="py-1">
					{#each groups as group, index (group.key)}
						{@const id = `merge-import-${kind}-${index}`}
						<li class="flex items-center gap-2 px-3 py-1.5">
							<Checkbox
								{id}
								checked={selected.includes(group.key)}
								onCheckedChange={(checked) => toggleImport(kind, group.key, checked === true)}
							/>
							<Label for={id} class="flex min-w-0 flex-1 flex-col text-sm font-normal">
								<span class="truncate font-mono" title={group.label}>{group.label}</span>
								{#if group.detail || group.uuids.length > 1}
									<span class="truncate text-xs text-muted-foreground">
										{group.detail}{#if group.uuids.length > 1}{group.detail ? ' · ' : ''}on {group
												.uuids.length} alerts{/if}
									</span>
								{/if}
							</Label>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
{/snippet}

<Dialog.Root
	bind:open
	onOpenChange={(nextOpen) => {
		if (!nextOpen) {
			onClose();
		}
	}}
>
	<Dialog.Content class="flex max-h-[80vh] max-w-[980px] flex-col p-0">
		<Dialog.Header class="border-b px-6 py-4">
			<Dialog.Title class="text-base font-medium">{getTitle()}</Dialog.Title>
		</Dialog.Header>

		<div class="flex-1 overflow-auto px-6 py-5">
			<div class="space-y-5">
				<div class="space-y-2">
					<div class="flex flex-col gap-3">
						<Label class="text-sm font-medium">Merge options</Label>

						<SegmentedSelect
							options={mergeOptions}
							value={mergeMode}
							onChange={(value) => (mergeMode = value as MergeMode)}
						/>
					</div>
				</div>

				{#if mergeMode === 'new'}
					<div class="space-y-2">
						<p class="text-sm text-muted-foreground">
							These alerts will be merged into a new case. Set the case title and select the IOCs
							and Assets to escalate into the case.
						</p>
					</div>

					<div class="space-y-2">
						<Label for="merge-alert-case-title" class="block text-sm font-medium">
							New case title *
						</Label>

						<Input id="merge-alert-case-title" bind:value={caseTitle} />
					</div>

					<div class="space-y-2">
						<Label class="block text-sm font-medium">Select case template</Label>

						<SearchSelect
							value={caseTemplateId}
							options={caseTemplateOptions}
							placeholder="Select a template"
							searchPlaceholder="Search template..."
							onChange={(value) => (caseTemplateId = value as string)}
						/>
					</div>
				{:else}
					<div class="space-y-2">
						<Label class="block text-sm font-medium">Existing case *</Label>

						<!-- Async case picker: searches server-side via quick_search -->
						<div class="flex flex-col gap-1.5">
							<div class="relative">
								<SearchIcon
									size="14"
									class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50"
								/>
								<Input
									type="text"
									placeholder="Search cases by name or ID..."
									value={pickerSearch}
									oninput={(e) => onPickerSearch((e.target as HTMLInputElement).value)}
									class="h-9 pl-8 text-sm"
								/>
							</div>

							<div
								bind:this={pickerListEl}
								onscroll={onPickerScroll}
								class="max-h-64 overflow-auto rounded-md border bg-background"
							>
								{#if pickerLoading && pickerCases.length === 0}
									<div class="p-3 text-sm text-muted-foreground">Loading cases…</div>
								{:else if pickerError}
									<div class="p-3 text-sm text-destructive">{pickerError}</div>
								{:else if pickerCases.length === 0}
									<div class="p-3 text-sm text-muted-foreground">
										{pickerSearch.trim() ? 'No matching cases.' : 'No cases available.'}
									</div>
								{:else}
									<ul class="py-1">
										{#each pickerCases as c (c.case_id)}
											<li>
												<button
													type="button"
													class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted {targetCaseId ===
													c.case_id
														? 'bg-muted'
														: ''}"
													onclick={() => {
														targetCaseId = c.case_id;
														targetCaseName = c.case_name ?? '';
													}}
												>
													<span class="flex min-w-0 flex-col">
														<span class="truncate font-medium">{c.case_name}</span>
														<span class="text-xs text-muted-foreground">
															#{c.case_id}{#if c.case_customer?.customer_name}&nbsp;·&nbsp;{c
																	.case_customer.customer_name}{/if}
														</span>
													</span>
													{#if targetCaseId === c.case_id}
														<CheckIcon size="14" class="shrink-0 text-primary" />
													{/if}
												</button>
											</li>
										{/each}
									</ul>
									{#if pickerLoadingMore}
										<div class="p-2 text-center text-xs text-muted-foreground">Loading more…</div>
									{:else if pickerNextPage === null && pickerCases.length > 0}
										<div class="p-2 text-center text-xs text-muted-foreground opacity-50">
											End of results
										</div>
									{/if}
								{/if}
							</div>

							{#if targetCaseId !== null}
								<p class="text-xs text-muted-foreground">
									Selected: <span class="font-medium text-foreground">{targetCaseName}</span>
									(#{targetCaseId})
								</p>
							{/if}
						</div>
					</div>
				{/if}

				<div class="space-y-2">
					<Label class="block text-sm font-medium">IOCs and assets to import</Label>

					{#if importLoading}
						<p class="text-sm text-muted-foreground">Loading IOCs and assets…</p>
					{:else if importError}
						<p class="text-sm text-destructive">
							{importError} — every IOC and asset of the alerts will be imported.
						</p>
					{:else}
						<div class="grid gap-4 md:grid-cols-2">
							{@render importList('iocs', 'IOCs')}
							{@render importList('assets', 'Assets')}
						</div>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="merge-alert-note" class="block text-sm font-medium">Escalation note</Label>
					<textarea
						id="merge-alert-note"
						class="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-0 placeholder:text-muted-foreground focus:border-ring"
						bind:value={note}
					></textarea>
				</div>

				<div class="space-y-2">
					<Label for="merge-alert-tags" class="block text-sm font-medium">Case tags</Label>

					<TagInput bind:tags outputFormat="string" placeholder="Add tags..." maxTags={20} />
				</div>

				<div class="flex items-center gap-2">
					<Checkbox
						id="merge-alert-add-event"
						checked={importAsEvent}
						onCheckedChange={(checked) => (importAsEvent = checked === true)}
					/>
					<Label for="merge-alert-add-event" class="text-sm font-normal">
						Add alert as event in the timeline
					</Label>
				</div>
			</div>
		</div>

		<div class="flex items-center justify-end gap-2 border-t px-6 py-4">
			<Button
				variant="outline"
				onclick={() => {
					open = false;
					onClose();
				}}
			>
				Cancel
			</Button>

			<Button
				onclick={() =>
					onConfirm({
						target_case_id: mergeMode === 'existing' ? targetCaseId : null,
						case_title: caseTitle,
						case_template_id: mergeMode === 'new' && caseTemplateId ? Number(caseTemplateId) : null,
						note: note,
						case_tags: tags,
						import_as_event: importAsEvent,
						iocs_import_list: getImportList('iocs'),
						assets_import_list: getImportList('assets')
					})}
				disabled={importLoading ||
					(mergeMode === 'new' && caseTitle.trim().length === 0) ||
					(mergeMode === 'existing' && targetCaseId === null)}
			>
				Merge
			</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
