<script lang="ts">
	import { getContext } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import type { UpdateCaseBody } from '$lib/services/case.service';
	import type { Case } from '$lib/types/resources/case';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import CaseGeneralInfo from './CaseGeneralInfo.svelte';
	import CaseModificationHistory from './CaseModificationHistory.svelte';
	import CaseEditor from './CaseEditor.svelte';
	import CaseAccess from './CaseAccess.svelte';

	type CaseManageModalProps = {
		open: boolean;
		onOpenChange: (open: boolean) => void;
	};

	let { open, onOpenChange }: CaseManageModalProps = $props();

	const cases = getContext<CasesContext>(CASES_CTX);
	const case_id = cases.currentCaseId();
	const currentCase = $derived<Case | null>(cases.currentCase() ?? null);

	let showConfirmDelete = $state(false);
	let showConfirmClose = $state(false);
	let activeTab = $state('info');
	let editing = $state(false);

	const saveCase = async (body: UpdateCaseBody) => {
		if (!currentCase) return;
		await cases.patch(case_id, body);
	};
</script>

<Dialog.Root bind:open {onOpenChange}>
	<Dialog.Content
		class="flex max-h-[calc(100dvh-2rem)] max-w-[calc(100dvw-2rem)] flex-col overflow-auto"
	>
		<Dialog.Header>
			<Dialog.Title class="flex items-center">
				{currentCase?.case_name}

				<CaseModificationHistory />
			</Dialog.Title>
		</Dialog.Header>

		<Tabs bind:value={activeTab} class="flex w-full flex-col">
			<div class="flex w-full border-b bg-muted/20">
				<TabsList class="h-auto w-full rounded-none border-0 bg-transparent p-0">
					<TabsTrigger
						value="info"
						class="flex items-center gap-2 rounded-none px-6 py-4 transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background/80"
					>
						Info
					</TabsTrigger>

					<TabsTrigger
						value="access"
						class="flex items-center gap-2 rounded-none px-6 py-4 transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background/80"
					>
						Access
					</TabsTrigger>
				</TabsList>
			</div>

			<div class="w-full">
				<TabsContent value="info">
					<div class="flex flex-col pb-2 text-lg">
						<div class="mb-2 flex justify-between">
							<div class="text-3xl font-bold">General Info</div>

							{#if !editing}
								<Button variant="secondary" onclick={() => (editing = true)}>Edit</Button>
							{/if}
						</div>

						{#if editing}
							<CaseEditor
								onCancel={() => (editing = false)}
								onDelete={() => (showConfirmDelete = true)}
								onClose={() => (showConfirmClose = true)}
								onSave={(patch) => saveCase({ ...patch })}
							/>
						{:else}
							<CaseGeneralInfo />
						{/if}
					</div>
				</TabsContent>

				<TabsContent value="access">
					<div class="flex flex-col pb-2 text-lg">
						<div class="mb-2 flex justify-between">
							<div class="text-3xl font-bold">Case access</div>
						</div>

						<CaseAccess
							onDelete={() => (showConfirmDelete = true)}
							onClose={() => (showConfirmClose = true)}
						/>
					</div>
				</TabsContent>
			</div>
		</Tabs>

		{#if !editing && activeTab === 'info'}
			<Dialog.Footer>
				<Button variant="destructive" onclick={() => (showConfirmDelete = true)}>
					Delete Case
				</Button>

				<Button variant="secondary" onclick={() => (showConfirmClose = true)}>Close Case</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<ConfirmationDialog
	bind:open={showConfirmDelete}
	title="Are you sure?"
	message="You are about to delete this case forever. This cannot be reverted. All associated data will be deleted."
	onConfirm={() => {}}
	onCancel={() => (showConfirmDelete = false)}
/>

<ConfirmationDialog
	bind:open={showConfirmClose}
	title="Are you sure?"
	message={`Case ID ${case_id} will be closed and will not appear in contexts anymore.`}
	onConfirm={() => {}}
	onCancel={() => (showConfirmClose = false)}
/>
