<script lang="ts">
	import { getContext } from 'svelte';
	import { goto } from '$app/navigation';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import type { UpdateCaseBody } from '$lib/services/case.service';
	import type { Case } from '$lib/types/resources/case';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import { toast } from '$lib/components/ui/toast';
	import CaseGeneralInfo from './CaseGeneralInfo.svelte';
	import CaseModificationHistory from './CaseModificationHistory.svelte';
	import CaseAccess from './CaseAccess.svelte';
	import CaseEditor from './CaseEditor.svelte';
	import CaseCustomAttributes from './CaseCustomAttributes.svelte';
	import {
		ensureHasCustomAttributes,
		hasCustomAttributes
	} from '$lib/stores/custom-attributes.store.svelte';
	import { onMount } from 'svelte';

	type CaseManageModalProps = {
		open: boolean;
		onOpenChange: (open: boolean) => void;
	};

	let { open, onOpenChange }: CaseManageModalProps = $props();

	const cases = getContext<CasesContext>(CASES_CTX);
	const case_id = $derived(cases.currentCaseId());
	const currentCase = $derived<Case | null>(cases.currentCase());

	let showConfirmDelete = $state(false);
	let showConfirmClose = $state(false);
	let activeTab = $state('info');
	let editing = $state(false);

	// Prime the schema presence map for `case`. The store dedupes
	// concurrent calls so this is safe even if other views also
	// prime it during the session.
	onMount(() => {
		void ensureHasCustomAttributes('case');
	});

	const saveCase = async (body: UpdateCaseBody) => {
		if (!currentCase) return;
		await cases.patch(case_id, body);
		editing = false;
		onOpenChange(false);
	};
</script>

<Dialog.Root bind:open {onOpenChange}>
	<Dialog.Content
		class="flex max-h-[85vh] w-[min(900px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0"
	>
		<Dialog.Header class="shrink-0 border-b px-5 py-3">
			<Dialog.Title class="flex items-center gap-2 text-sm font-semibold">
				<span class="truncate">{currentCase?.case_name}</span>
				<CaseModificationHistory />
			</Dialog.Title>
		</Dialog.Header>

		<Tabs bind:value={activeTab} class="flex min-h-0 w-full flex-1 flex-col">
			<div class="flex w-full shrink-0 border-b">
				<TabsList class="h-auto w-full rounded-none border-0 bg-transparent p-0">
					<TabsTrigger
						value="info"
						class="flex items-center gap-2 rounded-none px-4 py-2 text-xs font-medium transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background"
					>
						Info
					</TabsTrigger>

					<TabsTrigger
						value="user_access"
						class="flex items-center gap-2 rounded-none px-4 py-2 text-xs font-medium transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background"
					>
						User access
					</TabsTrigger>

					{#if hasCustomAttributes.case === true}
						<TabsTrigger
							value="custom_attributes"
							class="flex items-center gap-2 rounded-none px-4 py-2 text-xs font-medium transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background"
						>
							Custom attributes
						</TabsTrigger>
					{/if}
				</TabsList>
			</div>

			<div class="min-h-0 flex-1 overflow-auto">
				<TabsContent value="info" class="m-0 p-5">
					<div class="mb-3 flex items-center justify-between">
						<h3 class="text-sm font-semibold">General info</h3>

						{#if !editing}
							<Button variant="secondary" size="sm" onclick={() => (editing = true)}>Edit</Button>
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
				</TabsContent>

				<TabsContent value="user_access" class="m-0 p-5">
					<CaseAccess />
				</TabsContent>

				{#if hasCustomAttributes.case === true}
					<TabsContent value="custom_attributes" class="m-0 p-5">
						<CaseCustomAttributes />
					</TabsContent>
				{/if}
			</div>
		</Tabs>

		{#if !editing}
			{@const isClosed = currentCase?.state?.state_name === 'Closed'}
			{#key `${case_id}:${isClosed}`}
				<Dialog.Footer class="shrink-0 gap-2 border-t px-5 py-3">
					<Button variant="destructive" size="sm" onclick={() => (showConfirmDelete = true)}>
						Delete case
					</Button>

					{#if isClosed}
						<Button size="sm" onclick={async () => await cases.reopen(case_id)}>Reopen case</Button>
					{:else}
						<Button variant="secondary" size="sm" onclick={() => (showConfirmClose = true)}>
							Close case
						</Button>
					{/if}
				</Dialog.Footer>
			{/key}
		{/if}
	</Dialog.Content>
</Dialog.Root>

<ConfirmationDialog
	bind:open={showConfirmDelete}
	title="Are you sure?"
	message="You are about to delete this case forever. This cannot be reverted. All associated data will be deleted."
	onConfirm={async () => {
		if (!(await cases.remove(case_id))) {
			toast({
				title: 'Failed to delete case',
				description: cases.mutation.error ?? `Case ${case_id} has not been deleted.`,
				variant: 'destructive'
			});

			return;
		}

		toast({ title: `Case ${case_id} deleted`, variant: 'success' });
		goto('/cases');
	}}
	onCancel={() => (showConfirmDelete = false)}
/>

<ConfirmationDialog
	bind:open={showConfirmClose}
	title="Are you sure?"
	message={`Case ID ${case_id} will be closed and will not appear in contexts anymore.`}
	onConfirm={async () => {
		if (!(await cases.close(case_id))) {
			toast({
				title: 'Failed to close case',
				description: `Case ${case_id} is still open.`,
				variant: 'destructive'
			});
			return;
		}

		toast({ title: `Case ${case_id} closed`, variant: 'success' });
	}}
	onCancel={() => (showConfirmClose = false)}
/>
