<!--
  AI workflows: list with trigger, active toggle, owner, version and
  last-24h run counts; new / import / edit / export / delete / run
  actions, the workflow library and the JSON authoring guide. The editor
  lives at `./[id]` (`./new` to create), runs at `./runs`.
-->
<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		BookOpenIcon,
		DownloadIcon,
		LibraryIcon,
		ListIcon,
		PencilIcon,
		PlayIcon,
		PlusIcon,
		RefreshCwIcon,
		Trash2Icon,
		UploadIcon,
		WorkflowIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Switch } from '$lib/components/ui/switch';
	import { toast } from '$lib/components/ui/toast';
	import ApiError from '$lib/components/ui/api-error.svelte';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import { formatDateTime } from '$lib/utils/time-formatter';
	import { USER_CTX, type UserCtx } from '$lib/contexts/user-context.context.svelte';
	import { runtimeConfig } from '$lib/stores/runtime-config.store.svelte';
	import {
		AiWorkflowsService,
		aiListData,
		type AiEntityType,
		type AiImportResult,
		type AiRunSummary,
		type AiWorkflow,
		type AiWorkflowSummary
	} from '$lib/services/ai-workflows.service';
	import FeatureGate from './components/FeatureGate.svelte';
	import RunDialog from './components/RunDialog.svelte';
	import AuthoringGuideDialog from './components/AuthoringGuideDialog.svelte';
	import LibraryDialog from './components/LibraryDialog.svelte';
	import {
		describeApiError,
		describeWarnings,
		downloadJson,
		exportFilename,
		pickJsonFile,
		RUN_STATUS_TONES,
		TRIGGER_LABELS,
		triggerDetail,
		userLabel
	} from './helpers/ui';

	const userCtx = getContext<UserCtx>(USER_CTX);
	const canWrite = $derived(userCtx?.can('ai_workflows_write') ?? false);

	let workflows = $state<AiWorkflowSummary[]>([]);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let toggling = $state<Record<number, boolean>>({});

	let pendingDelete = $state<AiWorkflowSummary | null>(null);
	let confirmDeleteOpen = $state(false);

	let runTarget = $state<AiWorkflowSummary | null>(null);
	let runOpen = $state(false);
	let guideOpen = $state(false);
	let libraryOpen = $state(false);
	let importing = $state(false);

	async function importWorkflow() {
		let picked;
		try {
			picked = await pickJsonFile();
		} catch (e) {
			toast({ title: 'Import failed', description: (e as Error).message, variant: 'destructive' });
			return;
		}
		if (!picked) return;
		importing = true;
		const res = await AiWorkflowsService.importWorkflow(picked.data);
		importing = false;
		if (!res.ok) {
			toast({
				title: 'Import failed',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
			return;
		}
		const result = res.data as AiImportResult<AiWorkflow>;
		const created = result.workflow;
		const warnings = describeWarnings(result.warnings);
		toast({
			title: `Workflow “${created?.name ?? picked.name}” imported (inactive)`,
			description: warnings || 'Review it, then activate it.',
			variant: warnings ? 'warning' : 'success'
		});
		if (created) goto(`/settings/ai-workflows/${created.id}`);
		else load();
	}

	function onLibraryAdded(created: AiWorkflow | undefined, name: string, warnings: string) {
		toast({
			title: `Workflow “${name}” added (inactive)`,
			description: warnings || 'Review it, then activate it.',
			variant: warnings ? 'warning' : 'success'
		});
		if (created) goto(`/settings/ai-workflows/${created.id}`);
		else load();
	}

	async function exportWorkflow(workflow: AiWorkflowSummary) {
		const res = await AiWorkflowsService.exportWorkflow(workflow.id);
		if (!res.ok) {
			toast({
				title: 'Export failed',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
			return;
		}
		downloadJson(exportFilename(workflow.name, 'workflow'), res.data);
	}

	async function load() {
		loading = true;
		loadError = null;
		const res = await AiWorkflowsService.list();
		loading = false;
		if (!res.ok) {
			loadError = res.error?.message ?? describeApiError(res.data, 'Failed to load AI workflows');
			return;
		}
		workflows = aiListData<AiWorkflowSummary>(res.data).sort((a, b) =>
			a.name.localeCompare(b.name)
		);
	}

	onMount(() => {
		if (runtimeConfig.aiWorkflowsEnabled) load();
	});

	async function toggleActive(workflow: AiWorkflowSummary, value: boolean) {
		toggling[workflow.id] = true;
		const res = await AiWorkflowsService.update(workflow.id, { is_active: value });
		toggling[workflow.id] = false;
		if (!res.ok) {
			toast({
				title: value ? 'Could not activate the workflow' : 'Could not deactivate the workflow',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
			return;
		}
		workflows = workflows.map((w) => (w.id === workflow.id ? { ...w, is_active: value } : w));
	}

	async function remove() {
		const target = pendingDelete;
		if (!target) return;
		const res = await AiWorkflowsService.remove(target.id);
		pendingDelete = null;
		if (!res.ok) {
			toast({
				title: 'Delete failed',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
			return;
		}
		workflows = workflows.filter((w) => w.id !== target.id);
		toast({ title: 'Workflow deleted', description: target.name, variant: 'success' });
	}

	function openRun(workflow: AiWorkflowSummary) {
		runTarget = workflow;
		runOpen = true;
	}

	const manualEntityTypes = (w: AiWorkflowSummary): AiEntityType[] =>
		w.trigger_type === 'manual' && Array.isArray(w.trigger_config?.entity_types)
			? (w.trigger_config.entity_types as AiEntityType[])
			: [];

	const COUNT_ORDER = [
		'succeeded',
		'failed',
		'running',
		'waiting',
		'cancelled',
		'skipped'
	] as const;

	function onRunStarted(run: AiRunSummary) {
		goto(`/settings/ai-workflows/runs/${run.uuid}`);
	}
</script>

<svelte:head>
	<title>AI workflows</title>
</svelte:head>

<div class="flex h-full w-full flex-col overflow-hidden">
	<header class="flex items-center justify-between gap-3 border-b px-5 py-3">
		<div class="flex items-center gap-2.5">
			<WorkflowIcon size={18} class="text-muted-foreground" />
			<div class="leading-tight">
				<h1 class="text-sm font-semibold">AI workflows</h1>
				<p class="text-xs text-muted-foreground">
					Graphs of AI agents, HTTP calls, conditions and analyst questions, fired by events, a
					schedule, a webhook or by hand.
				</p>
			</div>
		</div>
		<div class="flex items-center gap-1.5">
			<Button variant="outline" size="sm" class="h-7" href="/settings/ai-workflows/runs">
				<ListIcon size={12} class="mr-1" /> Runs
			</Button>
			<Button
				variant="ghost"
				size="sm"
				class="h-7"
				onclick={() => (guideOpen = true)}
				title="How to write workflows as JSON (for people and LLMs)"
				data-testid="wf-guide"
			>
				<BookOpenIcon size={12} class="mr-1" /> JSON guide
			</Button>
			<Button
				variant="outline"
				size="sm"
				class="h-7"
				onclick={() => (libraryOpen = true)}
				title="Workflows shipped with IRIS, ready to add and adapt"
				data-testid="wf-library"
			>
				<LibraryIcon size={12} class="mr-1" /> Library
			</Button>
			<Button variant="outline" size="sm" class="h-7" onclick={load} disabled={loading}>
				<RefreshCwIcon size={12} class={`mr-1 ${loading ? 'animate-spin' : ''}`} />
				Refresh
			</Button>
			{#if canWrite}
				<Button
					variant="outline"
					size="sm"
					class="h-7"
					onclick={importWorkflow}
					disabled={importing}
					title="Create a workflow from a JSON document"
					data-testid="wf-import"
				>
					<UploadIcon size={12} class="mr-1" />
					{importing ? 'Importing…' : 'Import'}
				</Button>
				<Button size="sm" class="h-7" href="/settings/ai-workflows/new" data-testid="wf-new">
					<PlusIcon size={12} class="mr-1" /> New workflow
				</Button>
			{/if}
		</div>
	</header>

	<div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
		<FeatureGate>
			{#if loadError}
				<ApiError error={loadError} onRetry={load} />
			{/if}

			{#if loading && workflows.length === 0}
				<p class="py-10 text-center text-xs text-muted-foreground">Loading…</p>
			{:else if workflows.length === 0 && !loadError}
				<div
					class="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground"
					data-testid="wf-empty"
				>
					<WorkflowIcon size={32} class="opacity-40" />
					<p class="text-sm">No AI workflows yet.</p>
					<p class="max-w-md text-xs">
						Triage new alerts, enrich cases from external tools, or ask an analyst before acting.
					</p>
					{#if canWrite}
						<div class="mt-2 flex gap-1.5">
							<Button variant="outline" size="sm" class="h-7" onclick={() => (libraryOpen = true)}>
								<LibraryIcon size={12} class="mr-1" /> Start from the library
							</Button>
							<Button size="sm" class="h-7" href="/settings/ai-workflows/new">
								<PlusIcon size={12} class="mr-1" /> Create a workflow
							</Button>
						</div>
					{/if}
				</div>
			{:else if workflows.length > 0}
				<div class="overflow-hidden rounded-md border">
					<table class="w-full text-xs" data-testid="wf-table">
						<thead
							class="bg-muted/40 text-left text-2xs uppercase tracking-wide text-muted-foreground"
						>
							<tr>
								<th class="w-16 px-3 py-2">Active</th>
								<th class="px-3 py-2">Name</th>
								<th class="w-48 px-3 py-2">Trigger</th>
								<th class="w-40 px-3 py-2">Owner</th>
								<th class="w-16 px-3 py-2">Version</th>
								<th class="w-48 px-3 py-2" title="Runs started in the last 24 hours">24h runs</th>
								<th class="w-28 px-3 py-2"></th>
							</tr>
						</thead>
						<tbody>
							{#each workflows as workflow (workflow.id)}
								{@const counts = workflow.run_counts_24h ?? {}}
								{@const detail = triggerDetail(workflow.trigger_type, workflow.trigger_config)}
								<tr class="border-t hover:bg-muted/20" data-testid={`wf-row-${workflow.id}`}>
									<td class="px-3 py-2">
										<Switch
											checked={workflow.is_active}
											disabled={!canWrite || toggling[workflow.id]}
											onCheckedChange={(v: boolean) => toggleActive(workflow, v)}
											aria-label={`Activate ${workflow.name}`}
										/>
									</td>
									<td class="max-w-0 px-3 py-2">
										<a
											class="block max-w-full truncate font-medium underline-offset-2 hover:underline"
											href={`/settings/ai-workflows/${workflow.id}`}
										>
											{workflow.name}
										</a>
										{#if workflow.description}
											<div class="truncate text-2xs text-muted-foreground">
												{workflow.description}
											</div>
										{/if}
									</td>
									<td class="max-w-0 px-3 py-2">
										<span class="rounded bg-muted px-1.5 py-0.5 text-2xs">
											{TRIGGER_LABELS[workflow.trigger_type] ?? workflow.trigger_type}
										</span>
										{#if detail}
											<span
												class="ml-1 truncate font-mono text-2xs text-muted-foreground"
												title={detail}
											>
												{detail}
											</span>
										{/if}
										{#if workflow.last_fired_at}
											<div class="text-2xs text-muted-foreground">
												Last fired {formatDateTime(workflow.last_fired_at)}
											</div>
										{/if}
									</td>
									<td class="truncate px-3 py-2">{userLabel(workflow.owner)}</td>
									<td class="px-3 py-2 font-mono">v{workflow.version}</td>
									<td class="px-3 py-2">
										<a
											class="flex flex-wrap gap-1"
											href={`/settings/ai-workflows/runs?workflow_id=${workflow.id}`}
											title="Open the runs of this workflow"
										>
											{#each COUNT_ORDER as status (status)}
												{#if counts[status]}
													<span class={`rounded px-1 text-2xs ${RUN_STATUS_TONES[status]}`}>
														{counts[status]}
														{status}
													</span>
												{/if}
											{/each}
											{#if !COUNT_ORDER.some((s) => counts[s])}
												<span class="text-muted-foreground">—</span>
											{/if}
										</a>
										{#if workflow.skipped_count}
											<div
												class="mt-0.5 text-2xs text-muted-foreground"
												title={workflow.last_skipped_at
													? `Last skipped ${formatDateTime(workflow.last_skipped_at)}`
													: undefined}
												data-testid={`wf-skipped-${workflow.id}`}
											>
												{workflow.skipped_count} skipped{workflow.last_skip_reason
													? ` (last: ${workflow.last_skip_reason})`
													: ''}
											</div>
										{/if}
									</td>
									<td class="px-3 py-2">
										<div class="flex justify-end gap-1">
											{#if canWrite}
												<Button
													variant="ghost"
													size="icon"
													class="h-7 w-7"
													title="Run"
													aria-label={`Run ${workflow.name}`}
													onclick={() => openRun(workflow)}
												>
													<PlayIcon size={13} />
												</Button>
											{/if}
											<Button
												variant="ghost"
												size="icon"
												class="h-7 w-7"
												title={canWrite ? 'Edit' : 'View'}
												href={`/settings/ai-workflows/${workflow.id}`}
											>
												<PencilIcon size={13} />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												class="h-7 w-7"
												title="Export (JSON, without secrets)"
												aria-label={`Export ${workflow.name}`}
												onclick={() => exportWorkflow(workflow)}
											>
												<DownloadIcon size={13} />
											</Button>
											{#if canWrite}
												<Button
													variant="ghost"
													size="icon"
													class="h-7 w-7 text-muted-foreground hover:text-destructive"
													title="Delete"
													aria-label={`Delete ${workflow.name}`}
													onclick={() => {
														pendingDelete = workflow;
														confirmDeleteOpen = true;
													}}
												>
													<Trash2Icon size={13} />
												</Button>
											{/if}
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</FeatureGate>
	</div>
</div>

<ConfirmationDialog
	bind:open={confirmDeleteOpen}
	title="Delete this workflow?"
	message={`“${pendingDelete?.name ?? ''}” is deleted and its active runs are cancelled. The run history is kept.`}
	confirmText="Delete"
	onConfirm={remove}
/>

{#if runTarget}
	<RunDialog
		bind:open={runOpen}
		workflowId={runTarget.id}
		workflowName={runTarget.name}
		entityTypes={manualEntityTypes(runTarget)}
		onStarted={onRunStarted}
	/>
{/if}

<AuthoringGuideDialog bind:open={guideOpen} />
<LibraryDialog bind:open={libraryOpen} {canWrite} onAdded={onLibraryAdded} />
