<script lang="ts">
	import { getContext } from 'svelte';
	import { page } from '$app/state';
	import { ShieldIcon, ShieldAlertIcon, ShieldQuestionIcon, ShieldCheckIcon } from 'lucide-svelte';
	import { Popover, PopoverContent, PopoverTrigger } from '$lib/components/ui/popover';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components/ui/toast';
	import { CaseAssetsService } from '$lib/services/case-assets.service';
	import {
		CASE_ASSETS_CTX,
		type CaseAssetsContext
	} from '$lib/contexts/case-assets.context.svelte';
	import SearchSelect, {
		type SelectOption
	} from '$lib/components/common/selects/SearchSelect.svelte';

	const caseAssets = getContext<CaseAssetsContext | undefined>(CASE_ASSETS_CTX);

	export interface CompromiseStatusData {
		id: number;
		name: string;
	}

	const STATUSES: CompromiseStatusData[] = [
		{ id: 1, name: 'Compromised' },
		{ id: 2, name: 'Not Compromised' },
		{ id: 3, name: 'Unknown' },
		{ id: 4, name: 'To be determined' }
	];

	let {
		status,
		isEditing = false,
		onStatusChange = () => {},
		editValue,
		onEditValueChange = () => {}
	}: {
		status: CompromiseStatusData | number;
		isEditing?: boolean;
		onStatusChange?: (status: CompromiseStatusData) => void;
		editValue?: number;
		onEditValueChange?: (id: number) => void;
	} = $props();

	let isOpen = $state(false);
	let isSaving = $state(false);
	let selectedStatusId = $state<number | null>(null);

	const caseId = $derived(Number(page.params.case_id));
	const assetId = $derived(Number(page.params.asset_id));

	const propStatusId = $derived(typeof status === 'number' ? status : status.id);

	const current = $derived(
		STATUSES.find((item) => item.id === (selectedStatusId ?? propStatusId)) ?? STATUSES[2]
	);

	const statusOptions = $derived<SelectOption[]>(
		STATUSES.map((item) => ({
			value: String(item.id),
			label: item.name
		}))
	);

	const getIcon = (name: string) => {
		switch (name) {
			case 'Compromised':
				return ShieldAlertIcon;
			case 'Not Compromised':
				return ShieldCheckIcon;
			case 'To be determined':
				return ShieldIcon;
			default:
				return ShieldQuestionIcon;
		}
	};

	const getColor = (name: string) => {
		switch (name) {
			case 'Compromised':
				return 'bg-red-200 text-red-800';
			case 'Not Compromised':
				return 'bg-green-200 text-green-800';
			case 'To be determined':
				return 'bg-blue-200 text-blue-800';
			default:
				return 'bg-gray-200 text-gray-800';
		}
	};

	const CurrentIcon = $derived(getIcon(current.name));

	const changeStatus = async (id: number) => {
		if (id === current.id) {
			isOpen = false;
			return;
		}

		isSaving = true;

		try {
			if (caseAssets) {
				const updated = await caseAssets.patchAsset(assetId, {
					asset_compromise_status_id: id
				});

				if (!updated) {
					throw new Error('Failed to update compromise status');
				}
			} else {
				const res = await CaseAssetsService.update(caseId, assetId, {
					asset_compromise_status_id: id
				});

				if (!res.ok || res.error) {
					throw new Error(res.error?.message ?? 'Failed to update compromise status');
				}
			}

			const next = STATUSES.find((item) => item.id === id);

			if (next) {
				selectedStatusId = next.id;
				onStatusChange(next);
			}

			toast({
				title: 'Status updated',
				description: 'Compromise status updated.',
				variant: 'success'
			});
		} catch {
			toast({
				title: 'Update failed',
				description: 'Failed to update compromise status.',
				variant: 'destructive'
			});
		} finally {
			isSaving = false;
			isOpen = false;
		}
	};
</script>

{#if isEditing}
	<SearchSelect
		value={editValue ? String(editValue) : ''}
		options={statusOptions}
		placeholder="Select compromise status"
		searchPlaceholder="Search compromise status..."
		onChange={(value) => onEditValueChange(Number(value))}
	/>
{:else}
	<Popover bind:open={isOpen}>
		<PopoverTrigger>
			<button type="button" class="flex cursor-pointer items-center gap-1">
				<div
					class={`flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium ${getColor(current.name)}`}
				>
					<CurrentIcon class="h-3.5 w-3.5" />
					<span>{current.name}</span>
				</div>
			</button>
		</PopoverTrigger>

		<PopoverContent class="w-56 p-2">
			<div class="space-y-1">
				{#each STATUSES as item}
					{@const Icon = getIcon(item.name)}

					<Button
						variant="ghost"
						size="sm"
						class="w-full justify-start"
						disabled={isSaving}
						onclick={() => changeStatus(item.id)}
					>
						<div
							class={`flex w-full items-center gap-2 ${item.id === current.id ? 'font-bold' : ''}`}
						>
							<div class={`flex items-center gap-1 rounded-md px-2 py-1 ${getColor(item.name)}`}>
								<Icon class="h-3.5 w-3.5" />
								<span>{item.name}</span>
							</div>
						</div>
					</Button>
				{/each}
			</div>
		</PopoverContent>
	</Popover>
{/if}
