<script lang="ts">
	import DOMPurify from 'dompurify';
	import { getContext, onMount } from 'svelte';
	import {
		AlertTriangleIcon,
		ChartLineIcon,
		ClipboardCheckIcon,
		ClipboardPasteIcon,
		HardDriveUploadIcon,
		SettingsIcon,
		ZapIcon
	} from 'lucide-svelte';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import type { Case } from '$lib/types/resources/case';
	import * as Card from '$lib/components/ui/card';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { toast } from '$lib/components/ui/toast';
	import { Ace, converter } from '$lib/components/common/Ace';
	import RequestReviewDialog from './components/RequestReviewDialog.svelte';
	import type { UserInfo } from '$lib/services/auth.service';
	import { HooksService, type HookOption } from '$lib/services/hooks.service';
	import type { RequestResponse } from '$lib/services/api.service';

	const cases = getContext<CasesContext>(CASES_CTX);

	const case_id = cases.currentCaseId();
	const currentCase = $derived<Case | null>(cases.currentCase() ?? null);

	let caseDescription = $state('');
	let baseDescription = $state('');
	let hookOptions = $state<HookOption[]>([]);

	let loadedTime = $state(new Date());
	let editing = $state(false);

	let loading = $state(false);
	let saving = $state(false);
	let lastError = $state<string | null>(null);
	let showRequestReview = $state(false);

	let dirty = $derived(caseDescription !== baseDescription);
	let safeHtml = $derived(DOMPurify.sanitize(converter.makeHtml(caseDescription ?? '')));

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
	};

	const setReviewer = async (admin: UserInfo) => {
		if (!currentCase) return;

		saving = true;

		await cases.patch(case_id, {
			reviewer_id: admin.user_id,
			// TODO: Add API to retrieve list of review statuses and find a proper one
			review_status_id: 3
		});

		saving = false;
	};

	const callModule = async (hookOption: HookOption) => {
		const result = (
			(await HooksService.call({
				cid: case_id,
				type: 'case',
				hook_name: hookOption.hook_name,
				module_name: hookOption.module_name,
				hook_ui_name: hookOption.manual_hook_ui_name,
				targets: [case_id]
			})) as RequestResponse<unknown>
		).data as { status: string; message: string };

		toast({
			variant: result?.status === 'error' ? 'destructive' : 'success',
			title: result?.message
		});
	};

	$effect(() => {
		if (!currentCase) return;

		baseDescription = currentCase.case_description ?? '';
		caseDescription = baseDescription;

		loadedTime = new Date();
	});

	onMount(async () => {
		const hooksResponse = (await HooksService.list('case')).data as unknown as RequestResponse<
			HookOption[]
		>;

		hookOptions = hooksResponse.data as HookOption[];
	});
</script>

<svelte:head>
	<title>Case #{case_id} | IRIS</title>
</svelte:head>

<div class="flex w-full flex-col border-b bg-muted/20 p-4">
	{#if currentCase}
		{#if currentCase.review_status?.id && currentCase.reviewer?.id}
			<Card.Root
				class="mb-4 flex w-full flex-row items-center gap-2 bg-amber-400 px-6 py-4 text-black"
			>
				<AlertTriangleIcon class="text-red-600" />
				{currentCase.review_status.status_name} by {currentCase.reviewer.user_name}
			</Card.Root>
		{/if}

		<Card.Root class="mb-4 flex w-full">
			<Card.Content>
				<div class="overflow-x-auto">
					<div class="flex min-w-max flex-nowrap justify-between">
						<div class="mr-2 flex">
							<Button
								onclick={() => (cases.ui.showManageModal = true)}
								variant="secondary"
								class="mr-2"
							>
								<SettingsIcon /> Manage
							</Button>

							{#if hookOptions.length}
								<DropdownMenu>
									<DropdownMenuTrigger>
										<Button variant="secondary" class="mr-2">
											<ZapIcon />Processors
										</Button>
									</DropdownMenuTrigger>

									<DropdownMenuContent align="start">
										{#each hookOptions as hookOption}
											<DropdownMenuItem onclick={() => callModule(hookOption)}
												>{hookOption.manual_hook_ui_name}</DropdownMenuItem
											>
										{/each}
									</DropdownMenuContent>
								</DropdownMenu>
							{/if}

							<Button variant="secondary">
								<HardDriveUploadIcon />Pipelines
							</Button>
						</div>

						<div class="flex">
							{#if currentCase.review_status === null}
								<Button variant="secondary" class="mr-2" onclick={() => (showRequestReview = true)}>
									<ClipboardCheckIcon /> Request review
								</Button>
							{/if}

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
					<Ace
						value={caseDescription}
						onChange={(v) => (caseDescription = v)}
						onSave={() => save()}
					/>
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

<RequestReviewDialog bind:open={showRequestReview} onConfirm={(admin) => setReviewer(admin)} />
