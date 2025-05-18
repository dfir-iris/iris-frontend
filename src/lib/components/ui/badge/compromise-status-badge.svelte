<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import {
		ShieldAlertIcon,
		ShieldCheckIcon,
		ShieldQuestionIcon
	} from 'lucide-svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';

	export let status_id: number | undefined | null = 3; // Default to Unknown
	export let icon_only: boolean = false;
	export let prefix: string = '';

	const compromiseStatusConfig = {
		1: { // Compromised
			label: 'Compromised',
			color: 'text-red-600 dark:text-red-500',
			icon: ShieldAlertIcon,
			badgeClass: 'bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-700/30 dark:text-red-400 dark:hover:bg-red-700/40',
			variant: 'destructive' as const // Specific variant for "Compromised" text badge
		},
		2: { // Not Compromised
			label: 'Not Compromised',
			color: 'text-green-600 dark:text-green-500',
			icon: ShieldCheckIcon,
			badgeClass: 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-700/30 dark:text-green-400 dark:hover:bg-green-700/40'
		},
		3: { // Unknown
			label: 'Unknown',
			color: 'text-muted-foreground',
			icon: ShieldQuestionIcon,
			badgeClass: 'bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700/30 dark:text-gray-400 dark:hover:bg-gray-700/40'
		}
	};

	$: currentStatusId = status_id ?? 3;
	$: config = compromiseStatusConfig[currentStatusId as keyof typeof compromiseStatusConfig] || compromiseStatusConfig[3];
	$: tooltipText = prefix ? `${prefix} ${config.label}` : config.label;

</script>

{#if icon_only}
	<Tooltip.Provider>
		<Tooltip.Root>
			<Tooltip.Trigger class="flex">
				<!-- For icon_only, always use a generic outline badge for the icon itself, color comes from icon class -->
				<Badge variant="outline" class="p-1 border-0 bg-transparent hover:bg-muted/50">
					<svelte:component this={config.icon} size={14} class={config.color} />
				</Badge>
			</Tooltip.Trigger>
			<Tooltip.Content>{tooltipText}</Tooltip.Content>
		</Tooltip.Root>
	</Tooltip.Provider>
{:else}
	{#if currentStatusId === 1}
		<Badge variant={config.variant} icon={config.icon} class="items-center gap-1">
			{config.label}
		</Badge>
	{:else}
		<Badge class="items-center gap-1 {config.badgeClass}" icon={config.icon}>
			{config.label}
		</Badge>
	{/if}
{/if}

