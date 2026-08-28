<!--
  Modules admin page — Svelte port of the legacy /manage/modules screen.

  Legacy parity:
    • two stacked tables — Modules and Registered Hooks;
    • module rows show id, name, pipeline?, module + interface versions,
      date added, who added it, active status (with a "misconfigured"
      flavour when mandatory params are missing);
    • per-row dropdown: View / configure → opens a config Dialog with
      every parameter (sectioned), import/export config, enable/disable,
      remove;
    • add-module Dialog at the top right takes a pip package name.

  Conventions copied from the rest of the app:
    • shadcn-style Cards with sticky Card.Header pager + sticky <thead>;
    • single global ConfirmationDialog reused for every destructive
      action (remove + disable-while-misconfigured warnings);
    • toast for success / failure feedback.

  Access scoping (server_administrator) is enforced on the backend; the
  page assumes the user is already inside /settings, which is itself
  admin-gated.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		BadgeCheckIcon,
		BadgeXIcon,
		DownloadIcon,
		MoreHorizontalIcon,
		PackagePlusIcon,
		PowerIcon,
		PowerOffIcon,
		RefreshCwIcon,
		ServerIcon,
		SettingsIcon,
		Trash2Icon,
		TriangleAlertIcon,
		UploadIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Switch } from '$lib/components/ui/switch';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toast } from '$lib/components/ui/toast';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import JsonEditor from '$lib/components/common/editors/JsonEditor.svelte';
	import { mediumDateTimeFormatter } from '$lib/utils/time-formatter';
	import {
		ModulesService,
		type ModuleDetail,
		type ModuleHook,
		type ModuleListEntry,
		type ModuleParameter
	} from '$lib/services/modules.service';

	const PAGE_SIZE = 25;

	type ListState<T> = {
		items: T[];
		total: number;
		nextPage: number | null;
		loading: boolean;
		loadingMore: boolean;
	};

	const emptyListState = <T,>(): ListState<T> => ({
		items: [],
		total: 0,
		nextPage: 1,
		loading: false,
		loadingMore: false
	});

	let modulesList = $state<ListState<ModuleListEntry>>(emptyListState());
	let hooksList = $state<ListState<ModuleHook>>(emptyListState());

	// Add-module modal
	let addOpen = $state(false);
	let addModuleName = $state('');
	let addBusy = $state(false);
	let addError = $state<string | null>(null);

	// Config modal
	let configOpen = $state(false);
	let configModule = $state<ModuleDetail | null>(null);
	let configLoading = $state(false);
	// `paramDrafts[param_name]` holds the in-progress edit value for each
	// parameter so users can type freely; nothing hits the server until
	// the row's Save button is clicked.
	let paramDrafts = $state<Record<string, unknown>>({});
	// Per-param JSON validity. Populated by the JsonEditor's onInput
	// callback for `textfield_json` parameters and used to disable Save
	// while the buffer is malformed — every other type defaults to valid.
	let paramJsonValid = $state<Record<string, boolean>>({});
	let savingParam = $state<string | null>(null);

	// Confirmation modal — shared instance, switched via these handles.
	let confirmOpen = $state(false);
	let confirmTitle = $state('');
	let confirmMessage = $state('');
	let confirmAction = $state<() => Promise<void> | void>(() => {});

	const formatDate = (iso: string | null | undefined) => {
		if (!iso) return '—';
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? '—' : mediumDateTimeFormatter(d);
	};

	const showError = (msg: string, fallback = 'Operation failed') => {
		toast({ title: msg || fallback, variant: 'destructive' });
	};

	const showSuccess = (msg: string) => {
		toast({ title: msg, variant: 'success' });
	};

	const showWarning = (msg: string) => {
		toast({ title: msg, variant: 'warning' });
	};

	// Reset + first page. Used by mount + the Refresh button.
	const loadModules = async () => {
		modulesList = { ...emptyListState<ModuleListEntry>(), loading: true };
		try {
			const res = await ModulesService.list({ page: 1, per_page: PAGE_SIZE });
			if (res.ok && res.data && typeof res.data !== 'string') {
				const env = res.data;
				modulesList = {
					items: env.data,
					total: env.total,
					nextPage: env.next_page,
					loading: false,
					loadingMore: false
				};
			} else {
				showError(res.error?.message ?? 'Failed to load modules');
				modulesList = { ...modulesList, loading: false };
			}
		} catch (e) {
			showError((e as Error).message);
			modulesList = { ...modulesList, loading: false };
		}
	};

	const loadMoreModules = async () => {
		if (modulesList.loading || modulesList.loadingMore || modulesList.nextPage == null) return;
		modulesList = { ...modulesList, loadingMore: true };
		const page = modulesList.nextPage as number;
		try {
			const res = await ModulesService.list({ page, per_page: PAGE_SIZE });
			if (res.ok && res.data && typeof res.data !== 'string') {
				const env = res.data;
				modulesList = {
					items: [...modulesList.items, ...env.data],
					total: env.total,
					nextPage: env.next_page,
					loading: false,
					loadingMore: false
				};
			} else {
				modulesList = { ...modulesList, loadingMore: false };
			}
		} catch {
			modulesList = { ...modulesList, loadingMore: false };
		}
	};

	const loadHooks = async () => {
		hooksList = { ...emptyListState<ModuleHook>(), loading: true };
		try {
			const res = await ModulesService.listHooks({ page: 1, per_page: PAGE_SIZE });
			if (res.ok && res.data && typeof res.data !== 'string') {
				const env = res.data;
				hooksList = {
					items: env.data,
					total: env.total,
					nextPage: env.next_page,
					loading: false,
					loadingMore: false
				};
			} else {
				showError(res.error?.message ?? 'Failed to load hooks');
				hooksList = { ...hooksList, loading: false };
			}
		} catch (e) {
			showError((e as Error).message);
			hooksList = { ...hooksList, loading: false };
		}
	};

	const loadMoreHooks = async () => {
		if (hooksList.loading || hooksList.loadingMore || hooksList.nextPage == null) return;
		hooksList = { ...hooksList, loadingMore: true };
		const page = hooksList.nextPage as number;
		try {
			const res = await ModulesService.listHooks({ page, per_page: PAGE_SIZE });
			if (res.ok && res.data && typeof res.data !== 'string') {
				const env = res.data;
				hooksList = {
					items: [...hooksList.items, ...env.data],
					total: env.total,
					nextPage: env.next_page,
					loading: false,
					loadingMore: false
				};
			} else {
				hooksList = { ...hooksList, loadingMore: false };
			}
		} catch {
			hooksList = { ...hooksList, loadingMore: false };
		}
	};

	const refresh = async () => {
		await Promise.all([loadModules(), loadHooks()]);
	};

	onMount(refresh);

	// IntersectionObserver-backed sentinels — same pattern as the
	// dashboard "Activities" / "Case activities" cards. Each section
	// owns its sentinel and only triggers `loadMore` when it scrolls
	// into view at the bottom of the section.
	let modulesSentinel = $state<HTMLDivElement | null>(null);
	$effect(() => {
		if (!modulesSentinel) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) void loadMoreModules();
			},
			{ rootMargin: '120px' }
		);
		observer.observe(modulesSentinel);
		return () => observer.disconnect();
	});

	let hooksSentinel = $state<HTMLDivElement | null>(null);
	$effect(() => {
		if (!hooksSentinel) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) void loadMoreHooks();
			},
			{ rootMargin: '120px' }
		);
		observer.observe(hooksSentinel);
		return () => observer.disconnect();
	});

	// Add-module flow ---------------------------------------------------
	const openAdd = () => {
		addModuleName = '';
		addError = null;
		addOpen = true;
	};

	const submitAdd = async () => {
		const name = addModuleName.trim();
		if (!name) {
			addError = 'Module name is required';
			return;
		}
		addBusy = true;
		addError = null;
		try {
			const res = await ModulesService.add(name);
			if (res.ok) {
				showSuccess(`Module "${name}" registered`);
				addOpen = false;
				await refresh();
			} else {
				const data = res.data as { message?: string; data?: unknown } | null;
				addError = data?.message ?? res.error?.message ?? 'Unable to register module';
			}
		} finally {
			addBusy = false;
		}
	};

	// Config modal flow -------------------------------------------------
	const openConfig = async (moduleId: number) => {
		configOpen = true;
		configLoading = true;
		configModule = null;
		paramDrafts = {};
		paramJsonValid = {};
		try {
			const res = await ModulesService.get(moduleId);
			if (res.ok && res.data && typeof res.data !== 'string') {
				configModule = res.data as ModuleDetail;
				paramDrafts = Object.fromEntries(
					(configModule.module_config ?? []).map((p) => [p.param_name, p.value ?? p.default ?? ''])
				);
				paramJsonValid = Object.fromEntries(
					(configModule.module_config ?? [])
						.filter((p) => p.type === 'textfield_json')
						.map((p) => [p.param_name, true])
				);
			} else {
				showError(res.error?.message ?? 'Failed to load module');
				configOpen = false;
			}
		} finally {
			configLoading = false;
		}
	};

	// Group parameters by their `section` so the modal can render
	// labelled sub-sections — defaulting to "Main" matches the legacy
	// behaviour (any param without a section lands in the same bucket).
	const groupedParams = $derived.by<Record<string, ModuleParameter[]>>(() => {
		if (!configModule) return {};
		const groups: Record<string, ModuleParameter[]> = {};
		for (const p of configModule.module_config ?? []) {
			const section = p.section ?? 'Main';
			if (!groups[section]) groups[section] = [];
			groups[section].push(p);
		}
		return groups;
	});

	const saveParameter = async (param: ModuleParameter) => {
		if (!configModule) return;
		const value = paramDrafts[param.param_name];
		savingParam = param.param_name;
		try {
			const res = await ModulesService.setParameter(configModule.id, param.param_name, value);
			if (res.ok && res.data && typeof res.data !== 'string') {
				configModule = res.data as ModuleDetail;
				paramDrafts = {
					...paramDrafts,
					[param.param_name]:
						(configModule.module_config ?? []).find((p) => p.param_name === param.param_name)
							?.value ?? value
				};
				showSuccess(`Saved ${param.param_human_name ?? param.param_name}`);
				// Refresh the outer list so misconfigured → configured
				// status badge flips without a full reload.
				void loadModules();
			} else {
				const data = res.data as { message?: string } | null;
				showError(data?.message ?? res.error?.message ?? 'Unable to save parameter');
			}
		} finally {
			savingParam = null;
		}
	};

	const exportConfig = async () => {
		if (!configModule) return;
		const res = await ModulesService.exportConfig(configModule.id);
		if (!res.ok || !res.data || typeof res.data === 'string') {
			showError(res.error?.message ?? 'Unable to export configuration');
			return;
		}
		const payload = JSON.stringify(res.data, null, 2);
		const blob = new Blob([payload], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${configModule.module_name}.config.json`;
		a.click();
		URL.revokeObjectURL(url);
	};

	// Import-config file picker. We render a hidden <input type="file">
	// and forward its `change` to the import endpoint, accepting either
	// the export format (`{module_configuration: [...]}`) or a bare list.
	let importInput: HTMLInputElement | null = $state(null);

	const triggerImport = () => {
		importInput?.click();
	};

	const handleImportFile = async (event: Event) => {
		const target = event.currentTarget as HTMLInputElement;
		const file = target.files?.[0];
		target.value = '';
		if (!file || !configModule) return;

		try {
			const text = await file.text();
			let parsed: unknown;
			try {
				parsed = JSON.parse(text);
			} catch {
				showError('File is not valid JSON');
				return;
			}

			let configuration: ModuleParameter[] | null = null;
			if (Array.isArray(parsed)) {
				configuration = parsed as ModuleParameter[];
			} else if (
				parsed &&
				typeof parsed === 'object' &&
				Array.isArray((parsed as { module_configuration?: unknown }).module_configuration)
			) {
				configuration = (parsed as { module_configuration: ModuleParameter[] })
					.module_configuration;
			}

			if (!configuration) {
				showError('Unrecognised configuration format');
				return;
			}

			const res = await ModulesService.importConfig(configModule.id, configuration);
			if (res.ok && res.data && typeof res.data !== 'string') {
				const out = res.data as { skipped: string[]; module: ModuleDetail };
				configModule = out.module;
				paramDrafts = Object.fromEntries(
					(out.module.module_config ?? []).map((p) => [p.param_name, p.value ?? p.default ?? ''])
				);
				paramJsonValid = Object.fromEntries(
					(out.module.module_config ?? [])
						.filter((p) => p.type === 'textfield_json')
						.map((p) => [p.param_name, true])
				);
				if (out.skipped.length === 0) {
					showSuccess('Configuration imported');
				} else {
					showWarning(`Imported with ${out.skipped.length} skipped: ${out.skipped.join(', ')}`);
				}
				void loadModules();
			} else {
				const data = res.data as { message?: string } | null;
				showError(data?.message ?? res.error?.message ?? 'Import failed');
			}
		} catch (e) {
			showError((e as Error).message);
		}
	};

	// Lifecycle actions -------------------------------------------------
	const toggleActive = async (mod: ModuleListEntry) => {
		const action = mod.is_active ? ModulesService.disable : ModulesService.enable;
		const res = await action(mod.id);
		if (res.ok) {
			showSuccess(`Module ${mod.is_active ? 'disabled' : 'enabled'}`);
			await loadModules();
			if (configModule?.id === mod.id) {
				// Keep the modal payload in sync so the "Active" badge
				// inside it doesn't lie.
				const detail = await ModulesService.get(mod.id);
				if (detail.ok && detail.data && typeof detail.data !== 'string') {
					configModule = detail.data as ModuleDetail;
				}
			}
		} else {
			const data = res.data as { message?: string } | null;
			showError(data?.message ?? res.error?.message ?? 'Operation failed');
		}
	};

	const removeModule = (mod: ModuleListEntry) => {
		confirmTitle = `Remove module ${mod.module_human_name}?`;
		confirmMessage =
			'This will detach all its hooks and delete the module record. The python package itself will not be uninstalled.';
		confirmAction = async () => {
			const res = await ModulesService.remove(mod.id);
			if (res.ok) {
				showSuccess('Module removed');
				if (configModule?.id === mod.id) {
					configOpen = false;
				}
				await refresh();
			} else {
				const data = res.data as { message?: string } | null;
				showError(data?.message ?? res.error?.message ?? 'Unable to remove module');
			}
		};
		confirmOpen = true;
	};

	const runConfirm = async () => {
		await confirmAction();
	};
</script>

<svelte:head>
	<title>Modules</title>
</svelte:head>

<div class="flex h-full w-full flex-col overflow-hidden">
	<!--
	  Page header. Tight — borrows the layout of other admin sub-pages
	  (header bar + content below, no card around the header itself).
	-->
	<header class="flex items-center justify-between gap-3 border-b px-5 py-3">
		<div class="flex items-center gap-2.5">
			<ServerIcon size={18} class="text-muted-foreground" />
			<div class="leading-tight">
				<h1 class="text-sm font-semibold">Modules</h1>
				<p class="text-2xs text-muted-foreground">
					Install, configure and manage DFIR-IRIS modules and their hooks.
				</p>
			</div>
		</div>

		<div class="flex items-center gap-1.5">
			<Button
				variant="outline"
				size="sm"
				class="h-7"
				onclick={refresh}
				disabled={modulesList.loading || hooksList.loading}
			>
				<RefreshCwIcon
					size={12}
					class={`mr-1 ${modulesList.loading || hooksList.loading ? 'animate-spin' : ''}`}
				/>
				Refresh
			</Button>
			<Button size="sm" class="h-7" onclick={openAdd}>
				<PackagePlusIcon size={12} class="mr-1" />
				Add module
			</Button>
		</div>
	</header>

	<!--
	  Two independently-scrolling sections stacked vertically. Each owns
	  its own `overflow-y-auto` viewport so the user can page through
	  Modules without losing their position in Registered hooks, and
	  vice-versa. Sticky section headers + IntersectionObserver
	  sentinels anchor to each section's own scroll container.

	  Heights: Modules slightly taller than Hooks by default
	  (basis-3/5 / basis-2/5) — modules is the primary surface and
	  carries the action menu; hooks is a reference list and tends to
	  be shorter per row.
	-->
	<div class="flex flex-1 flex-col gap-3 overflow-hidden p-4">
		<!-- Modules -->
		<section class="flex min-h-0 flex-1 basis-3/5 flex-col overflow-hidden rounded-md border">
			<div class="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
				<div class="flex items-baseline gap-2">
					<h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Modules
					</h2>
					<span class="text-2xs tabular-nums text-muted-foreground">
						{modulesList.items.length} / {modulesList.total} installed
					</span>
				</div>
			</div>

			<div class="flex-1 overflow-y-auto">
				{#if modulesList.loading && modulesList.items.length === 0}
					<div class="space-y-1 p-3">
						{#each Array(4) as _}
							<Skeleton class="h-7 w-full" />
						{/each}
					</div>
				{:else if modulesList.items.length === 0}
					<p class="px-3 py-4 text-center text-xs text-muted-foreground">
						No modules registered yet. Click <span class="font-medium">Add module</span> to install one
						by its pip package name.
					</p>
				{:else}
					<table class="w-full text-xs">
						<thead
							class="border-b bg-muted/40 text-left text-2xs uppercase tracking-wide text-muted-foreground"
						>
							<tr>
								<th class="w-12 px-3 py-1.5 font-medium">ID</th>
								<th class="px-3 py-1.5 font-medium">Module</th>
								<th class="w-20 px-3 py-1.5 font-medium">Pipeline</th>
								<th class="w-20 px-3 py-1.5 font-medium">Version</th>
								<th class="w-24 px-3 py-1.5 font-medium">Interface</th>
								<th class="w-40 px-3 py-1.5 font-medium">Date added</th>
								<th class="w-32 px-3 py-1.5 font-medium">Added by</th>
								<th class="w-32 px-3 py-1.5 font-medium">Status</th>
								<th class="w-10 px-2 py-1.5 font-medium"></th>
							</tr>
						</thead>
						<tbody>
							{#each modulesList.items as mod (mod.id)}
								<tr class="border-b transition-colors last:border-0 hover:bg-muted/30">
									<td class="px-3 py-1.5 font-mono text-2xs text-muted-foreground">{mod.id}</td>
									<td class="px-3 py-1.5">
										<button
											type="button"
											class="text-left font-medium text-primary hover:underline"
											onclick={() => openConfig(mod.id)}
										>
											{mod.module_human_name}
										</button>
									</td>
									<td class="px-3 py-1.5 text-muted-foreground">
										{mod.has_pipeline ? 'Yes' : '—'}
									</td>
									<td class="px-3 py-1.5 tabular-nums text-muted-foreground"
										>{mod.module_version}</td
									>
									<td class="px-3 py-1.5 tabular-nums text-muted-foreground"
										>{mod.interface_version}</td
									>
									<td class="whitespace-nowrap px-3 py-1.5 tabular-nums text-muted-foreground">
										{formatDate(mod.date_added)}
									</td>
									<td class="px-3 py-1.5 text-muted-foreground">{mod.added_by}</td>
									<td class="px-3 py-1.5">
										{#if !mod.configured}
											<span
												class="inline-flex items-center gap-1 rounded-sm border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300"
												title="Mandatory parameters missing — module auto-disabled"
											>
												<TriangleAlertIcon size={10} />
												Misconfigured
											</span>
										{:else if mod.is_active}
											<span
												class="inline-flex items-center gap-1 rounded-sm border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300"
											>
												<BadgeCheckIcon size={10} />
												Active
											</span>
										{:else}
											<span
												class="inline-flex items-center gap-1 rounded-sm border border-border bg-muted/50 px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground"
											>
												<BadgeXIcon size={10} />
												Disabled
											</span>
										{/if}
									</td>
									<td class="px-2 py-1.5 text-right">
										<DropdownMenu.Root>
											<DropdownMenu.Trigger>
												<Button variant="ghost" size="sm" class="h-6 w-6 p-0">
													<MoreHorizontalIcon size={12} />
												</Button>
											</DropdownMenu.Trigger>
											<DropdownMenu.Content align="end" class="min-w-[160px]">
												<DropdownMenu.Item onclick={() => openConfig(mod.id)}>
													<SettingsIcon size={12} class="mr-2" />
													Configure
												</DropdownMenu.Item>
												<DropdownMenu.Item
													disabled={!mod.configured && !mod.is_active}
													onclick={() => toggleActive(mod)}
												>
													{#if mod.is_active}
														<PowerOffIcon size={12} class="mr-2" />
														Disable
													{:else}
														<PowerIcon size={12} class="mr-2" />
														Enable
													{/if}
												</DropdownMenu.Item>
												<DropdownMenu.Separator />
												<DropdownMenu.Item
													class="text-destructive focus:text-destructive"
													onclick={() => removeModule(mod)}
												>
													<Trash2Icon size={12} class="mr-2" />
													Remove
												</DropdownMenu.Item>
											</DropdownMenu.Content>
										</DropdownMenu.Root>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>

					<!--
				  Infinite-scroll sentinel for the modules table. Sits at
				  the bottom of the list; when it scrolls into view we
				  request the next page. Renders a tiny spinner row while
				  loading and disappears entirely once everything is
				  loaded so the observer stops firing.
				-->
					{#if modulesList.nextPage != null}
						<div
							bind:this={modulesSentinel}
							class="flex items-center justify-center gap-2 border-t px-3 py-2 text-2xs text-muted-foreground"
						>
							{#if modulesList.loadingMore}
								<RefreshCwIcon size={11} class="animate-spin" />
								Loading more…
							{:else}
								<span class="opacity-0">Loading more…</span>
							{/if}
						</div>
					{:else if modulesList.total > PAGE_SIZE}
						<div class="border-t px-3 py-2 text-center text-2xs text-muted-foreground">
							End of list — {modulesList.total} modules
						</div>
					{/if}
				{/if}
			</div>
		</section>

		<!-- Hooks -->
		<section class="flex min-h-0 flex-1 basis-2/5 flex-col overflow-hidden rounded-md border">
			<div class="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
				<div class="flex items-baseline gap-2">
					<h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Registered hooks
					</h2>
					<span class="text-2xs tabular-nums text-muted-foreground">
						{hooksList.items.length} / {hooksList.total} bindings
					</span>
				</div>
			</div>

			<div class="flex-1 overflow-y-auto">
				{#if hooksList.loading && hooksList.items.length === 0}
					<div class="space-y-1 p-3">
						{#each Array(3) as _}
							<Skeleton class="h-7 w-full" />
						{/each}
					</div>
				{:else if hooksList.items.length === 0}
					<p class="px-3 py-4 text-center text-xs text-muted-foreground">
						No hooks registered. Configure a module to populate this table.
					</p>
				{:else}
					<table class="w-full text-xs">
						<thead
							class="border-b bg-muted/40 text-left text-2xs uppercase tracking-wide text-muted-foreground"
						>
							<tr>
								<th class="w-12 px-3 py-1.5 font-medium">ID</th>
								<th class="w-44 px-3 py-1.5 font-medium">Registrant module</th>
								<th class="w-56 px-3 py-1.5 font-medium">Hook</th>
								<th class="px-3 py-1.5 font-medium">Description</th>
								<th class="w-28 px-3 py-1.5 font-medium">Manual</th>
								<th class="w-20 px-3 py-1.5 font-medium">Active</th>
							</tr>
						</thead>
						<tbody>
							{#each hooksList.items as hook (hook.id)}
								<tr class="border-b transition-colors last:border-0 hover:bg-muted/30">
									<td class="px-3 py-1.5 font-mono text-2xs text-muted-foreground">{hook.id}</td>
									<td class="px-3 py-1.5 text-muted-foreground">{hook.module_name}</td>
									<td class="px-3 py-1.5 font-mono text-2xs">{hook.hook_name}</td>
									<td class="px-3 py-1.5 text-muted-foreground">
										{hook.hook_description ?? '—'}
									</td>
									<td class="px-3 py-1.5 text-muted-foreground">
										{hook.is_manual_hook ? 'Yes' : 'No'}
									</td>
									<td class="px-3 py-1.5 text-muted-foreground">
										{hook.is_active ? 'Yes' : 'No'}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>

					{#if hooksList.nextPage != null}
						<div
							bind:this={hooksSentinel}
							class="flex items-center justify-center gap-2 border-t px-3 py-2 text-2xs text-muted-foreground"
						>
							{#if hooksList.loadingMore}
								<RefreshCwIcon size={11} class="animate-spin" />
								Loading more…
							{:else}
								<span class="opacity-0">Loading more…</span>
							{/if}
						</div>
					{:else if hooksList.total > PAGE_SIZE}
						<div class="border-t px-3 py-2 text-center text-2xs text-muted-foreground">
							End of list — {hooksList.total} bindings
						</div>
					{/if}
				{/if}
			</div>
		</section>
	</div>
</div>

<!-- Add module modal -->
<Dialog.Root bind:open={addOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Add module</Dialog.Title>
			<Dialog.Description>
				Provide the pip package name. The module must already be installed in the IRIS python
				environment.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-2 pt-2">
			<label for="add-module-name" class="text-xs font-medium text-muted-foreground">
				Module name
			</label>
			<Input
				id="add-module-name"
				placeholder="iris_my_module"
				bind:value={addModuleName}
				disabled={addBusy}
			/>
			{#if addError}
				<p class="text-xs text-destructive">{addError}</p>
			{/if}
		</div>

		<Dialog.Footer class="pt-4">
			<Button variant="outline" onclick={() => (addOpen = false)} disabled={addBusy}>Cancel</Button>
			<Button onclick={submitAdd} disabled={addBusy}>
				{addBusy ? 'Registering…' : 'Register'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Configure module modal -->
<Dialog.Root bind:open={configOpen}>
	<Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
		<Dialog.Header class="space-y-1">
			<Dialog.Title class="flex items-center gap-2 text-base">
				<SettingsIcon size={16} class="text-muted-foreground" />
				{configModule?.module_human_name ?? 'Module'}
			</Dialog.Title>
			{#if configModule?.module_description}
				<Dialog.Description class="text-xs">
					{configModule.module_description}
				</Dialog.Description>
			{/if}
		</Dialog.Header>

		{#if configLoading || !configModule}
			<div class="space-y-1.5 py-3">
				{#each Array(5) as _}
					<Skeleton class="h-8 w-full" />
				{/each}
			</div>
		{:else}
			<!-- Metadata strip + actions -->
			<div class="flex flex-wrap items-center gap-x-4 gap-y-2 border-y py-2 text-2xs">
				<span class="text-muted-foreground">
					Package <span class="ml-1 font-mono text-foreground">{configModule.module_name}</span>
				</span>
				<span class="text-muted-foreground">
					Version <span class="ml-1 tabular-nums text-foreground"
						>{configModule.module_version}</span
					>
				</span>
				<span class="text-muted-foreground">
					Interface
					<span class="ml-1 tabular-nums text-foreground">{configModule.interface_version}</span>
				</span>
				<span class="text-muted-foreground">
					Type <span class="ml-1 text-foreground">{configModule.module_type}</span>
				</span>

				<div class="ml-auto flex items-center gap-1.5">
					<span class="text-muted-foreground">Status</span>
					<Switch
						checked={configModule.is_active}
						onCheckedChange={() => {
							if (!configModule) return;
							void toggleActive({
								id: configModule.id,
								module_human_name: configModule.module_human_name,
								has_pipeline: configModule.has_pipeline,
								module_version: configModule.module_version,
								interface_version: configModule.interface_version,
								date_added: configModule.date_added,
								added_by: '',
								is_active: configModule.is_active,
								configured: true
							});
						}}
					/>
					<Button variant="outline" size="sm" class="h-7" onclick={exportConfig}>
						<DownloadIcon size={12} class="mr-1" />
						Export
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
				</div>
			</div>

			<!-- Per-section parameters -->
			<div class="flex flex-col gap-3 pt-3">
				{#each Object.entries(groupedParams) as [section, params] (section)}
					<div>
						<h3 class="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
							{section}
						</h3>
						<div class="flex flex-col divide-y rounded-md border">
							{#each params as param (param.param_name)}
								{@const isJson = param.type === 'textfield_json'}
								{@const isTextfield = String(param.type).startsWith('textfield_')}
								{@const jsonValid = paramJsonValid[param.param_name] ?? true}
								{@const saveDisabled = savingParam === param.param_name || (isJson && !jsonValid)}
								<div class="flex flex-col gap-2 p-3">
									<div class="flex items-center gap-2">
										<span class="text-xs font-medium">
											{param.param_human_name ?? param.param_name}
										</span>
										{#if param.mandatory}
											<span
												class="rounded-sm border border-destructive/40 bg-destructive/10 px-1 py-0 text-2xs font-medium uppercase tracking-wide text-destructive"
											>
												Mandatory
											</span>
										{/if}
										<span class="ml-auto font-mono text-2xs text-muted-foreground">
											{param.type}
										</span>
									</div>
									{#if param.param_description}
										<p class="text-2xs text-muted-foreground">{param.param_description}</p>
									{/if}

									{#if param.type === 'bool'}
										<div class="flex items-center gap-2">
											<Switch
												checked={Boolean(paramDrafts[param.param_name])}
												onCheckedChange={(v) =>
													(paramDrafts = { ...paramDrafts, [param.param_name]: v })}
											/>
											<span class="text-2xs text-muted-foreground">
												{paramDrafts[param.param_name] ? 'true' : 'false'}
											</span>
											<Button
												size="sm"
												class="ml-auto h-7"
												onclick={() => saveParameter(param)}
												disabled={saveDisabled}
											>
												{savingParam === param.param_name ? 'Saving…' : 'Save'}
											</Button>
										</div>
									{:else if isTextfield}
										<!--
										  Textareas and the JSON editor live on their
										  own full-width line. Inline they were
										  squeezed against the Save button; full-width
										  is what an editor needs anyway. Save lives
										  below, right-aligned.
										-->
										{#if isJson}
											<JsonEditor
												value={String(paramDrafts[param.param_name] ?? '')}
												mode="json"
												minLines={14}
												maxLines={32}
												onInput={(val, ok) => {
													paramDrafts = {
														...paramDrafts,
														[param.param_name]: val
													};
													paramJsonValid = {
														...paramJsonValid,
														[param.param_name]: ok
													};
												}}
											/>
										{:else if param.type === 'textfield_html'}
											<JsonEditor
												value={String(paramDrafts[param.param_name] ?? '')}
												mode="html"
												minLines={14}
												maxLines={32}
												onInput={(val) =>
													(paramDrafts = {
														...paramDrafts,
														[param.param_name]: val
													})}
											/>
										{:else if param.type === 'textfield_markdown'}
											<JsonEditor
												value={String(paramDrafts[param.param_name] ?? '')}
												mode="markdown"
												minLines={14}
												maxLines={32}
												onInput={(val) =>
													(paramDrafts = {
														...paramDrafts,
														[param.param_name]: val
													})}
											/>
										{:else}
											<Textarea
												rows={14}
												class="font-mono text-xs"
												value={String(paramDrafts[param.param_name] ?? '')}
												oninput={(e) =>
													(paramDrafts = {
														...paramDrafts,
														[param.param_name]: (e.currentTarget as HTMLTextAreaElement).value
													})}
											/>
										{/if}
										<div class="flex justify-end">
											<Button
												size="sm"
												class="h-7"
												onclick={() => saveParameter(param)}
												disabled={saveDisabled}
											>
												{savingParam === param.param_name ? 'Saving…' : 'Save'}
											</Button>
										</div>
									{:else}
										<div class="flex items-center gap-1.5">
											<Input
												class="h-7 text-xs"
												type={param.type === 'sensitive_string' ? 'password' : 'text'}
												value={String(paramDrafts[param.param_name] ?? '')}
												oninput={(e) =>
													(paramDrafts = {
														...paramDrafts,
														[param.param_name]: (e.currentTarget as HTMLInputElement).value
													})}
											/>
											<Button
												size="sm"
												class="h-7"
												onclick={() => saveParameter(param)}
												disabled={saveDisabled}
											>
												{savingParam === param.param_name ? 'Saving…' : 'Save'}
											</Button>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<Dialog.Footer class="pt-3">
			<Button variant="outline" onclick={() => (configOpen = false)}>Close</Button>
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
