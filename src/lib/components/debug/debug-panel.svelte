<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { writable } from 'svelte/store';
  import { ApiLogger, ApiLoggerConfig } from '$lib/utils/api-logger';
  import { Button } from '$lib/components/ui/button';
  import { 
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
  } from '$lib/components/ui/drawer';
  import { Switch } from '$lib/components/ui/switch';
  import { Label } from '$lib/components/ui/label';
  
  const isOpen = writable(false);
  const apiLoggingEnabled = writable(false);
  const showDebugInfo = writable(false);
  
  let serverInfo: Record<string, any> = {};
  let clientInfo: Record<string, any> = {};
  
  onMount(() => {
    if (browser) {
      apiLoggingEnabled.set(localStorage.getItem('debug_api') === 'true');
      
      clientInfo = {
        userAgent: navigator.userAgent,
        language: navigator.language,
        cookiesEnabled: navigator.cookieEnabled,
        screenSize: `${window.screen.width}x${window.screen.height}`,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        memoryInfo: (performance as any).memory ? {
          jsHeapSizeLimit: formatBytes((performance as any).memory.jsHeapSizeLimit),
          totalJSHeapSize: formatBytes((performance as any).memory.totalJSHeapSize),
          usedJSHeapSize: formatBytes((performance as any).memory.usedJSHeapSize)
        } : 'Not available'
      };
    }
    
    // Get server information
    fetch('/debug-api/info')
      .then(res => res.json())
      .catch(() => ({}))
      .then(data => {
        serverInfo = data || {};
      });
  });
  
  function toggleApiLogging(enabled: boolean) {
    if (enabled) {
      ApiLogger.enable();
    } else {
      ApiLogger.disable();
    }
    apiLoggingEnabled.set(enabled);
  }
  
  function formatBytes(bytes: number, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
  
  function clearLocalStorage() {
    if (browser && window.confirm('Are you sure you want to clear local storage?')) {
      localStorage.clear();
      window.location.reload();
    }
  }
  
  function clearSessionStorage() {
    if (browser && window.confirm('Are you sure you want to clear session storage?')) {
      sessionStorage.clear();
      window.location.reload();
    }
  }
</script>

<div class="fixed bottom-4 right-4 z-50">
  <Button variant="outline" size="sm" onclick={() => isOpen.set(true)}>
    Debug
  </Button>
</div>

<Drawer open={$isOpen} onOpenChange={(open) => isOpen.set(open)}>
  <DrawerContent side="bottom">
    <DrawerHeader>
      <DrawerTitle>Debug Panel</DrawerTitle>
      <DrawerDescription>
        Tools to help debug the application
      </DrawerDescription>
    </DrawerHeader>
    
    <div class="px-4 py-2">
      <div class="space-y-4">
        <div class="flex items-center space-x-2">
          <Switch id="api-logging" 
            checked={$apiLoggingEnabled} 
            onCheckedChange={toggleApiLogging} 
          />
          <Label for="api-logging">API Request/Response Logging</Label>
        </div>
        
        <div class="flex items-center space-x-2">
          <Switch id="debug-info" 
            checked={$showDebugInfo} 
            onCheckedChange={(val) => showDebugInfo.set(val)} 
          />
          <Label for="debug-info">Show Debug Information</Label>
        </div>
        
        {#if $showDebugInfo}
          <div class="border rounded-md p-4 space-y-4">
            <h3 class="font-medium text-sm">Client Information</h3>
            <pre class="text-xs bg-muted p-2 rounded overflow-auto max-h-40">{JSON.stringify(clientInfo, null, 2)}</pre>
            
            <h3 class="font-medium text-sm">Server Information</h3>
            <pre class="text-xs bg-muted p-2 rounded overflow-auto max-h-40">{JSON.stringify(serverInfo, null, 2)}</pre>
          </div>
        {/if}
        
        <div class="border rounded-md p-4 space-y-2">
          <h3 class="font-medium text-sm">Actions</h3>
          <div class="flex flex-wrap gap-2">
            <Button variant="destructive" size="sm" onclick={clearLocalStorage}>
              Clear LocalStorage
            </Button>
            <Button variant="destructive" size="sm" onclick={clearSessionStorage}>
              Clear SessionStorage
            </Button>
            <Button variant="outline" size="sm" onclick={() => window.location.reload()}>
              Reload Page
            </Button>
          </div>
        </div>
      </div>
    </div>
    
    <DrawerFooter>
      <DrawerClose asChild>
        <Button variant="outline">Close</Button>
      </DrawerClose>
    </DrawerFooter>
  </DrawerContent>
</Drawer>
