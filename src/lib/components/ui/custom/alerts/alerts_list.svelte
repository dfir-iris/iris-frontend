<script lang="ts">
    import { alertsStore } from "$lib/stores/alerts.store";
    import { cn } from "$lib/utils.js";
    import { ScrollArea } from "$lib/components/ui/scroll-area";
    import SeverityBadge from "$lib/components/ui/badge/severity-badge.svelte";
    import StatusBadge from "$lib/components/ui/badge/status-badge.svelte";
	import Badge from "../../badge/badge.svelte";

    export let items: any[];

</script>

<ScrollArea class="h-screen">
    <div class="flex flex-col gap-2 p-4 pt-0">
        {#each items as item}
            <button
                class={cn(
                    "hover:bg-accent flex flex-col items-start gap-2 rounded-lg border p-3 text-left text-sm transition-all",
                    $alertsStore.selected?.alert_id === item.alert_id ? "bg-accent" : ""
                )}
                onclick={() => alertsStore.setAlert(item.alert_id)}
            	>
				<div class="flex w-full flex-col gap-1">
					<div class="flex items-center">
						<div class="flex items-center gap-2">
							<div class="font-semibold col-1 max-w-fit">
							<p>{item.alert_title}</p>
							</div>
							{#if item.status.status_name === "New"}
							<span class="flex h-2 w-2 rounded-full bg-blue-600"></span>
							{/if}
						</div>
						<div
							class={cn(
							"ml-auto text-xs",
							$alertsStore.selected?.alert_id === item.alert_id
								? "text-foreground"
								: "text-muted-foreground"
							)}
						>
							{new Date(item.alert_source_event_time).toLocaleString()}
						</div>
					</div>
					<div class="text-xs font-medium">{item.alert_description}</div>
				</div>
                {#if item.classification.name_expanded}
                    <div class="flex items-center gap-2">
                        <StatusBadge status={item.status?.status_name} icon_only={true}/>
						<SeverityBadge severity={item.severity.severity_name} icon_only={true} />
						<Badge class="bg-gray-100 text-gray-800 hover:bg-gray-200">{item.customer?.customer_name}</Badge>
                    </div>
                {/if}
            </button>
        {/each}
    </div>
</ScrollArea>