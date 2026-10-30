<!--
  Inline creation of an asset or an IOC from the graph. On success the new
  object's node key (`asset:<id>` / `ioc:<id>`) is handed to `onCreated`.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { CaseAssetsService } from '$lib/services/case-assets.service';
	import { CaseIocsService } from '$lib/services/case-iocs.service';
	import { detectIocType } from '$lib/utils/ioc-type-detect';
	import { apiErrorMessage } from '$lib/utils/error-handler';
	import type { GraphReferenceData } from '../lib/reference-data.svelte';

	interface Props {
		caseId: number;
		kind: 'asset' | 'ioc';
		refs: GraphReferenceData;
		/** Pre-filled name / value (the picker search text). */
		initial?: string;
		onCreated: (key: string) => void | Promise<void>;
		onCancel?: () => void;
	}

	let { caseId, kind, refs, initial = '', onCreated, onCancel }: Props = $props();

	let name = $state('');
	let typeId = $state<number | null>(null);
	let ip = $state('');
	let tlpId = $state<number | null>(null);
	let description = $state('');
	let tags = $state('');
	let typeTouched = $state(false);
	let saving = $state(false);
	let error = $state<string | null>(null);

	onMount(() => {
		name = initial;
		void refs.ensureObjectTypes();
	});

	// IOC type follows the value until the user picks one by hand.
	$effect(() => {
		if (kind !== 'ioc' || typeTouched || !refs.iocTypes.length) return;
		const detected = name.trim() ? detectIocType(name.trim(), refs.iocTypes) : null;
		if (detected) typeId = detected.type_id;
	});

	$effect(() => {
		if (tlpId === null && refs.defaultTlpId !== null) tlpId = refs.defaultTlpId;
	});

	const valid = $derived(!!name.trim() && typeId !== null && (kind === 'asset' || tlpId !== null));

	const submit = async (e: SubmitEvent) => {
		e.preventDefault();
		if (!valid || saving) return;
		saving = true;
		error = null;
		try {
			if (kind === 'asset') {
				const res = await CaseAssetsService.create(caseId, {
					asset_name: name.trim(),
					asset_type_id: typeId as number,
					asset_ip: ip.trim() || undefined,
					asset_description: description.trim() || undefined,
					asset_tags: tags.trim() || undefined
				});
				const id = res.ok && res.data && typeof res.data === 'object' ? res.data.asset_id : null;
				if (!id) throw new Error(apiErrorMessage(res, 'Could not create the asset.'));
				await onCreated(`asset:${id}`);
			} else {
				const res = await CaseIocsService.create(caseId, {
					ioc_value: name.trim(),
					ioc_type_id: typeId as number,
					ioc_tlp_id: tlpId as number,
					ioc_description: description.trim(),
					ioc_tags: tags.trim()
				});
				const id = res.ok && res.data && typeof res.data === 'object' ? res.data.ioc_id : null;
				if (!id) throw new Error(apiErrorMessage(res, 'Could not create the IOC.'));
				await onCreated(`ioc:${id}`);
			}
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			saving = false;
		}
	};

	const selectClass =
		'h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
</script>

<form class="space-y-3" onsubmit={submit}>
	<label class="block space-y-1 text-xs font-medium">
		<span>{kind === 'asset' ? 'Asset name' : 'IOC value'}</span>
		<Input bind:value={name} required placeholder={kind === 'asset' ? 'DC01' : '203.0.113.7'} />
	</label>
	<div class="grid grid-cols-2 gap-2">
		<label class="block space-y-1 text-xs font-medium">
			<span>Type</span>
			{#if kind === 'asset'}
				<select class={selectClass} bind:value={typeId} required>
					<option value={null} disabled>Select…</option>
					{#each refs.assetTypes as t (t.asset_id)}
						<option value={t.asset_id}>{t.asset_name}</option>
					{/each}
				</select>
			{:else}
				<select
					class={selectClass}
					bind:value={typeId}
					required
					onchange={() => (typeTouched = true)}
				>
					<option value={null} disabled>Select…</option>
					{#each refs.iocTypes as t (t.type_id)}
						<option value={t.type_id}>{t.type_name}</option>
					{/each}
				</select>
			{/if}
		</label>
		{#if kind === 'asset'}
			<label class="block space-y-1 text-xs font-medium">
				<span>IP</span>
				<Input bind:value={ip} placeholder="10.0.0.5" />
			</label>
		{:else}
			<label class="block space-y-1 text-xs font-medium">
				<span>TLP</span>
				<select class={selectClass} bind:value={tlpId} required>
					{#each refs.tlps as t (t.tlp_id)}
						<option value={t.tlp_id}>{t.tlp_name}</option>
					{/each}
				</select>
			</label>
		{/if}
	</div>
	<label class="block space-y-1 text-xs font-medium">
		<span>Tags <span class="font-normal text-muted-foreground">(comma separated)</span></span>
		<Input bind:value={tags} />
	</label>
	<label class="block space-y-1 text-xs font-medium">
		<span>Description</span>
		<Textarea bind:value={description} rows={2} />
	</label>
	{#if error}
		<p class="text-xs text-destructive" role="alert">{error}</p>
	{/if}
	<div class="flex justify-end gap-2">
		{#if onCancel}
			<Button type="button" variant="ghost" size="sm" onclick={onCancel}>Back</Button>
		{/if}
		<Button type="submit" size="sm" disabled={!valid || saving}>
			{saving ? 'Creating…' : kind === 'asset' ? 'Create asset' : 'Create IOC'}
		</Button>
	</div>
</form>
