<script lang="ts">
	import {
		CheckCircleIcon,
		ChevronDownIcon,
		ClockIcon,
		AlertCircleIcon,
		XCircleIcon,
		PlayIcon,
		HelpCircleIcon
	} from 'lucide-svelte';
	import { Popover, PopoverContent, PopoverTrigger } from '$lib/components/ui/popover';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components/ui/toast';
	import {
		AnalysisStatusService,
		type AnalysisStatusItem
	} from '$lib/services/analysis-status.service';
	import { CaseAssetsService } from '$lib/services/case-assets.service';

	export interface AnalysisStatusData {
		id: number;
		name: string;
		description?: string;
	}

	let {
		status,
		caseId,
		assetId,
		isEditing = false,
		onStatusChange = () => {},
		editValue,
		onEditValueChange = () => {}
	}: {
		status: AnalysisStatusData;
		caseId?: string;
		assetId?: string;
		isEditing?: boolean;
		onStatusChange?: (newStatus: AnalysisStatusData) => void;
		editValue?: number;
		onEditValueChange?: (newStatusId: number) => void;
	} = $props();

	let isStatusPopoverOpen = $state(false);
	let isChangingStatus = $state(false);
	let analysisStatuses = $state<AnalysisStatusItem[]>([]);

	const getStatusIcon = (name?: string) => {
		switch (name) {
			case 'Done':
				return CheckCircleIcon;
			case 'Started':
				return PlayIcon;
			case 'Pending':
				return ClockIcon;
			case 'To be done':
				return AlertCircleIcon;
			case 'Cancelled':
				return XCircleIcon;
			default:
				return HelpCircleIcon;
		}
	};

	const getStatusColor = (name?: string) => {
		switch (name) {
			case 'Done':
				return 'bg-green-200 text-green-800';
			case 'Started':
				return 'bg-blue-200 text-blue-800';
			case 'Pending':
				return 'bg-yellow-200 text-yellow-800';
			case 'To be done':
				return 'bg-orange-200 text-orange-800';
			case 'Cancelled':
				return 'bg-red-200 text-red-800';
			default:
				return 'bg-gray-200 text-gray-800';
		}
	};

	const changeAnalysisStatus = async (statusId: number) => {
		if (!caseId || !assetId || statusId === status?.id) {
			isStatusPopoverOpen = false;
			return;
		}

		isChangingStatus = true;

		try {
			const res = await CaseAssetsService.update(Number(caseId), Number(assetId), {
				analysis_status_id: statusId
			});

			if (!res.ok || res.error) {
				throw new Error(res.error?.message ?? 'Failed');
			}

			const newStatus = analysisStatuses.find((s) => s.id === statusId);
			if (newStatus) onStatusChange(newStatus);

			toast({
				title: 'Status updated',
				description: 'Analysis status updated.',
				variant: 'success'
			});
		} catch {
			toast({
				title: 'Update failed',
				description: 'Failed to update analysis status.',
				variant: 'destructive'
			});
		} finally {
			isChangingStatus = false;
			isStatusPopoverOpen = false;
		}
	};

	const handleEditChange = (e: Event) => {
		onEditValueChange(Number((e.target as HTMLSelectElement).value));
	};

	const loadStatuses = async () => {
		if (!caseId) return;

		const res = await AnalysisStatusService.list(Number(caseId), { fetch });

		if (res.ok && Array.isArray(res.data)) {
			analysisStatuses = res.data;
		}
	};

	$effect(() => {
		loadStatuses();
	});
</script>

{#if isEditing}
	<select
		value={editValue}
		onchange={handleEditChange}
		class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
	>
		<option value="" disabled>Select status</option>
		{#each analysisStatuses as s}
			<option value={s.id}>{s.name}</option>
		{/each}
	</select>
{:else}
	<Popover bind:open={isStatusPopoverOpen}>
		<PopoverTrigger>
			<div class="flex cursor-pointer items-center gap-1">
				<div
					class={`flex items-center gap-1 rounded-md px-2 py-1 text-sm ${getStatusColor(status?.name)}`}
				>
					{#key status?.name}
						{@const Icon = getStatusIcon(status?.name)}
						<Icon class="h-3.5 w-3.5" />
					{/key}
					<span>{status?.name}</span>
				</div>

				{#if caseId && assetId}
					<ChevronDownIcon class="h-4 w-4 text-muted-foreground" />
				{/if}
			</div>
		</PopoverTrigger>

		{#if caseId && assetId}
			<PopoverContent class="w-56 p-2">
				<div class="space-y-1">
					{#each analysisStatuses as s}
						{@const Icon = getStatusIcon(s.name)}

						<Button
							variant="ghost"
							size="sm"
							class="w-full justify-start"
							disabled={isChangingStatus}
							onclick={() => changeAnalysisStatus(s.id)}
						>
							<div
								class={`flex w-full items-center gap-2 ${s.id === status?.id ? 'font-bold' : ''}`}
							>
								<div
									class={`flex items-center gap-1 rounded-md px-2 py-1 ${getStatusColor(s.name)}`}
								>
									<Icon class="h-3.5 w-3.5" />
									<span>{s.name}</span>
								</div>
							</div>
						</Button>
					{/each}
				</div>
			</PopoverContent>
		{/if}
	</Popover>
{/if}
