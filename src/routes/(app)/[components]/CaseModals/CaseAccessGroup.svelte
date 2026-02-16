<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import { renderComponent, type ColumnDef } from '@tanstack/svelte-table';
	import { Button } from '$lib/components/ui/button';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import DataTable from '$lib/components/ui/data-table-tanstack/data-table.svelte';
	import type { CaseAccessProps } from './types';
	import { GroupsService, type Group } from '$lib/services/groups.service';
	import type { RequestResponse } from '$lib/services/api.service';
	import { AccessLevel, CaseAccessService } from '$lib/services/case-access.service';
	import SearchSelect, {
		type SearchSelectProps
	} from '$lib/components/common/selects/SearchSelect.svelte';
	import { ACCESS_OPTIONS } from './consts';

	let { onDelete, onClose }: CaseAccessProps = $props();

	const cases = getContext<CasesContext>(CASES_CTX);
	const currentCaseId = cases.currentCaseId();

	const columns: ColumnDef<unknown>[] = [
		{
			id: 'group_id',
			header: () => 'Group ID',
			accessorKey: 'group.group_id'
		},
		{
			id: 'group_name',
			header: 'Group Name',
			accessorKey: 'group.group_name'
		},
		{
			id: 'access_name',
			header: 'User Access',
			cell: (cell) =>
				renderComponent(SearchSelect, {
					value: String(
						(cell.row?.original as { access_level: number }).access_level ?? AccessLevel.DENY_ALL
					),
					options: ACCESS_OPTIONS,
					onChange: (value) => {
						const group_id = (cell.row?.original as { group: Group }).group.group_id;
						const access_level = Number(value);

						groupsAccess = groupsAccess.map((groupAccess) =>
							groupAccess.group.group_id === group_id
								? {
										...groupAccess,
										access: {
											name:
												ACCESS_OPTIONS.find((option) => Number(option.value) === access_level)
													?.label ?? 'Unkown',
											level: access_level
										}
									}
								: groupAccess
						);

						CaseAccessService.setGroupCasesAccess(group_id, {
							cases_list: [currentCaseId],
							access_level,
						}).then(() => refresh());
					}
				} as SearchSelectProps)
		}
	];

	let groupsAccess = $state<Array<{ group: Group; access_level: number }>>([]);

	const refresh = async () => {
		const groupsResponse = (await GroupsService.list()).data as unknown as RequestResponse<Group[]>;
		const groups = groupsResponse.data as Group[];

		const rows: Array<{ group: Group; access_level: number }> = [];

		for (const group of groups) {
			const caseAccessResponse = (await CaseAccessService.listGroupCasesAccess(group.group_id))
				.data as unknown as RequestResponse<unknown>;

			const caseAccess = caseAccessResponse.data as unknown as {
				group_cases_access: {access_level: number, case_id: number}[];
			};

			const access_level = caseAccess.group_cases_access.find(access => access.case_id === currentCaseId)?.access_level ?? 0;

			rows.push({ group, access_level });
		}

		groupsAccess = rows;
	};

	onMount(() => refresh());
</script>

<div class="flex flex-col overflow-hidden bg-card">
	<div class="my-4 mb-6 flex items-center justify-between">
		<div class="flex text-3xl font-bold">Case access</div>

		<div class="flex gap-6">
			<Button onclick={() => refresh()}>Refresh</Button>
		</div>
	</div>

	<DataTable {columns} data={groupsAccess} page={1} />
</div>

<div class="mt-8 flex justify-end gap-6">
	<Button variant="destructive" onclick={onDelete}>Delete case</Button>
	<Button variant="secondary" onclick={onClose}>Close case</Button>
</div>
