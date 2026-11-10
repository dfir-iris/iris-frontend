<!--
  Top-bar launcher for the workflows that can be started by hand: the
  active ones with a manual trigger, among those the backend lists for
  the user (their own; every workflow for an administrator) — the same
  set `POST /ai-workflows/<id>/run` accepts. Picking one opens the run
  dialog, prefilled with the current case when the workflow runs on cases.
  The analyst stays where they are: the "started" toast links to the run,
  and the questions it asks pop up wherever they are.
-->
<script lang="ts">
	import { PlayIcon, SearchIcon, WorkflowIcon } from 'lucide-svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { current_user } from '$lib/stores/auth.store';
	import {
		AiWorkflowsService,
		aiListData,
		aiWorkflowTriggers,
		type AiEntityType,
		type AiWorkflowSummary
	} from '$lib/services/ai-workflows.service';
	import RunDialog from '../../../../routes/(app)/settings/ai-workflows/components/RunDialog.svelte';
	import { describeApiError } from '../../../../routes/(app)/settings/ai-workflows/helpers/ui';

	type Props = {
		open: boolean;
		/** Entity the run dialog proposes when the workflow accepts its type. */
		entity?: { type: AiEntityType; id: number } | null;
	};

	let { open = $bindable(), entity = null }: Props = $props();

	let workflows = $state<AiWorkflowSummary[]>([]);
	let loading = $state(false);
	let loadError = $state<string | null>(null);
	let search = $state('');
	let runTarget = $state<AiWorkflowSummary | null>(null);
	let runOpen = $state(false);

	const currentUserId = $derived($current_user?.id ?? null);

	const isManual = (w: AiWorkflowSummary) =>
		w.is_active && aiWorkflowTriggers(w).some((t) => t.type === 'manual');

	const filtered = $derived.by(() => {
		const q = search.trim().toLowerCase();
		if (!q) return workflows;
		return workflows.filter(
			(w) => w.name.toLowerCase().includes(q) || (w.description ?? '').toLowerCase().includes(q)
		);
	});

	async function load() {
		loading = true;
		loadError = null;
		const res = await AiWorkflowsService.list();
		loading = false;
		if (!res.ok) {
			loadError = describeApiError(res.data, res.error?.message ?? 'Failed to load the workflows');
			return;
		}
		workflows = aiListData<AiWorkflowSummary>(res.data)
			.filter(isManual)
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	$effect(() => {
		if (open) {
			search = '';
			load();
		}
	});

	function pick(workflow: AiWorkflowSummary) {
		runTarget = workflow;
		open = false;
		runOpen = true;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-[525px]">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2 text-sm">
				<WorkflowIcon size={14} /> Run a workflow
			</Dialog.Title>
			<Dialog.Description class="text-xs">
				Active workflows with a manual trigger that you can run.
			</Dialog.Description>
		</Dialog.Header>
		<div class="flex min-w-0 flex-col gap-3" data-testid="topbar-run-workflow">
			<div class="relative min-w-0">
				<SearchIcon
					size={14}
					class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 opacity-60"
				/>
				<Input class="h-9 w-full pl-8 text-sm" placeholder="Filter workflows" bind:value={search} />
			</div>
			<div class="max-h-80 min-h-[160px] overflow-auto rounded-md border bg-background">
				{#if loading}
					<p class="p-3 text-sm opacity-70">Loading workflows…</p>
				{:else if loadError}
					<p class="p-3 text-sm text-destructive">{loadError}</p>
				{:else if filtered.length === 0}
					<p class="p-3 text-sm opacity-70">
						{workflows.length === 0
							? 'No workflow can be run manually.'
							: 'No workflow matches the filter.'}
					</p>
				{:else}
					<ul class="py-1">
						{#each filtered as workflow (workflow.id)}
							<li>
								<button
									type="button"
									class="group flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
									onclick={() => pick(workflow)}
								>
									<span class="flex min-w-0 flex-1 flex-col">
										<span class="flex min-w-0 items-center gap-2">
											<span class="min-w-0 flex-1 truncate font-medium">{workflow.name}</span>
											{#if currentUserId !== null && workflow.owner_id !== currentUserId}
												<span class="shrink-0 text-2xs text-muted-foreground">
													{workflow.owner?.name ??
														workflow.owner?.login ??
														`user #${workflow.owner_id}`}
												</span>
											{/if}
										</span>
										{#if workflow.description}
											<span class="truncate text-xs opacity-70">{workflow.description}</span>
										{/if}
									</span>
									<PlayIcon size={13} class="shrink-0 opacity-0 group-hover:opacity-70" />
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>

{#if runTarget}
	<RunDialog
		bind:open={runOpen}
		workflowId={runTarget.id}
		workflowName={runTarget.name}
		triggers={aiWorkflowTriggers(runTarget)}
		{entity}
		defaultDryRun={false}
		linkToRun
	/>
{/if}
