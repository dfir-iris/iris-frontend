<script lang="ts">
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
	import { MarkDownEditor } from '$lib/components/common/MarkDown';
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

	let loading = $state(false);
	let saving = $state(false);
	let lastError = $state<string | null>(null);
	let showRequestReview = $state(false);
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

<div class="flex w-full flex-col p-4">
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
						<div class="flex gap-2">
							<Button
								onclick={() => (cases.ui.showManageModal = true)}
								variant="secondary"
								size="xs"
							>
								<SettingsIcon /> Manage
							</Button>

							{#if hookOptions.length}
								<DropdownMenu>
									<DropdownMenuTrigger>
										<Button variant="secondary" size="xs">
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

							<Button variant="secondary" size="xs">
								<HardDriveUploadIcon />Pipelines
							</Button>
						</div>

						<div class="flex gap-2">
							{#if currentCase.review_status === null}
								<Button variant="secondary" size="xs" onclick={() => (showRequestReview = true)}>
									<ClipboardCheckIcon /> Request review
								</Button>
							{/if}

							<Button size="xs">
								<ClipboardPasteIcon /> Generate report
							</Button>

							<Button size="xs">
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

						<Button
							variant="secondary"
							size="xs"
							disabled={loading}
							onclick={refresh}
						>
							Refresh
						</Button>

						<Button
							variant="default"
							size="xs"
							disabled={saving || !dirty}
							onclick={save}
						>
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

<RequestReviewDialog bind:open={showRequestReview} onConfirm={(admin) => setReviewer(admin)} />
