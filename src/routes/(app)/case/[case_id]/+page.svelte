<script lang="ts">
	import DOMPurify from 'dompurify';
	import type { PageData } from './$types';
	import type { Case } from '$lib/types/resources/case';
	import { page } from '$app/state';
	import { appContext } from '$lib/stores/appContext.store';
	import * as Card from '$lib/components/ui/card';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import {
		ChartLineIcon,
		ClipboardCheckIcon,
		ClipboardPasteIcon,
		HardDriveUploadIcon,
		SettingsIcon,
		ZapIcon
	} from 'lucide-svelte';
	import { Ace, converter } from '../../[components]/Ace';
	import { CaseService } from '$lib/services/case.service';

	let { data }: { data: PageData } = $props();

	let currentCase: Case | null = $state(null);

	let caseDescription = $state('');
	let baseDescription = $state('');

	let loadedTime = $state(new Date());
	let editing = $state(false);

	let loading = $state(false);
	let saving = $state(false);
	let lastError = $state<string | null>(null);

	let dirty = $derived(caseDescription !== baseDescription);
	let safeHtml = $derived(DOMPurify.sanitize(converter.makeHtml(caseDescription ?? '')));

	const getCaseId = (): number | null => {
		const raw = page.params.case_id;
		if (!raw) return null;
		const id = Number(raw);
		return Number.isInteger(id) ? id : null;
	};

	const fetchCase = async () => {
		const caseId = getCaseId();
		if (caseId === null) return;

		loading = true;
		lastError = null;

		appContext.update((current) =>
			current.currentCaseID === caseId ? current : { ...current, currentCaseID: caseId }
		);

		const res = await CaseService.get(caseId);
		if (res.status < 200 || res.status >= 300) {
			loading = false;
			lastError = `Failed to load case ${caseId} (status ${res.status})`;
			return;
		}

		currentCase = res.data as Case;

		baseDescription = currentCase.case_description ?? '';
		caseDescription = baseDescription;

		loadedTime = new Date();
		loading = false;
	};

	const refresh = async () => {
		await fetchCase();
	};

	const save = async () => {
		const caseId = getCaseId();
		if (caseId === null) return;
		if (!currentCase) return;

		saving = true;
		lastError = null;

		const res = await CaseService.update(caseId, {
			case_description: caseDescription
		});

		if (res.status < 200 || res.status >= 300) {
			saving = false;
			lastError = `Save failed (status ${res.status})`;
			return;
		}

		baseDescription = caseDescription;
		currentCase = { ...currentCase, case_description: caseDescription };

		loadedTime = new Date();
		saving = false;
		editing = false;
	};

	$effect(() => {
		fetchCase();
	});
</script>

<svelte:head>
	<title>Case #{data.caseId} | IRIS</title>
</svelte:head>

<div class="flex w-full flex-col border-b bg-muted/20 p-4">
	{#if currentCase}
		<Card.Root class="mb-4 flex w-full">
			<Card.Content>
				<div class="overflow-x-auto">
					<div class="flex min-w-max flex-nowrap justify-between">
						<div class="mr-2 flex">
							<Button variant="secondary" class="mr-2">
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
