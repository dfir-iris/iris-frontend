<script lang="ts">
    import { username } from '$lib/stores/auth.store';
    import { Button } from "$lib/components/ui/button";
    import * as Resizable  from "$lib/components/ui/resizable";
    import { page } from '$app/stores';
    import { ChevronDown, ChevronRight,
        Settings, HelpCircle} from 'lucide-svelte'
    import AlignJustify from 'lucide-svelte/icons/align-justify';
    import Users from "lucide-svelte/icons/users";
    import { cn } from "$lib/utils.js";
    import { ScrollArea } from "$lib/components/ui/scroll-area";


    import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
    import { setMode } from "mode-watcher";
    import { writable } from 'svelte/store';
    import { mainRoutes, investigationRoutes, followRoutes, settingsRoutes } from "$lib/constants/routes";
    import Nav from '$lib/layouts/nav-layout.svelte';
    import Separator from '$lib/components/ui/separator/separator.svelte';
    
    //let isSidebarOpen = true
    let currentTime = new Date().toLocaleString()

    $: pageTitle = $page.data.title || 'Dashboard';

    export let defaultLayout = [80, 1000];
	export let defaultCollapsed = false;
	export let navCollapsedSize:5;

	let isCollapsed = defaultCollapsed;

	function onLayoutChange(sizes: number[]) {
		document.cookie = `PaneForge:layout=${JSON.stringify(sizes)}`;
	}

	function onCollapse() {
		isCollapsed = true;
		document.cookie = `PaneForge:collapsed=${true}`;
	}

	function onExpand() {
		isCollapsed = false;
		document.cookie = `PaneForge:collapsed=${false}`;
	}

    // const toggleSidebar = () => {
    //   isSidebarOpen = !isSidebarOpen
    // }
    
    let uiMode = writable('Light');
    const switchMode = () => {
        uiMode.update(mode => {
            const newMode = mode === 'Light' ? 'Dark' : 'Light';
            setMode(newMode.toLowerCase() as 'dark' | 'light');
            return newMode;
        });
    }
  </script>
  
  <header class="sticky top-0 z-50 border-b bg-primary-gradient backdrop-blur text-slate-50">
    <div class="flex items-center">
        <a href="/" >
            <div class="flex items-center gap-2 ml-3">
                <img 
                    src="/logo/logo-white.png" 
                    alt="IRIS Logo" 
                    class={`transition-all duration-300 w-[100px]`}
                />
            </div>
        </a>
        <div class="ml-4">
            <h2 class="text-lg">{pageTitle}</h2>
        </div>
        <div class="ml-auto">
            <DropdownMenu.Root>
                <DropdownMenu.Trigger>
                    <Button variant="ghost" class="w-full justify-center gap-3">
                        <div class="flex items-center gap-3">
                            <!-- Avatar Circle -->
                            <div class="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground">
                                {$username ? $username[0].toUpperCase() : 'U'}
                            </div>
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
    </div>
</header>
  <div class="hidden md:block">
	<Resizable.PaneGroup
		direction="horizontal"
		{onLayoutChange}
		class="items-stretch h-full"
	>
		<Resizable.Pane
			defaultSize={defaultLayout[0]}
			collapsedSize={navCollapsedSize}
			collapsible
			minSize={7}
			maxSize={20}
			{onCollapse}
			{onExpand}
		>
            <h2 class="mt-2 mb-2 px-4 text-lg font-semibold tracking-tight">General</h2>
            <Nav {isCollapsed} routes={mainRoutes} />

            <h2 class="mt-4 mb-2 px-4 text-lg font-semibold tracking-tight">Investigation</h2>
            <Nav {isCollapsed} routes={investigationRoutes} />

            <h2 class="mt-4 mb-2 px-4 text-lg font-semibold tracking-tight">Tracking</h2>
            <Nav {isCollapsed} routes={followRoutes} />

            <h2 class="mt-4 mb-2 px-4 text-lg font-semibold tracking-tight">Settings</h2>
            <Nav {isCollapsed} routes={settingsRoutes} />
        </Resizable.Pane>
		<Resizable.Handle withHandle />
		<Resizable.Pane defaultSize={defaultLayout[1]} minSize={10}>
            <ScrollArea class="h-screen">
                <main class="flex-1 p-6 bg-muted/40">
                    <slot />
                </main>
            </ScrollArea>
        </Resizable.Pane>
    </Resizable.PaneGroup>
</div>
    