<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';

	import { CaseService, type UpdateCaseBody } from '$lib/services/case.service';
	import type { Case } from '$lib/types/resources/case';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import CaseGeneralInfo from './CaseGeneralInfo.svelte';
	import CaseModificationHistory from './CaseModificationHistory.svelte';
	import CaseEditor from './CaseEditor.svelte';

	type CaseManageModalProps = {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		currentCase: Case;
	};

	let { open, onOpenChange, currentCase }: CaseManageModalProps = $props();

	let showConfirmDelete = $state(false);
	let showConfirmClose = $state(false);
	let activeTab = $state('info');
	let editing = $state(false);

	const saveCase = async (caseId: number, body: UpdateCaseBody) => {
		const res = await CaseService.update(caseId, body);
		currentCase = res.data as Case;
	};
</script>

<Dialog.Root bind:open {onOpenChange}>
	<Dialog.Content
		class="flex max-h-[calc(100dvh-2rem)] max-w-[calc(100dvw-2rem)] flex-col overflow-auto"
	>
		<Dialog.Header>
			<Dialog.Title class="flex items-center">
				{currentCase.case_name}

				<CaseModificationHistory {currentCase} />
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
								{currentCase}
								onCancel={() => (editing = false)}
								onDelete={() => (showConfirmDelete = true)}
								onClose={() => (showConfirmClose = true)}
								onSave={(patch) => saveCase(currentCase.case_id, { ...patch })}
							/>
						{:else}
							<CaseGeneralInfo {currentCase} />
						{/if}
					</div>
				</TabsContent>

				<TabsContent value="access">
					<div class="w-full border-b pb-2 text-lg">Access</div>
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
	message={`Case ID ${currentCase?.case_id} will be closed and will not appear in contexts anymore.`}
	onConfirm={() => {}}
	onCancel={() => (showConfirmClose = false)}
/>
