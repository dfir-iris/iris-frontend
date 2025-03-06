<script lang="ts">
    import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '$lib/components/ui/tooltip';
    import Button from '$lib/components/ui/button/button.svelte';
    import { CopyIcon } from 'lucide-svelte';

    export let value: string | number;
    export let copyText: string = 'Copy to clipboard';
    export let size: number = 6;

    function copyToClipboard(text: string) {
        navigator.clipboard.writeText(text.toString());
    }
</script>

<TooltipProvider>
    <Tooltip>
        <TooltipTrigger>
            <Button 
                variant="ghost" 
                size="icon" 
                class="h-{size} w-{size} opacity-0 group-hover:opacity-100 transition-opacity" 
                onclick={() => copyToClipboard(value)}
            >
                <CopyIcon class="h-{size/2} w-{size/2}" />
            </Button>
        </TooltipTrigger>
        <TooltipContent>
            <p class="text-xs">{copyText}</p>
        </TooltipContent>
    </Tooltip>
</TooltipProvider>