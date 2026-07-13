/**
 * Custom-attribute schema cache — one lookup per object type per
 * session.
 *
 * The schema is admin-authored and rarely changes at runtime, so we
 * fetch it lazily on first use and hold it in module scope. Every
 * detail view that needs to render the "Custom attributes" section
 * calls `loadCustomAttributeSchema('<object_type>')` and re-renders
 * when the promise resolves.
 *
 * `CustomAttributesService.list(objectType)` returns an array — one
 * row per matching `attribute_for`. In practice the fixture-seeded
 * data has exactly one row per object type; if the API ever returns
 * multiple, we merge their tabs into a single schema (last write
 * wins on tab-name collisions, which matches how the legacy renderer
 * behaved when a module added extra tabs on top of the seeded row).
 *
 * On failure we return `{}` — an empty schema — so callers can render
 * a no-op section instead of blocking the detail view.
 */
import {
	CustomAttributesService,
	type CustomAttributeObjectType,
	type CustomAttributeSchema
} from '$lib/services/custom-attributes.service';

const cache = new Map<CustomAttributeObjectType, Promise<CustomAttributeSchema>>();

const mergeRows = (rows: { attribute_content?: CustomAttributeSchema | null }[]): CustomAttributeSchema => {
	const out: CustomAttributeSchema = {};
	for (const row of rows) {
		const content = row.attribute_content ?? {};
		for (const [tab, fields] of Object.entries(content)) {
			out[tab] = { ...(out[tab] ?? {}), ...fields };
		}
	}
	return out;
};

export const loadCustomAttributeSchema = (
	objectType: CustomAttributeObjectType
): Promise<CustomAttributeSchema> => {
	const cached = cache.get(objectType);
	if (cached) return cached;

	const promise = (async () => {
		const res = await CustomAttributesService.list(objectType);
		if (!res.ok || !Array.isArray(res.data)) return {} as CustomAttributeSchema;
		return mergeRows(res.data);
	})();

	cache.set(objectType, promise);
	return promise;
};

/**
 * Drop the cached schema for one object type (or all of them). Called
 * from the admin page after a successful save so the next analyst
 * detail view opens with the fresh schema instead of the stale one
 * captured earlier in the session.
 */
export const invalidateCustomAttributeSchema = (
	objectType?: CustomAttributeObjectType
): void => {
	if (objectType) {
		cache.delete(objectType);
		delete hasCustomAttributes[objectType];
		return;
	}
	cache.clear();
	for (const key of Object.keys(hasCustomAttributes) as CustomAttributeObjectType[]) {
		delete hasCustomAttributes[key];
	}
};

/**
 * Analyst-side helper. Given the admin schema and whatever partial
 * values the object row already has, return a values object that has
 * every schema field pre-populated with either the row's current value
 * or the schema's default. Mutating this object in place (through
 * `CustomAttributeRenderer`'s `values` prop) is what the detail view
 * will PUT back.
 *
 * We do not attempt to reconcile stale tabs/fields on the row that no
 * longer exist in the schema — the backend's `merge_custom_attributes`
 * drops those on write. Rendering-time we simply ignore them.
 */
export const seedCustomAttributeValues = (
	schema: CustomAttributeSchema,
	existing?: Record<string, Record<string, unknown>> | null
): Record<string, Record<string, unknown>> => {
	const values: Record<string, Record<string, unknown>> = {};
	for (const [tab, fields] of Object.entries(schema)) {
		values[tab] = {};
		for (const [fieldName, field] of Object.entries(fields)) {
			const previous = existing?.[tab]?.[fieldName];
			values[tab][fieldName] = previous !== undefined ? previous : field.value;
		}
	}
	return values;
};

/**
 * True if the admin has authored at least one tab+field for this
 * object type. Detail views use this to hide the "Custom attributes"
 * section entirely when the schema is empty rather than rendering an
 * empty placeholder.
 */
export const hasSchemaContent = (schema: CustomAttributeSchema): boolean => {
	for (const tab of Object.values(schema)) {
		if (Object.keys(tab).length > 0) return true;
	}
	return false;
};

/**
 * Reactive presence map — keyed by object type, value is:
 *   • undefined  — not yet loaded (detail view should render nothing)
 *   • false      — loaded, schema is empty (still render nothing)
 *   • true       — loaded, at least one tab+field is configured
 *
 * Detail views read this at the trigger site (`{#if
 * hasCustomAttributes.case === true}<TabsTrigger …/>{/if}`) so we
 * never render a tab that has nothing behind it. Populated by
 * `ensureHasCustomAttributes` — which detail views call inside an
 * `$effect` early in their lifecycle.
 *
 * The map is a Svelte 5 `$state.raw` proxy so components pick up the
 * flip automatically when a load resolves.
 */
export const hasCustomAttributes = $state<{
	[K in CustomAttributeObjectType]?: boolean;
}>({});

/**
 * Kick off a schema load (or use the cached promise) and update
 * `hasCustomAttributes[objectType]` when it resolves. Safe to call
 * many times — the underlying schema fetch is memoised. Also safe
 * to await; returns the resolved schema.
 */
export const ensureHasCustomAttributes = async (
	objectType: CustomAttributeObjectType
): Promise<CustomAttributeSchema> => {
	const schema = await loadCustomAttributeSchema(objectType);
	hasCustomAttributes[objectType] = hasSchemaContent(schema);
	return schema;
};
