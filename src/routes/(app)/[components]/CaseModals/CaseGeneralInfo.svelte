<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import type { Case } from '$lib/types/resources/case';
	import type { RequestResponse } from '$lib/services/api.service';
	import { type User, UsersService } from '$lib/services/users.service';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import { TagDisplay } from '$lib/components/common/tag';

	const cases = getContext<CasesContext>(CASES_CTX);
	const currentCase = $derived<Case | null>(cases.currentCase() ?? null);

	let openingUser = $state<User>();

	onMount(async () => {
		if (currentCase?.user_id) {
			const res = (await UsersService.get(currentCase.user_id)).data as unknown as RequestResponse<User>;
			openingUser = res.data as User;
		}
	});

	// The /api/v2/cases response returns tags as objects but without a stable
	// tag_id (sometimes just `id`, sometimes missing entirely). Flatten to a
	// CSV string and let TagDisplay's stringToTags normalize it — that path
	// generates synthetic negative tag_ids and guarantees unique keys.
	const tagsCsv = $derived(
		(currentCase?.tags ?? [])
			.map((t) => (typeof t === 'string' ? t : t.tag_title))
			.filter(Boolean)
			.join(',')
	);
	const hasTags = $derived(tagsCsv.length > 0);
</script>

<dl class="grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
	{#snippet row(label: string, value: unknown)}
		{#if value !== null && value !== undefined && value !== ''}
			<div class="flex items-baseline gap-2 border-b border-border/40 py-1.5">
				<dt class="w-28 shrink-0 text-muted-foreground">{label}</dt>
				<dd class="min-w-0 flex-1 truncate text-foreground" title={String(value)}>
					{value}
				</dd>
			</div>
		{/if}
	{/snippet}

	{@render row('Case name', currentCase?.case_name)}
	{@render row('Customer', currentCase?.case_customer?.customer_name)}
	{@render row('Case ID', currentCase?.case_id)}
	{@render row('SOC ID', currentCase?.case_soc_id)}
	{@render row('UUID', currentCase?.case_uuid)}
	{@render row('Classification', currentCase?.classification_id)}
	{@render row('State', currentCase?.state?.state_name)}
	{@render row('Severity', currentCase?.severity?.severity_name)}
	{@render row('Open date', currentCase?.open_date)}
	{@render row('Opening user', openingUser?.user_name)}
	{@render row('Owner', currentCase?.owner?.user_name)}

	{#if hasTags}
		<div class="flex items-baseline gap-2 border-b border-border/40 py-1.5 sm:col-span-2">
			<dt class="w-28 shrink-0 text-muted-foreground">Tags</dt>
			<dd class="min-w-0 flex-1">
				<TagDisplay tags={tagsCsv} size="small" />
			</dd>
		</div>
	{/if}
</dl>
