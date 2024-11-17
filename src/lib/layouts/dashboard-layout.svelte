<script lang="ts">
    import { username } from '$lib/stores/auth.store';
    import { Button } from "$lib/components/ui/button";
    import { page } from '$app/stores';
    import { Bell, ChevronDown, ChevronRight, Home, Search, Settings, HelpCircle } from 'lucide-svelte'
    import AlignJustify from 'lucide-svelte/icons/align-justify';
    import Menu from "lucide-svelte/icons/menu";
    import Users from "lucide-svelte/icons/users";
  
    import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
    import { setMode } from "mode-watcher";
    import { writable } from 'svelte/store';
    
    let isSidebarOpen = true
    let currentTime = new Date().toLocaleString()
    
    const toggleSidebar = () => {
      isSidebarOpen = !isSidebarOpen
    }
    
    const navigationItems = [
      { label: 'Dashboard', icon: Home, href: '/' },
      { label: 'Overview', icon: Search, href: '#' },
    ]
    
    const investigationItems = [
      { label: 'Case', icon: Search, href: '#', active: true },
      { label: 'Alerts', icon: Bell, href: '#' },
      { label: 'Search', icon: Search, href: '#' },
      { label: 'Activities', icon: Bell, href: '#' },
      { label: 'DIM Tasks', icon: Settings, href: '#' }
    ]
    
    const manageItems = [
      { label: 'Manage cases', icon: Settings, href: '#' },
      { label: 'Advanced', icon: Settings, href: '#' },
      { label: 'Help', icon: Search, href: '#' }
    ]

    const advancedItems = [
        { href: '/settings', label: 'Settings', icon: Settings },
        { href: '/users', label: 'Users', icon: Users }
    ];

    let isAdvancedOpen = false;

    function toggleAdvanced() {
        isAdvancedOpen = !isAdvancedOpen;
    }

    const isRouteActive = (href: string) => {
        return $page.url.pathname.startsWith(href);
    };

    let uiMode = writable('Light');
    const switchMode = () => {
        uiMode.update(mode => {
            const newMode = mode === 'Light' ? 'Dark' : 'Light';
            setMode(newMode.toLowerCase() as 'dark' | 'light');
            return newMode;
        });
    }
  </script>
  
  
  <div class="flex min-h-screen">
    <div class={`sticky top-0 h-screen transition-all duration-300 hidden md:block
        ${isSidebarOpen ? 'basis-[200px]' : 'basis-[70px]'}`}>
    
        <div class="flex flex-col">
            <div class="flex h-14 items-center px-6 bg-primary-gradient">
                <a href="/" class={`flex items-center gap-2 font-semibold ${isSidebarOpen ? 'opacity-100' : 'opacity-0 hidden'}`}>
                    <div class="flex items-center gap-2">
                        <img 
                            src="/logo/logo-white.png" 
                            alt="IRIS Logo" 
                            class={`transition-all duration-300 
                                ${isSidebarOpen ? 'w-[120px]' : 'w-[30px]'}`}
                        />
                    </div>
                </a>
                <Button variant="ghost" size="icon" class="ml-auto text-slate-50" on:click={toggleSidebar}>
                    <AlignJustify class="h-6 w-6" />
                </Button>
            </div>
        </div>
        <div class="py-4  border-r">
            <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild let:builder>
                    <Button variant="transparent" class="w-full justify-center gap-3" builders={[builder]}>
                        <div class="flex items-center gap-3">
                            <!-- Avatar Circle -->
                            <div class="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground">
                                {$username ? $username[0].toUpperCase() : 'U'}
                            </div>
                            
                            <!-- Username - hidden when collapsed -->
                            <span class={`transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 hidden'}`}>
                                {$username}
                            </span>
                        </div>
                    </Button>
                </DropdownMenu.Trigger>
                <!-- Rest of dropdown content stays the same -->
                <DropdownMenu.Content>
                    <DropdownMenu.Item on:click={() => switchMode()}>
                        {$uiMode === 'Light' ? 'Dark' : 'Light'} mode
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator />
                    <DropdownMenu.Item>
                        <Users class="mr-2 h-4 w-4" />
                        Profile
                    </DropdownMenu.Item>
                    <DropdownMenu.Item>
                        <Settings class="mr-2 h-4 w-4" />
                        Settings
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator />
                    <DropdownMenu.Item>
                        Log out
                    </DropdownMenu.Item>
                </DropdownMenu.Content>
            </DropdownMenu.Root>
        </div>
        <nav class="flex-grow grid gap-4 p-4 border-r">
            <div class="grid gap-1 py-2">
                {#each navigationItems as item}
                    <a
                        href={item.href}
                        class={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors
                            ${isRouteActive(item.href) 
                                ? 'bg-muted text-primary' 
                                : 'text-muted-foreground hover:bg-muted hover:text-primary'}`}
                    >
                        <svelte:component 
                            this={item.icon} 
                            class={`h-4 w-4 ${isRouteActive(item.href) ? 'text-primary' : ''}`} 
                        />
                        <span class={`transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 hidden'}`}>
                            {item.label}
                        </span>
                    </a>
                {/each}
            </div>

            <!-- Update investigation section -->
            <div class="py-4">
                <h4 class={`mb-1 px-2 text-sm font-semibold transition-opacity duration-300 
                    ${isSidebarOpen ? 'opacity-100' : 'opacity-0 hidden'}`}>
                    INVESTIGATION
                </h4>
                <div class="grid gap-1">
                    {#each investigationItems as item}
                        <a
                            href={item.href}
                            class="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground hover:bg-muted hover:text-primary transition-colors"
                        >
                            <svelte:component this={item.icon} class="h-4 w-4" />
                            <span class={`transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 hidden'}`}>
                                {item.label}
                            </span>
                        </a>
                    {/each}
                </div>
            </div>
            <div>
                <h4 class={`mb-1 px-2 text-sm font-semibold transition-opacity duration-300 
                    ${isSidebarOpen ? 'opacity-100' : 'opacity-0 hidden'}`}>
                    MANAGEMENT
                </h4>
                <button
                    class={`flex items-center justify-between w-full rounded-lg px-3 py-2 text-muted-foreground hover:bg-muted hover:text-primary transition-colors`}
                    on:click={toggleAdvanced}
                >
                    <div class="flex items-center gap-3">
                        <Settings class="h-4 w-4" />
                        <span class={`transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 hidden'}`}>
                            Advanced
                        </span>
                    </div>
                    {#if isSidebarOpen}
                        <svelte:component this={isAdvancedOpen ? ChevronDown : ChevronRight} class="h-4 w-4" />
                    {/if}
                </button>
                {#if isAdvancedOpen && isSidebarOpen}
                    <div class="grid gap-1 pl-6 mt-1">
                        {#each advancedItems as item}
                            <a
                                href={item.href}
                                class={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors
                                    ${isRouteActive(item.href) 
                                        ? 'bg-muted text-primary' 
                                        : 'text-muted-foreground hover:bg-muted hover:text-primary'}`}
                            >
                                <svelte:component 
                                    this={item.icon} 
                                    class={`h-4 w-4 ${isRouteActive(item.href) ? 'text-primary' : ''}`} 
                                />
                                <span class="transition-opacity duration-300">
                                    {item.label}
                                </span>
                            </a>
                        {/each}
                    </div>
                {/if}
                <button class="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground hover:bg-muted hover:text-primary transition-colors">
                    <HelpCircle class="h-4 w-4" />                        
                    <span class={`transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 hidden'}`}>
                        Help
                    </span>
            </div>
        </nav>
    </div>
    <div class="flex-1 flex flex-col h-screen">
        <header class="sticky top-0 z-50 border-b bg-primary-gradient backdrop-blur text-slate-50">

            <div class="flex h-14 items-center px-6">
                <Button variant="ghost" size="icon" class="md:hidden" on:click={toggleSidebar}>
                    <Menu class="h-5 w-5" />
                </Button>
                
                <div class="flex flex-1 items-center justify-between">
                    <h2 class="text-lg">Dashboard</h2>
                    
                </div>
            </div>
        </header>
        <main class="flex-1 overflow-y-auto p-6 bg-muted/40">
            <slot />
        </main>
    </div>
  </div>
  
  <style>
    :root {
        --sidebar-width: 280px;
    }
    :root[data-sidebar-collapsed="true"] {
        --sidebar-width: 70px;
    }
</style>