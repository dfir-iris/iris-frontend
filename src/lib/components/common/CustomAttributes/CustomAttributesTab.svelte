<!--
  Drop-in "Custom attributes" tab body for analyst detail views.

  Encapsulates the edit / cancel / save loop so each object type's
  detail view only needs to plug in three things:
    - `objectType`  — one of the eight fixture-seeded types
    - `existing`    — the row's current `custom_attributes` blob
    - `onSave(values)` — callback invoked with the new values map;
                        returns a Promise so we can spin the Save button
                        and surface failures via `throw`.

  Renders NOTHING when the admin hasn't authored any tab/field for
  this object type. The tab trigger in the parent must also be gated
  on `hasCustomAttributes[objectType] === true` from the store, so no
  affordance ever appears without content behind it. This component
  is what fills the tab body once the trigger is visible.

  `canEdit` gates the edit affordance for read-only case access.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components/ui/toast';
	import CustomAttributesSection from './CustomAttributesSection.svelte';
	import {
		ensureHasCustomAttributes,
		hasCustomAttributes
	} from '$lib/stores/custom-attributes.store.svelte';
	import type { CustomAttributeObjectType } from '$lib/services/custom-attributes.service';
	import { onMount } from 'svelte';

	type Props = {
		objectType: CustomAttributeObjectType;
		existing?: Record<string, Record<string, unknown>> | null;
		onSave: (values: Record<string, Record<string, unknown>>) => Promise<void>;
		canEdit?: boolean;
		title?: string;
	};

	let {
		objectType,
		existing = null,
		onSave,
		canEdit = true,
		title = 'Custom attributes'
	}: Props = $props();

	let editing = $state(false);
	let saving = $state(false);
	let values = $state<Record<string, Record<string, unknown>>>({});

	// Ensure the presence map is populated. Parents typically already
	// awaited this to decide whether to render the tab trigger, but
	// this second call is cheap (the schema promise is cached) and
	// keeps this component self-contained.
	onMount(() => {
		void ensureHasCustomAttributes(objectType);
	});

	const configured = $derived(hasCustomAttributes[objectType] === true);

	const startEdit = () => {
		editing = true;
	};

	const cancel = () => {
		editing = false;
	};

	const save = async () => {
		saving = true;
		try {
			await onSave(values);
			toast({ title: `${title} saved`, variant: 'success' });
			editing = false;
		} catch (err) {
			toast({
				title: `Failed to save ${title.toLowerCase()}`,
				description: (err as Error).message,
				variant: 'destructive'
			});
		} finally {
			saving = false;
		}
	};
</script>

{#if configured}
	<div class="flex flex-col gap-3">
		<div class="flex items-center justify-between">
			<div>
				<h3 class="text-sm font-semibold">{title}</h3>
			</div>

			{#if canEdit}
				{#if !editing}
					<Button variant="secondary" size="sm" onclick={startEdit}>Edit</Button>
				{:else}
					<div class="flex gap-2">
						<Button variant="ghost" size="sm" onclick={cancel} disabled={saving}>Cancel</Button>
						<Button size="sm" onclick={save} disabled={saving}>Save</Button>
					</div>
				{/if}
			{/if}
		</div>

		<!--
		  Remount the section when toggling edit mode so it re-seeds from
		  the persisted `existing` (dropping any in-progress edits when
		  Cancel is clicked, picking up server-side merges after Save).
		-->
		{#key editing}
			<CustomAttributesSection {objectType} {existing} bind:values readonly={!editing} noChrome />
		{/key}
	</div>
{/if}
