<script lang="ts">
    import { goto } from '$app/navigation';
    import { Button } from "$lib/components/ui/button";
    import { ArrowUpRight } from 'lucide-svelte';
  
    // Correctly define the params property type
    export let params;
    
    // Destructure params to ensure valid access
    $: name = params?.data.name ?? '';
    $: caseId = params?.data.case_id ?? 0;
  
    // Handle button click for navigation
    function handleClick() {
      if (caseId) {
        goto(`/case?cid=${caseId}`);
      } else {
        console.error("Invalid caseId provided:", caseId);
      }
    }

  
    export function refresh(props: any): boolean {
      return false;
    }
  </script>
  
  <div class="flex items-center gap-2">
    <Button 
        title="View case details"
        variant="ghost"
        size="icon"
        on:click={handleClick}
    >
        <ArrowUpRight class="h-4 w-4" />
    </Button>
    <span>{name}</span>
  </div>
