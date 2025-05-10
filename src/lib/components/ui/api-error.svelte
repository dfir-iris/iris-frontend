<script lang="ts">
  import { isCorsError } from '$lib/utils/error-handler';
  import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
  import { Button } from '$lib/components/ui/button';
  import { RefreshCw } from 'lucide-svelte';

  export let error: any = null;
  export let onRetry: (() => void) | null = null;
  export let showRetryButton = true;
  
  $: isCors = isCorsError(error);
  $: errorMessage = getErrorMessage(error);
  
  function getErrorMessage(err: any): string {
    if (!err) return 'An unknown error occurred';
    
    if (isCorsError(err)) {
      return 'Unable to connect to the backend server. Please check your network connection or contact your administrator.';
    }
    
    return err instanceof Error ? err.message : String(err);
  }
</script>

<Alert variant="destructive">
  <AlertTitle>Error loading data</AlertTitle>
  <AlertDescription>
    <p>{errorMessage}</p>
    
    {#if isCors}
      <p class="text-xs mt-2">
        (CORS error: This is likely a configuration issue with the application server)
      </p>
    {/if}
    
    {#if showRetryButton && onRetry}
      <div class="mt-4">
        <Button variant="outline" size="sm" onclick={onRetry}>
          <RefreshCw class="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    {/if}
  </AlertDescription>
</Alert>
