<!--
  Generate a case report: pick one of the templates of the report type
  (investigation or activities), optionally in safe mode, and download
  the rendered file. Templates are loaded each time the dialog opens, so
  one added in Settings shows up without a reload.
-->
<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from '$lib/components/ui/toast';
	import { DownloadIcon, FileTextIcon, RefreshCwIcon } from 'lucide-svelte';
	import {
		CaseReportsService,
		type CaseReportTemplate,
		type CaseReportType
	} from '$lib/services/case-reports.service';

	type Props = {
		open: boolean;
		caseId: number;
		reportType: CaseReportType;
	};

	let { open = $bindable(), caseId, reportType }: Props = $props();

	let templates = $state<CaseReportTemplate[]>([]);
	let loading = $state(false);
	let loadError = $state<string | null>(null);
	let selected = $state('');
	let safeMode = $state(false);
	let busy = $state(false);

	const kind = $derived(reportType === 'Activities' ? 'activities' : 'investigation');
	const title = $derived(reportType === 'Activities' ? 'Activity report' : 'Generate report');
	const matching = $derived(templates.filter((t) => t.report_type === reportType));

	async function load() {
		loading = true;
		loadError = null;
		const response = await CaseReportsService.templates(caseId);
		loading = false;
		if (!response.ok || response.error) {
			loadError = response.error?.message ?? 'Could not load the report templates';
			templates = [];
			return;
		}
		templates = Array.isArray(response.data) ? response.data : [];
		const first = templates.find((t) => t.report_type === reportType);
		selected = first ? String(first.id) : '';
	}

	$effect(() => {
		if (open) {
			safeMode = false;
			void load();
		}
	});

	async function generate() {
		if (!selected || busy) return;
		busy = true;
		try {
			const result = await CaseReportsService.generateAndSave(caseId, Number(selected), safeMode);
			if (!result.ok) {
				toast({
					title: 'Report generation failed',
					description: result.error,
					variant: 'destructive'
				});
				return;
			}
			toast({ title: 'Report generated' });
			open = false;
		} catch (err) {
			toast({
				title: 'Report generation failed',
				description: (err as Error).message,
				variant: 'destructive'
			});
		} finally {
			busy = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-[520px]" data-testid="case-report-dialog">
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
			<Dialog.Description>
				Renders this case through a report template and downloads the file.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-4 py-2">
			{#if loading}
				<div class="flex flex-col gap-2">
					<Skeleton class="h-12 w-full" />
					<Skeleton class="h-12 w-full" />
				</div>
			{:else if loadError}
				<p class="text-sm text-destructive">{loadError}</p>
			{:else if matching.length === 0}
				<div
					class="flex flex-col items-center gap-2 rounded-md border border-dashed p-6 text-center"
					data-testid="case-report-no-template"
				>
					<FileTextIcon class="size-6 text-muted-foreground" />
					<p class="text-sm font-medium">No {kind} report template</p>
					<p class="text-xs text-muted-foreground">
						An administrator can add one in Settings → Report templates.
					</p>
				</div>
			{:else}
				<RadioGroup.Root bind:value={selected} class="flex max-h-72 flex-col gap-2 overflow-y-auto">
					{#each matching as template (template.id)}
						<Label
							for={`case-report-template-${template.id}`}
							class="flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal hover:bg-muted/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
						>
							<RadioGroup.Item
								value={String(template.id)}
								id={`case-report-template-${template.id}`}
								class="mt-0.5"
								data-testid={`case-report-template-${template.id}`}
							/>
							<span class="flex min-w-0 flex-1 flex-col gap-0.5">
								<span class="flex items-center gap-2">
									<span class="truncate text-sm font-medium">{template.name}</span>
									{#if template.format}
										<span
											class="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground"
										>
											{template.format}
										</span>
									{/if}
									{#if template.language}
										<span class="text-xs text-muted-foreground">{template.language}</span>
									{/if}
								</span>
								{#if template.description}
									<span class="line-clamp-2 text-xs text-muted-foreground">
										{template.description}
									</span>
								{/if}
							</span>
						</Label>
					{/each}
				</RadioGroup.Root>

				<div class="flex items-start justify-between gap-4 border-t pt-4">
					<div class="min-w-0">
						<Label for="case-report-safe-mode" class="font-medium">Safe mode</Label>
						<p class="mt-1 text-xs text-muted-foreground">
							Leaves the images out. Use it when a template fails on an image.
						</p>
					</div>
					<Switch id="case-report-safe-mode" bind:checked={safeMode} disabled={busy} />
				</div>
			{/if}
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)} disabled={busy}>Cancel</Button>
			<Button
				onclick={generate}
				disabled={!selected || busy || loading}
				data-testid="case-report-generate"
			>
				{#if busy}
					<RefreshCwIcon class="mr-2 size-4 animate-spin" />
					Generating…
				{:else}
					<DownloadIcon class="mr-2 size-4" />
					Generate
				{/if}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
