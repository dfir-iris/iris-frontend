<script lang="ts">
	import { writable, derived } from "svelte/store";
	import type { PageLoad } from './$types';
	import { Input } from "$lib/components/ui/input";
	import * as Command from "$lib/components/ui/command";
	import { ApiService } from "$lib/services/api.service";
	import * as Popover from "$lib/components/ui/popover";
	import * as Dialog from "$lib/components/ui/dialog";
	import { Button } from "$lib/components/ui/button";
	import { CaretSort } from "svelte-radix";

	// Writable stores for the fetched cases and the search query
	let cases = writable([]);
	let searchQuery = writable("");
	let showTeamDialog = false;
	let open = false;


	export const load: PageLoad = async ({ fetch }) => {
		const cases = await ApiService.get("/context/search-cases", {}, fetch);
		return { cases };
	};

	// Fetch cases based on the query
	async function fetchCases(query = "") {
		try {
			const response = await ApiService.get(`/context/search-cases?q=${query}`);
			if (response.ok) {
				const data = await response.json();
				cases.set(data); // Update the store with fetched cases
			} else {
				console.error("Failed to fetch cases");
			}
		} catch (error) {
			console.error("Error fetching cases:", error);
		}
	}

	// Reactive search logic
	$: $searchQuery, fetchCases($searchQuery);

	// Redirect function to case overview
	function redirectToCase(caseId: number) {
		window.location.href = `/case/${caseId}/overview`;
	}
</script>


<Dialog.Root bind:open={showTeamDialog}>
	<Popover.Root bind:open={showTeamDialog}>
		<Popover.Trigger asChild let:builder>
			<Button
				builders={[builder]}
				variant="outline"
				role="combobox"
				aria-expanded={open}
				aria-label="Select a case"
				class="w-[300px] justify-between"
			>
				<span>Select a case...</span>
				<CaretSort class="ml-auto h-4 w-4 shrink-0 opacity-50" />
			</Button>
		</Popover.Trigger>

		<Popover.Content class="w-[300px] p-0">
			<Command.Root>
				<div class="p-2">
					<Input
						type="text"
						placeholder="Search cases..."
						on:input={(e) => searchQuery.set(e.target.value)}
						class="w-full"
					/>
				</div>
				<Command.List>
					<Command.Empty>No cases found.</Command.Empty>
					{#await $cases then caseList}
						{#each caseList as case_data}
							<Command.Item
								onSelect={() => {
									redirectToCase(case_data.case_id);
									closeAndRefocusTrigger(ids.trigger);
								}}
								class="flex justify-between items-center p-2 hover:bg-gray-100 cursor-pointer"
							>
								<div>
									<div class="font-semibold">
										{case_data.name} - {case_data.customer_name}
									</div>
									<div class="text-sm text-gray-500">
										{case_data.close_date ? "Closed" : "Open"} | Access: {case_data.access}
									</div>
								</div>
							</Command.Item>
						{/each}
					{:catch error}
						<p class="text-red-500 p-2">Error loading cases: {error.message}</p>
					{/await}
				</Command.List>
			</Command.Root>
		</Popover.Content>
	</Popover.Root>
</Dialog.Root>