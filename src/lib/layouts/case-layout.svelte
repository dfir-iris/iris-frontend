<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import * as Resizable  from "$lib/components/ui/resizable";
    import { 
		PlusIcon,
		NotepadTextIcon,
		ClipboardListIcon,
		RouterIcon,
		FlagIcon} from 'lucide-svelte'
    import { ScrollArea } from "$lib/components/ui/scroll-area";


	import {
		DropdownMenu,
		DropdownMenuItem,
		DropdownMenuTrigger,
		DropdownMenuContent,
		DropdownMenuLabel
	} from '$lib/components/ui/dropdown-menu';
    import { setMode } from "mode-watcher";
    import { writable } from 'svelte/store';
    import { investigationRoutes, followRoutes } from "$lib/constants/routes";
    import Nav from '$lib/layouts/nav-layout.svelte';
    import type { LayoutData } from './$types';
	import type { Snippet } from 'svelte';
	import CaseSwitcher from './case-switcher.svelte';


    let { data, children }: { data: LayoutData; children: Snippet } = $props();

    
    //let isSidebarOpen = true
    let currentTime = new Date().toLocaleString()

    let defaultLayout = [80, 1000];
	let defaultCollapsed = false;
	let navCollapsedSize:5;

	let isCollapsed = $state(defaultCollapsed);

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
  

  <div class="hidden md:block">
	<Resizable.PaneGroup
		direction="horizontal"
		{onLayoutChange}
		class="items-stretch"
	>
		<Resizable.Pane
			defaultSize={defaultLayout[0]}
			collapsedSize={navCollapsedSize}
			collapsible
			minSize={7}
			maxSize={20}
			{onCollapse}
			{onExpand}
            class="bg-muted/40 rounded-r-lg"
		>
            <div class="mt-4 mb-2 px-4 text-lg font-semibold tracking-tight">
                <DropdownMenu>
                    <DropdownMenuTrigger class="w-fit">
                        <Button variant="outline" class="!px-3 py-4">
                            <PlusIcon size={22} /> Add item
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent class="w-56 shadow" align="end" side="left">
                        <DropdownMenuLabel>What do you want to add?</DropdownMenuLabel>
                        <DropdownMenuItem>
                            <NotepadTextIcon size={20}></NotepadTextIcon>
                            <span>Note</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                            <ClipboardListIcon size={20}></ClipboardListIcon>
                            <span>Task</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                            <RouterIcon size={20}></RouterIcon>
                            <span>Asset</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                            <FlagIcon size={20}></FlagIcon>
                            <span>Indicator</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            <h2 class="mt-4 mb-2 px-4 text-lg font-semibold tracking-tight">Investigation</h2>
            <Nav {isCollapsed} routes={investigationRoutes} />

            <h2 class="mt-4 mb-2 px-4 text-lg font-semibold tracking-tight">Tracking</h2>
            <Nav {isCollapsed} routes={followRoutes} />

        </Resizable.Pane>
		<Resizable.Handle withHandle />
		<Resizable.Pane defaultSize={defaultLayout[1]} minSize={10}>
            <div class="flex flex-col items-start gap-y-1 p-4">
                <div class="mb-4 flex w-full flex-row items-center">
                    <div>
                        <h1 class="text-2xl ml-2 font-semibold">{data.case_name}</h1>
                        <p class="text-sm ml-2 text-muted-foreground">Opened on {new Date(data.open_date).toLocaleString()} by {data.owner?.user_name}</p>
                    </div>
    
                    <!-- Add to case control -->
                    <div class="ml-auto">
                        <CaseSwitcher />
                    </div>
                </div>
            </div>
            <ScrollArea class="h-screen">
                <main class="flex-1 p-6">
                    {@render children()}
                </main>
            </ScrollArea>
        </Resizable.Pane>
    </Resizable.PaneGroup>
</div>
    