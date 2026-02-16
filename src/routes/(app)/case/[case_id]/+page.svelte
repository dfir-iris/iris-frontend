<script lang="ts">
	import DOMPurify from 'dompurify';
	import {
		ChartLineIcon,
		ClipboardCheckIcon,
		ClipboardPasteIcon,
		HardDriveUploadIcon,
		SettingsIcon,
		ZapIcon
	} from 'lucide-svelte';
	import { getContext } from 'svelte';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import type { Case } from '$lib/types/resources/case';
	import * as Card from '$lib/components/ui/card';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Ace, converter } from '$lib/components/common/Ace';
	import { CaseManageModal } from '../../[components]/CaseModals';

	const cases = getContext<CasesContext>(CASES_CTX);

	const case_id = cases.currentCaseId();
	const currentCase = $derived<Case | null>(cases.currentCase() ?? null);

	let caseDescription = $state('');
	let baseDescription = $state('');

	let loadedTime = $state(new Date());
	let editing = $state(false);

	let loading = $state(false);
	let saving = $state(false);
	let lastError = $state<string | null>(null);

	let dirty = $derived(caseDescription !== baseDescription);
	let safeHtml = $derived(DOMPurify.sanitize(converter.makeHtml(caseDescription ?? '')));

	let showCaseManage = $state(false);

	$effect(() => {
		if (!currentCase) return;

		baseDescription = currentCase.case_description ?? '';
		caseDescription = baseDescription;

		loadedTime = new Date();
	});

	const refresh = async () => {
		loading = true;
		lastError = null;

		await cases.load({ case_ids: [case_id] });

		loadedTime = new Date();
		loading = false;
	};

	const save = async () => {
		if (!currentCase) return;

		saving = true;
		lastError = null;

		await cases.patch(case_id, { case_description: caseDescription });

		baseDescription = caseDescription;
		loadedTime = new Date();
		saving = false;
		editing = false;
	};
</script>

<svelte:head>
	<title>Case #{case_id} | IRIS</title>
</svelte:head>

<div class="flex w-full flex-col border-b bg-muted/20 p-4">
	{#if currentCase}
		<Card.Root class="mb-4 flex w-full">
			<Card.Content>
				<div class="overflow-x-auto">
					<div class="flex min-w-max flex-nowrap justify-between">
						<div class="mr-2 flex">
							<Button onclick={() => (showCaseManage = true)} variant="secondary" class="mr-2">
								<SettingsIcon /> Manage
							</Button>

							<Button variant="secondary" class="mr-2">
								<ZapIcon />Processors
							</Button>

							<Button variant="secondary">
								<HardDriveUploadIcon />Pipelines
							</Button>
						</div>

						<div class="flex">
							<Button variant="secondary" class="mr-2">
								<ClipboardCheckIcon /> Request review
							</Button>

							<Button class="mr-2">
								<ClipboardPasteIcon /> Generate report
							</Button>

							<Button>
								<ChartLineIcon /> Activity report
							</Button>
						</div>
					</div>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root class="flex w-full grow">
			<Card.Header>
				<div class="flex items-center justify-between">
					<div class="mr-2 flex text-xl font-bold">Case summary</div>

					<div class="flex items-center">
						{#if lastError}
							<Badge variant="compromised" class="flex px-2 py-0.5">Error</Badge>
						{:else if saving}
							<Badge variant="destructive" class="flex px-2 py-0.5">Saving...</Badge>
						{:else if dirty}
							<Badge variant="destructive" class="flex px-2 py-0.5">Unsaved changes</Badge>
						{:else}
							<Badge variant="green" class="flex px-2 py-0.5">Changes saved</Badge>
						{/if}

						<div class="mx-2 flex text-sm">Last synced: {loadedTime.toLocaleTimeString()}</div>

						<Button variant="secondary" class="mr-2" onclick={() => (editing = !editing)}>
							{#if editing}Close editor{:else}Edit{/if}
						</Button>

						<Button
							variant="secondary"
							class="mr-2"
							disabled={loading || saving}
							onclick={editing ? save : refresh}
						>
							{#if editing}Save{:else}Refresh{/if}
						</Button>
					</div>
				</div>

				{#if lastError}
					<div class="mt-2 text-sm text-destructive">{lastError}</div>
				{/if}
			</Card.Header>

			<Card.Content>
				{#if editing}
					<Ace value={caseDescription} onChange={(v) => (caseDescription = v)} />
				{:else}
					<div class="prose dark:prose-invert max-w-none">
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html safeHtml}
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	{:else}
		<div>Loading...</div>
	{/if}
</div>

<CaseManageModal
	open={showCaseManage}
	onOpenChange={(openState) => {
		showCaseManage = openState;

		if (!openState) {
			refresh();
		}
	}}
/>
