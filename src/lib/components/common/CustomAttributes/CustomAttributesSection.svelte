<!--
  One-liner drop-in for analyst detail views.

  Wraps `CustomAttributeRenderer` with the schema loader + values
  seeder so a detail view can add:

      <CustomAttributesSection
          objectType="ioc"
          existing={ioc.custom_attributes}
          bind:values={draft.custom_attributes}
          readonly={!editing}
      />

  Renders nothing when the admin hasn't authored any tab/field for
  this object type — analyst pages then look the same as before the
  feature was enabled. The parent still binds `values` unconditionally
  because Svelte 5 `$bindable` needs a stable target; when the section
  hides itself we simply never mutate the bound value.
-->
<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import CustomAttributeRenderer from './CustomAttributeRenderer.svelte';
	import {
		hasSchemaContent,
		loadCustomAttributeSchema,
		seedCustomAttributeValues
	} from '$lib/stores/custom-attributes.store.svelte';
	import type {
		CustomAttributeObjectType,
		CustomAttributeSchema
	} from '$lib/services/custom-attributes.service';

	type Props = {
		objectType: CustomAttributeObjectType;
		// The row's persisted `custom_attributes` map. May be null on
		// creation or when the row pre-dates a schema change.
		existing?: Record<string, Record<string, unknown>> | null;
		// Round-trip target. When `readonly` is false, the child
		// renderer mutates this in place; the detail view then sends
		// it back to the API on save.
		values?: Record<string, Record<string, unknown>>;
		readonly?: boolean;
		// Optional wrapper chrome. Detail views that already sit inside
		// a bordered card set `noChrome` to skip the outer border.
		noChrome?: boolean;
		title?: string;
	};

	let {
		objectType,
		existing = null,
		values = $bindable({} as Record<string, Record<string, unknown>>),
		readonly = false,
		noChrome = false,
		title = 'Custom attributes'
	}: Props = $props();

	let schema = $state<CustomAttributeSchema>({});
	let loaded = $state(false);

	// Seed the values object once we have the schema. The seeder
	// prefers existing row values over schema defaults so the analyst
	// sees whatever was last persisted. We intentionally read
	// `existing` via `untrack` — the values map is derived from the
	// schema on first mount and from analyst edits after; we do NOT
	// want a downstream mutation of `existing` (unlikely, but possible
	// if the parent reloads the object) to blow away in-progress edits.
	const seed = (nextSchema: CustomAttributeSchema) => {
		const seeded = seedCustomAttributeValues(
			nextSchema,
			untrack(() => existing)
		);
		// Copy into the bound object rather than reassigning: Svelte's
		// $bindable proxy tracks the same object identity so mutating
		// keys in place keeps the parent's reference stable.
		for (const key of Object.keys(values)) delete values[key];
		Object.assign(values, seeded);
	};

	onMount(async () => {
		const next = await loadCustomAttributeSchema(objectType);
		schema = next;
		loaded = true;
		if (hasSchemaContent(next)) seed(next);
	});

	const show = $derived(loaded && hasSchemaContent(schema));
</script>

{#if show}
	{#if noChrome}
		<CustomAttributeRenderer {schema} {values} {readonly} />
	{:else}
		<section class="flex flex-col overflow-hidden rounded-md border">
			<div
				class="border-b bg-muted/30 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
			>
				{title}
			</div>
			<div class="min-h-0">
				<CustomAttributeRenderer {schema} {values} {readonly} />
			</div>
		</section>
	{/if}
{/if}
