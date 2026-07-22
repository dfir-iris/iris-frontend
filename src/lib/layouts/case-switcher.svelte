<script lang="ts">
	import { writable } from 'svelte/store';
	import type { PageLoad } from './$types';
	import { Input } from '$lib/components/ui/input';
	import * as Command from '$lib/components/ui/command';
	import { CaseService } from '$lib/services/case.service';
	import type { Case } from '$lib/types/resources/case';
	import * as Popover from '$lib/components/ui/popover';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';
	import { ChevronsDownUpIcon } from 'lucide-svelte';

	type CaseContext = {
		case_id: number;
		name: string;
		customer_name: string;
		close_date: string | null;
	};

	let searchQuery = writable('');
	let showTeamDialog = false;
	let open = false;
	let cases = writable<CaseContext[]>([]);

	const toCaseContext = (c: Case): CaseContext => ({
		case_id: c.case_id,
		name: c.case_name,
		customer_name: c.case_customer?.customer_name ?? '',
		close_date: c.close_date
	});

	// `RequestResponse.data` is `T | string | null` — narrow to the
	// paginated envelope before touching its `.data` array.
	const extractCases = (data: unknown): Case[] => {
		if (data && typeof data === 'object' && 'data' in data && Array.isArray((data as { data: unknown }).data)) {
			return (data as { data: Case[] }).data;
		}
		return [];
	};

	export const load: PageLoad = async () => {
		const response = await CaseService.list();
		const casesData = extractCases(response.data).map(toCaseContext);
		cases.set(casesData);
		return { cases: casesData };
	};

	async function fetchCases(query = '') {
		const trimmed = query.trim();
		const response = await CaseService.list(
			trimmed === '' ? {} : { quick_search: trimmed }
		);
		if (!response.ok) {
			console.error('Error fetching cases:', response.error?.message);
			return;
		}
		cases.set(extractCases(response.data).map(toCaseContext));
	}

	$: $searchQuery, fetchCases($searchQuery);

	function redirectToCase(caseId: number) {
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
				class="justify-between"
			>
				<span>Switch case</span>
				<ChevronsDownUpIcon class="ml-auto !h-4 !w-4 shrink-0 opacity-50" />
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
