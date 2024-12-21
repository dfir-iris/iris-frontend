<script lang="ts">
	import { writable, derived } from 'svelte/store';
	import type { PageLoad } from './$types';
	import { Input } from '$lib/components/ui/input';
	import * as Command from '$lib/components/ui/command';
	import { ApiService } from '$lib/services/api.service';
	import * as Popover from '$lib/components/ui/popover';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { CaretSort } from 'svelte-radix';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	type CaseContext = {
		case_id: string;
		name: string;
		customer_name: string;
		close_date: string | null;
		access: string;
	};

	let searchQuery = writable('');
	let showTeamDialog = false;
	let open = false;
	let cases = writable<CaseContext[]>([]);

	export const load: PageLoad = async ({ fetch }) => {
		const casesData = await ApiService.get('/context/search-cases', {}, fetch);
		cases.set(casesData);
		return { cases: casesData };
	};

	async function fetchCases(query = '') {
		try {
			const response = await ApiService.get(`/context/search-cases?q=${query}`);
			cases.set(response.data);
		} catch (error) {
			console.error('Error fetching cases:', error);
		}
	}

	$: $searchQuery, fetchCases($searchQuery);

	function redirectToCase(caseId: string) {
		goto(`/case/${caseId}/overview`);
	}

	function handleCaseSelect(case_data: CaseContext) {
		redirectToCase(case_data.case_id);
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
				class="w-[400px] justify-between"
			>
				<span>Switch case</span>
				<CaretSort class="ml-auto h-4 w-4 shrink-0 opacity-50" />
			</Button>
		</Popover.Trigger>

		<Popover.Content class="w-[400px] p-0">
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
					<Command.Empty>No case selected</Command.Empty>
					{#each $cases as case_data}
						<Command.Item onSelect={() => handleCaseSelect(case_data)}>
							<div>
								<span>
									{case_data.name} - {case_data.customer_name}
								</span>
								<Command.Shortcut>({case_data.close_date ? 'Closed' : 'Open'})</Command.Shortcut>
							</div>
						</Command.Item>
					{/each}
				</Command.List>
			</Command.Root>
		</Popover.Content>
	</Popover.Root>
</Dialog.Root>
