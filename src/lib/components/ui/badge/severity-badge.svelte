<script lang="ts">
    import { Badge } from "$lib/components/ui/badge";
    import { 
        AlertCircle,
        AlertTriangle,
        ShieldAlert,
        CircleDot,
        HelpCircle
    } from "lucide-svelte";

    type Severity = 'Unspecified' | 'Low' | 'Medium' | 'High' | 'Critical';
    export let severity: Severity;

    const severityConfig = {
        Unspecified: {
            color: "bg-gray-100 text-gray-800 hover:bg-gray-200",
            icon: HelpCircle
        },
        Low: {
            color: "bg-blue-100 text-blue-800 hover:bg-blue-200",
            icon: CircleDot
        },
        Medium: {
            color: "bg-yellow-100 text-yellow-800 hover:bg-yellow-200",
            icon: AlertCircle
        },
        High: {
            color: "bg-orange-100 text-orange-800 hover:bg-orange-200",
            icon: AlertTriangle
        },
        Critical: {
            color: "bg-red-100 text-red-800 hover:bg-red-200",
            icon: ShieldAlert
        }
    };

    $: config = severityConfig[severity] || severityConfig.Unspecified;
    $: Icon = config.icon;
</script>

<Badge class="items-center gap-1 {config.color}">
    <svelte:component this={Icon} class="h-3 w-3" />
    {severity}
</Badge>