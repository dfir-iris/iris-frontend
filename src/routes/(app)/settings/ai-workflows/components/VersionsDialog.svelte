<!--
  Version history of a workflow; selecting a version shows its stored
  snapshot (read-only JSON).
-->
<script lang="ts">
	import { HistoryIcon } from 'lucide-svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import ApiError from '$lib/components/ui/api-error.svelte';
	import { formatDateTime } from '$lib/utils/time-formatter';
	import {
		AiWorkflowsService,
		aiListData,
		type AiWorkflowVersionDetail,
		type AiWorkflowVersionSummary
	} from '$lib/services/ai-workflows.service';
	import JsonBlock from './JsonBlock.svelte';
	import { userLabel } from '../helpers/ui';

	type Props = { open: boolean; workflowId: number; currentVersion: number };

	let { open = $bindable(), workflowId, currentVersion }: Props = $props();

	let versions = $state<AiWorkflowVersionSummary[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let selected = $state<AiWorkflowVersionDetail | null>(null);
	let loadingVersion = $state<number | null>(null);

	async function load() {
		loading = true;
		error = null;
		const res = await AiWorkflowsService.versions(workflowId);
		loading = false;
		if (!res.ok) {
			error = res.error?.message ?? 'Failed to load the versions';
			return;
		}
		versions = aiListData<AiWorkflowVersionSummary>(res.data).sort((a, b) => b.version - a.version);
	}

	async function view(version: number) {
		loadingVersion = version;
		const res = await AiWorkflowsService.version(workflowId, version);
		loadingVersion = null;
		if (res.ok) selected = res.data as AiWorkflowVersionDetail;
		else error = res.error?.message ?? 'Failed to load the version';
	}

	$effect(() => {
		if (open) {
			selected = null;
			load();
		}
	});
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="flex max-h-[90vh] flex-col sm:max-w-[860px]">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2 text-sm">
				<HistoryIcon size={14} /> Versions
			</Dialog.Title>
		</Dialog.Header>
		<div class="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)] gap-3 overflow-hidden">
			<div class="min-h-0 overflow-y-auto rounded-md border" data-testid="wf-versions-list">
				{#if error}
					<ApiError {error} onRetry={load} />
				{:else if loading}
					<p class="p-3 text-xs text-muted-foreground">Loading…</p>
				{:else}
					{#each versions as v (v.version)}
						<button
							type="button"
							class={`flex w-full flex-col items-start gap-0.5 border-b px-3 py-2 text-left text-xs last:border-b-0 hover:bg-muted/50 ${selected?.version === v.version ? 'bg-muted' : ''}`}
							onclick={() => view(v.version)}
						>
							<span class="flex items-center gap-1.5 font-medium">
								v{v.version}
								{#if v.version === currentVersion}
									<span class="rounded bg-primary/10 px-1 text-2xs text-primary">current</span>
								{/if}
								{#if loadingVersion === v.version}
									<span class="text-2xs text-muted-foreground">…</span>
								{/if}
							</span>
							<span class="text-2xs text-muted-foreground">
								{v.created_at ? formatDateTime(v.created_at) : '—'} · {userLabel(v.created_by)}
							</span>
							{#if v.note}
								<span class="line-clamp-2 text-2xs">{v.note}</span>
							{/if}
						</button>
					{:else}
						<p class="p-3 text-xs text-muted-foreground">No versions.</p>
					{/each}
				{/if}
			</div>
			<div class="min-h-0 overflow-y-auto">
				{#if selected}
					<JsonBlock label={`Snapshot of v${selected.version}`} value={selected.snapshot} open />
				{:else}
					<p class="p-3 text-xs text-muted-foreground">Select a version to view its snapshot.</p>
				{/if}
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>
