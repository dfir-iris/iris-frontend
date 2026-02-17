<script lang="ts">
	import { renderComponent, type ColumnDef } from '@tanstack/svelte-table';
	import { getContext, onMount } from 'svelte';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import {
		AccessLevel,
		CaseAccessService,
		type CaseAccessEntry
	} from '$lib/services/case-access.service';
	import type { RequestResponse } from '$lib/services/api.service';
	import { UsersService, type User } from '$lib/services/users.service';
	import DataTable from '$lib/components/ui/data-table-tanstack/data-table.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import SearchSelect, {
		type SearchSelectProps
	} from '$lib/components/common/selects/SearchSelect.svelte';
	import type { Access, CaseAccessProps } from './types';
	import { ACCESS_OPTIONS } from './consts';
	import CaseAccessGroup from './CaseAccessGroup.svelte';

	const columns: ColumnDef<unknown>[] = [
		{
			id: 'user_id',
			header: () => 'User ID',
			accessorKey: 'user.user_id'
		},
		{
			id: 'user_name',
			header: 'User Name',
			accessorKey: 'user.user_name'
		},
		{
			id: 'user_login',
			header: 'User Login',
			accessorKey: 'user.user_login'
		},
		{
			id: 'access_select',
			header: 'User Access',
			cell: (cell) =>
				renderComponent(SearchSelect, {
					value: String(
						(cell.row?.original as { access: Access | null }).access?.level ?? AccessLevel.DENY_ALL
					),
					options: ACCESS_OPTIONS,
					onChange: (value) => {
						const user_id = (cell.row?.original as { user: User }).user.user_id;
						const access_level = Number(value);

						usersAccess = usersAccess.map((userAccess) =>
							userAccess.user.user_id === user_id
								? {
										...userAccess,
										access: {
											name:
												ACCESS_OPTIONS.find((option) => Number(option.value) === access_level)
													?.label ?? 'Unkown',
											level: access_level
										}
									}
								: userAccess
						);

						CaseAccessService.setUserCasesAccess(user_id, {
							cases_list: [currentCaseId],
							access_level
						});
					}
				} as SearchSelectProps)
		}
	];

	let { onDelete, onClose }: CaseAccessProps = $props();

	const cases = getContext<CasesContext>(CASES_CTX);
	const currentCaseId = cases.currentCaseId();

	let usersAccess = $state<Array<{ user: User; access: Access | null }>>([]);
	let setAccessViaGroup = $state(false);
	let groupIds = $state<string[]>([]);
	let groupAccess = $state<string>('');

	const saveAccessViaGroup = async () => {
		await Promise.all(
			groupIds.map(async (groupId) => {
				console.log('group:', groupId);
				CaseAccessService.setGroupCasesAccess(Number(groupId), {
					cases_list: [currentCaseId],
					access_level: Number(groupAccess)
				});
			})
		);

		await refresh();

		setAccessViaGroup = false;
	};

	const refresh = async () => {
		const usersResponse = (await UsersService.list()).data as unknown as RequestResponse<User[]>;
		const users = usersResponse.data as User[];

		const rows: Array<{ user: User; access: Access | null }> = [];

		for (const user of users) {
			const caseAccessResponse = (await CaseAccessService.listUserCasesAccess(user.user_id))
				.data as unknown as RequestResponse<CaseAccessEntry[]>;

			const caseAccess = caseAccessResponse.data as CaseAccessEntry[];

			const currentCaseAccess =
				caseAccess?.find((e) => Number(e.case_id) === Number(currentCaseId)) ?? null;

			if (currentCaseAccess) {
				const name =
					currentCaseAccess?.access_level_list?.[0]?.name ??
					`level_${currentCaseAccess.access_level}`;

				rows.push({
					user,
					access: {
						name,
						level: currentCaseAccess.access_level
					}
				});
			} else {
				rows.push({ user, access: null });
			}
		}

		usersAccess = rows;
	};

	onMount(() => refresh());
</script>

<div class="flex flex-col overflow-hidden bg-card">
	<div class="my-4 mb-6 flex items-center justify-between">
		<div class="flex text-3xl font-bold">Case access</div>

		{#if !setAccessViaGroup}
			<div class="flex gap-6">
				<Button onclick={() => (setAccessViaGroup = true)}>Set access via group</Button>
				<Button onclick={() => refresh()}>Refresh</Button>
			</div>
		{/if}
	</div>

	{#if setAccessViaGroup}
		<CaseAccessGroup bind:groupIds bind:access={groupAccess} />
	{:else}
		<DataTable {columns} data={usersAccess} page={1} />
	{/if}
</div>

<div class="flex">
	<div class="mt-8 flex grow gap-6">
		<Button variant="destructive" onclick={onDelete}>Delete case</Button>
		<Button variant="secondary" onclick={onClose}>Close case</Button>
	</div>

	{#if setAccessViaGroup}
		<div class="mt-8 flex justify-end gap-6">
			<Button variant="destructive" onclick={() => saveAccessViaGroup()}>
				Set Access Via Group
			</Button>

			<Button variant="secondary" onclick={() => (setAccessViaGroup = false)}>Cancel</Button>
		</div>
	{/if}
</div>
