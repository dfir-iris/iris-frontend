<script lang="ts">
	import { RefreshCwIcon, XIcon } from 'lucide-svelte';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';

	export let show = false;
	export let switchCase = () => {};

	$: activeTab = 'case';
</script>

{#if show}
	<div class="fixed left-0 top-0 flex h-screen w-screen">
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div onclick={() => (show = false)} class="flex h-screen grow"></div>
		<div class="flex h-screen w-96 bg-white p-4 shadow-xl dark:bg-black">
			<button onclick={() => (show = false)} class="absolute right-2 top-2 hover:opacity-50">
				<XIcon size="24" />
			</button>

			<Tabs bind:value={activeTab} class="flex w-full flex-col">
				<div class="flex w-full border-b bg-muted/20">
					<TabsList class="h-auto w-full rounded-none border-0 bg-transparent p-0">
						<TabsTrigger
							value="case"
							class="flex items-center gap-2 rounded-none px-6 py-4 transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background/80"
						>
							Case
						</TabsTrigger>
						<TabsTrigger
							value="activities"
							class="flex items-center gap-2 rounded-none px-6 py-4 transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background/80"
						>
							Activities
						</TabsTrigger>
						<TabsTrigger
							value="timTasks"
							class="flex items-center gap-2 rounded-none px-6 py-4 transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background/80"
						>
							DIM Tasks
						</TabsTrigger>
					</TabsList>
				</div>

				<div class="w-full">
					<TabsContent value="case">
						<div class="w-full border-b pb-2 text-lg">Shortcuts</div>

						<button
							onclick={switchCase}
							class="w-full rounded border p-4 transition-all hover:shadow-md"
						>
							<RefreshCwIcon size="36" class="mx-auto mb-2 opacity-50" />
							<span class="text-sm text-red-400">Switch case</span>
						</button>
					</TabsContent>
					<TabsContent value="activities">Activities</TabsContent>
					<TabsContent value="dimTasks">DIM Tasks</TabsContent>
				</div>
			</Tabs>
		</div>
	</div>
{/if}
