<script lang="ts">
    import { Badge } from "$lib/components/ui/badge";
    import { 
        Clock,
        Play,
        CheckCircle,
        HelpCircle,
        Circle
    } from "lucide-svelte";

    export let status: 'Pending' | 'In progress' | 'Completed' | 'Unspecified' | 'To do';

    const statusConfig = {
        Pending: {
            color: "bg-yellow-100 text-yellow-800 hover:bg-yellow-200",
            icon: Clock
        },
        'In progress': {
            color: "bg-blue-100 text-blue-800 hover:bg-blue-200",
            icon: Play
        },
        Completed: {
            color: "bg-green-100 text-green-800 hover:bg-green-200",
            icon: CheckCircle
        },
        Unspecified: {
            color: "bg-gray-100 text-gray-800 hover:bg-gray-200",
            icon: HelpCircle
        },
        'To do': {
            color: "bg-gray-100 text-gray-800 hover:bg-gray-200",
            icon: Circle
        }
    };

    $: config = statusConfig[status] || statusConfig.Unspecified;
    $: status = status;
    $: Icon = config.icon;
</script>

<Badge class="items-center gap-1 {config.color}">
    <svelte:component this={Icon} class="h-3 w-3" />
    {status}
</Badge>