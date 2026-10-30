<!--
  Export / import of the graph: picture of the canvas (PNG, SVG), data
  exports through the backend (IRIS JSON, STIX 2.1, GraphML) and the import
  dialog for JSON / STIX files.
-->
<script lang="ts">
	import {
		ChevronDownIcon,
		DownloadIcon,
		FileCodeIcon,
		ImageIcon,
		LoaderCircleIcon,
		UploadIcon
	} from 'lucide-svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components/ui/toast';
	import { downloadFile, exportPng, exportSvg } from '$lib/components/common/CytoscapeGraph';
	import { CaseGraphService } from '$lib/services/case-graph.service';
	import { apiErrorMessage } from '$lib/utils/error-handler';
	import type { GraphExportFormat } from '$lib/types/resources/case-graph';
	import type { CaseGraphState } from '../../lib/graph-state.svelte';
	import {
		canvasFilename,
		EXPORT_FORMATS,
		exportFilename,
		exportMime,
		exportText
	} from '../../lib/exchange';
	import { getGraphFeatures } from '../context';
	import ImportDialog from './ImportDialog.svelte';

	let { graph }: { graph: CaseGraphState } = $props();

	const { caseId, canEdit } = getGraphFeatures();

	let busy = $state<string | null>(null);
	let importOpen = $state(false);

	const background = () => (graph.isDark ? '#0a0a0a' : '#ffffff');

	const fail = (title: string, e: unknown) =>
		toast({
			title,
			description: e instanceof Error ? e.message : String(e),
			variant: 'destructive'
		});

	const picture = (ext: 'png' | 'svg') => {
		const cy = graph.cy;
		if (!cy) return;
		try {
			if (ext === 'png') {
				downloadFile(canvasFilename(caseId, 'png'), exportPng(cy, { background: background() }));
			} else {
				downloadFile(
					canvasFilename(caseId, 'svg'),
					exportSvg(cy, { background: background() }),
					'image/svg+xml'
				);
			}
		} catch (e) {
			fail('Could not export the picture', e);
		}
	};

	const data = async (format: GraphExportFormat) => {
		if (busy) return;
		busy = format;
		try {
			const res = await CaseGraphService.exportGraph(caseId, format, {}, graph.include);
			if (!res.ok || !res.data || typeof res.data !== 'object') {
				throw new Error(apiErrorMessage(res, 'The export failed.'));
			}
			downloadFile(
				exportFilename(caseId, format, res.data.filename),
				exportText(res.data.content),
				exportMime(format)
			);
		} catch (e) {
			fail('Could not export the graph', e);
		} finally {
			busy = null;
		}
	};
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="outline" size="xs" title="Export or import the graph">
				{#if busy}
					<LoaderCircleIcon class="h-3.5 w-3.5 animate-spin" />
				{:else}
					<DownloadIcon class="h-3.5 w-3.5" />
				{/if}
				<span class="ml-1 hidden @[100rem]:inline">Export</span>
				<ChevronDownIcon class="ml-0.5 h-3 w-3" />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-64">
		<DropdownMenu.Label class="text-xs">Picture of the canvas</DropdownMenu.Label>
		<DropdownMenu.Item disabled={!graph.cy} onclick={() => picture('png')}>
			<ImageIcon class="mr-2 h-3.5 w-3.5" />PNG
		</DropdownMenu.Item>
		<DropdownMenu.Item disabled={!graph.cy} onclick={() => picture('svg')}>
			<ImageIcon class="mr-2 h-3.5 w-3.5" />SVG
			<span class="ml-auto text-[10px] text-muted-foreground">no icons</span>
		</DropdownMenu.Item>
		<DropdownMenu.Separator />
		<DropdownMenu.Label class="text-xs">
			Data <span class="font-normal text-muted-foreground">(accepted relations)</span>
		</DropdownMenu.Label>
		{#each EXPORT_FORMATS as f (f.format)}
			<DropdownMenu.Item disabled={!!busy} onclick={() => data(f.format)}>
				<FileCodeIcon class="mr-2 h-3.5 w-3.5" />
				<span class="flex flex-col">
					<span>{f.label}</span>
					<span class="text-[10px] text-muted-foreground">{f.hint}</span>
				</span>
			</DropdownMenu.Item>
		{/each}
		{#if canEdit()}
			<DropdownMenu.Separator />
			<DropdownMenu.Item onclick={() => (importOpen = true)}>
				<UploadIcon class="mr-2 h-3.5 w-3.5" />Import JSON / STIX…
			</DropdownMenu.Item>
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>

{#if canEdit()}
	<ImportDialog bind:open={importOpen} {graph} {caseId} />
{/if}
