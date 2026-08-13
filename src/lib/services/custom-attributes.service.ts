import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

// v2 backend at `/api/v2/manage/custom-attributes` — see
// iris-web/.../blueprints/rest/v2/manage_routes/custom_attributes.py.
// The list endpoint is auth-only (not admin) because analyst detail
// pages need the schema to render the extra tabs; PUT + validate are
// admin-gated (server_administrator).
const BASE = '/manage/custom-attributes';

// Field types the legacy renderer supports. Kept as a union so the
// preview + editor components share exhaustive type-narrowing.
export type CustomAttributeFieldType =
	| 'input_string'
	| 'input_textfield'
	| 'input_checkbox'
	| 'input_select'
	| 'input_date'
	| 'input_datetime'
	| 'raw'
	| 'html';

export interface CustomAttributeField {
	type: CustomAttributeFieldType;
	// `value` is polymorphic (string | boolean | anything for raw/html).
	// The renderer + validator both switch on `type` before touching it.
	value: unknown;
	mandatory?: boolean;
	options?: string[];
}

// A single schema is a two-level dict: tab name -> field name -> field.
export type CustomAttributeSchema = Record<string, Record<string, CustomAttributeField>>;

// One row of the `custom_attribute` table. The object types are
// fixture-seeded — the SPA doesn't create or delete them, only edits.
export type CustomAttributeObjectType =
	| 'case'
	| 'ioc'
	| 'asset'
	| 'task'
	| 'note'
	| 'evidence'
	| 'event'
	| 'client'
	// The customer-bounded registry entry behind Manage ▸ Assets.
	// Distinct from 'asset', which is the per-case observation.
	| 'managed_asset';

export const CUSTOM_ATTRIBUTE_OBJECT_TYPES: CustomAttributeObjectType[] = [
	'case',
	'ioc',
	'asset',
	'task',
	'note',
	'evidence',
	'event',
	'client',
	'managed_asset'
];

export interface CustomAttribute {
	attribute_id: number;
	attribute_display_name: string;
	attribute_description: string;
	attribute_for: CustomAttributeObjectType;
	attribute_content: CustomAttributeSchema;
}

// PUT body. `attribute_content` accepts an object OR a JSON string;
// we always send the parsed object from the SPA. The two overwrite
// flags trigger `update_all_attributes` back-fill on the server:
//   - complete_overwrite: replace the JSON on every existing row wholesale
//   - partial_overwrite:  reset just the tabs/fields present in the
//                          previous schema, then re-apply
//   - neither:            additive merge (safest default)
export interface UpdateCustomAttributeBody {
	attribute_content: CustomAttributeSchema;
	attribute_display_name?: string;
	attribute_description?: string;
	complete_overwrite?: boolean;
	partial_overwrite?: boolean;
}

// /validate response. `logs` is a list of human-readable strings like
// `Tab -> Field of type input_string expects a value of type str` —
// safe to surface 1:1 in the UI.
export interface ValidateCustomAttributeResult {
	ok: boolean;
	logs: string[];
}

export class CustomAttributesService {
	static async list(
		attributeFor?: CustomAttributeObjectType,
		options: ApiOptions = {}
	): Promise<RequestResponse<CustomAttribute[]>> {
		const url = attributeFor
			? ApiService.withQuery(BASE, { attribute_for: attributeFor })
			: BASE;
		return ApiService.get<CustomAttribute[]>(url, options);
	}

	static async get(
		attributeId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<CustomAttribute>> {
		return ApiService.get<CustomAttribute>(`${BASE}/${attributeId}`, options);
	}

	static async update(
		attributeId: number,
		body: UpdateCustomAttributeBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<CustomAttribute>> {
		return ApiService.put<CustomAttribute>(`${BASE}/${attributeId}`, body, options);
	}

	static async validate(
		content: CustomAttributeSchema,
		options: ApiOptions = {}
	): Promise<RequestResponse<ValidateCustomAttributeResult>> {
		return ApiService.post<ValidateCustomAttributeResult>(
			`${BASE}/validate`,
			{ attribute_content: content },
			options
		);
	}
}
