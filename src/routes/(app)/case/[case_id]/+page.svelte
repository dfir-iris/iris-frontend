<script lang="ts">
	import { getContext } from 'svelte';
	import { AlertTriangleIcon } from 'lucide-svelte';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import type { Case } from '$lib/types/resources/case';
	import * as Card from '$lib/components/ui/card';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { MarkDownEditor } from '$lib/components/common/MarkDown';

	const cases = getContext<CasesContext>(CASES_CTX);

	const case_id = cases.currentCaseId();
	const currentCase = $derived<Case | null>(cases.currentCase() ?? null);

	let caseDescription = $state('');
	let baseDescription = $state('');

	let loadedTime = $state(new Date());

	let loading = $state(false);
	let saving = $state(false);
	let lastError = $state<string | null>(null);
	let savedAt = $state(0);

	let dirty = $derived(caseDescription !== baseDescription);

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
		savedAt = Date.now();
	};

	const handleRemoteSave = (content: string) => {
		caseDescription = content;
		baseDescription = content;
		loadedTime = new Date();
	};

	$effect(() => {
		if (!currentCase) return;

		baseDescription = currentCase.case_description ?? '';
		caseDescription = baseDescription;

		loadedTime = new Date();
	});
</script>

<svelte:head>
	<title>Case #{case_id} | IRIS</title>
</svelte:head>

<div class="flex w-full flex-col gap-4 px-4 pb-4 pt-4">
	{#if currentCase}
		{#if currentCase.review_status?.id && currentCase.reviewer?.id}
			<Card.Root
				class="flex w-full flex-row items-center gap-2 bg-amber-400 px-6 py-4 text-black"
			>
				<AlertTriangleIcon class="text-red-600" />
				{currentCase.review_status.status_name} by {currentCase.reviewer.user_name}
			</Card.Root>
		{/if}

		<Card.Root class="flex w-full grow">
			<Card.Header>
				<div class="flex items-center justify-between">
					<div class="mr-2 flex text-sm font-semibold">Case summary</div>

					<div class="flex items-center gap-2">
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

						<Button variant="secondary" size="xs" disabled={loading} onclick={refresh}>
							Refresh
						</Button>

						<Button variant="default" size="xs" disabled={saving || !dirty} onclick={save}>
							Save
						</Button>
					</div>
				</div>

				{#if lastError}
					<div class="mt-2 text-sm text-destructive">{lastError}</div>
				{/if}
			</Card.Header>

			<Card.Content>
				<MarkDownEditor
					value={caseDescription}
					onChange={(v) => (caseDescription = v)}
					onSave={() => save()}
					caseId={case_id}
					{savedAt}
					onRemoteSave={handleRemoteSave}
				/>
			</Card.Content>
		</Card.Root>
	{:else}
		<div>Loading...</div>
	{/if}
</div>
