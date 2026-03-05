<script lang="ts">
	import {
		EllipsisVerticalIcon,
		FlameIcon,
		HandIcon,
		MessagesSquareIcon,
		PencilIcon
	} from 'lucide-svelte';
	import { Collapsible } from 'bits-ui';
	import * as Card from '$lib/components/ui/card';
	import type { Alert } from '$lib/types/resources/alert';
	import { getInitials } from '$lib/utils';
	import AlertCardFooter from './AlertCardFooter.svelte';
	import AlertCardDetails from './AlertCardDetails.svelte';

	let {
		alert,
		expanded = false,
		onExpandedChange,
		onAssign
	}: {
		alert: Alert;
		expanded?: boolean;
		onExpandedChange: (v: boolean) => void;
		onAssign: () => void;
	} = $props();

	const getBackgroundBySeverity = (severity: string): string => {
		switch (severity.toLowerCase()) {
			case 'informational':
				return 'bg-blue-600';
			case 'medium':
				return 'bg-orange-500';
			case 'high':
				return 'bg-red-500';
			default:
				return 'bg-gray-500';
		}
	};
</script>

<Card.Root class="flex grow">
	<Collapsible.Root open={expanded} onOpenChange={onExpandedChange}>
		<Card.Header class="!flex !flex-row !items-center !justify-between !space-y-0 pb-2">
			<div class="flex min-w-0 flex-1 items-center gap-4">
				<div class="relative flex h-12 w-14 shrink-0">
					<Collapsible.Trigger>
						<button
							class={`absolute left-0 top-0 flex h-12 w-12 items-center justify-center rounded-full text-white hover:z-50 ${getBackgroundBySeverity(alert.severity.severity_name)}`}
						>
							<FlameIcon size="32" />
						</button>
					</Collapsible.Trigger>

					<button
						class={`absolute left-6 top-4 z-0 flex h-10 w-10 items-center justify-center rounded-full text-xl text-white ${alert.owner ? 'bg-blue-300' : 'bg-orange-800'}`}
						title="Reasign alert"
						onclick={onAssign}
					>
						{#if alert.owner}
							{getInitials(alert.owner.user_name ?? '')}
						{:else}
							<HandIcon size="20" />
						{/if}
					</button>
				</div>

				<Collapsible.Trigger class="min-w-0 flex-1 cursor-pointer text-left">
					<h3 class="truncate text-lg font-bold">{alert.alert_title}</h3>
					<h4 class="truncate text-sm italic opacity-85">
						#{alert.alert_id} - {alert.alert_uuid}
					</h4>
				</Collapsible.Trigger>
			</div>

			<div class="flex shrink-0 items-center gap-4">
				<button title="comments">
					<MessagesSquareIcon size="16" />
				</button>

				<button title="edit">
					<PencilIcon size="16" />
				</button>

				<button title="menu">
					<EllipsisVerticalIcon size="16" />
				</button>
			</div>
		</Card.Header>

		<Card.Content>
			{alert.alert_description}

			<Collapsible.Content
				class="data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up overflow-hidden pt-4"
			>
				<AlertCardDetails {alert} />
			</Collapsible.Content>
		</Card.Content>

		<AlertCardFooter {alert} />
	</Collapsible.Root>
</Card.Root>
