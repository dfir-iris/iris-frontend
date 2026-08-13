/**
 * The customer-bounded asset registry behind Manage ▸ Assets.
 *
 * Mirrors `app/models/managed_assets.py` and the schemas in
 * `app/schema/marshables.py`. One registry entry per
 * `(customer, normalized name, asset type)` — so `SRV-DC01` and
 * `srv-dc01` are a single entry here even though they stay two separate
 * rows inside their individual cases.
 *
 * Every count and timestamp on a registry entry is computed over the
 * sightings the *current viewer* is allowed to open, never the true
 * total. `ManagedAssetScope.restricted` says whether that filtering
 * applied; there is deliberately no per-asset indicator of what was
 * left out, because that would be a one-bit oracle for the existence of
 * investigations the viewer is not cleared for.
 */

export type AssetCriticality = 'critical' | 'high' | 'medium' | 'low' | 'unknown';

export type AssetEnvironment = 'production' | 'staging' | 'development' | 'test' | 'dr' | 'unknown';

/** How the entry got into the registry. */
export type ManagedAssetSource = 'manual' | 'observed' | 'import';

export interface ManagedAssetAssetType {
	asset_id: number;
	asset_name: string;
	asset_description?: string | null;
	asset_icon_compromised?: string | null;
	asset_icon_not_compromised?: string | null;
}

export interface ManagedAssetCustomer {
	customer_id: number;
	customer_name: string;
}

export interface ManagedAsset {
	managed_asset_id: number;
	managed_asset_uuid: string;
	client_id: number;
	asset_type_id: number;
	name: string;
	normalized_name: string;
	description?: string | null;
	criticality: AssetCriticality;
	environment?: AssetEnvironment | null;
	owner?: string | null;
	location?: string | null;
	/** Comma-separated, matching `CaseAssets.asset_tags`. */
	tags?: string | null;
	ip?: string | null;
	domain?: string | null;
	is_active: boolean;
	source: ManagedAssetSource;
	custom_attributes?: Record<string, unknown> | null;
	created_at: string;
	updated_at: string;
	created_by?: number | null;
	updated_by?: number | null;

	asset_type?: ManagedAssetAssetType | null;
	client?: ManagedAssetCustomer | null;

	// Derived, visible-scope only. Present on both the list and the
	// detail response.
	case_sighting_count: number;
	alert_sighting_count: number;
	first_seen_at?: string | null;
	last_seen_at?: string | null;
	compromise_status_id?: number | null;
	/**
	 * Earliest visible sighting marked compromised — "compromised
	 * since", not the instant the flag was set, which nothing records.
	 * Null unless `compromise_status_id` is compromised.
	 */
	compromised_at?: string | null;
	/**
	 * Null on list responses — counting timeline events costs one query
	 * per asset, so the list endpoint does not pay for it.
	 */
	timeline_event_count?: number | null;
}

/**
 * Caller-level disclosure flag carried by every read response. True
 * whenever the viewer is not a server administrator, meaning the
 * derived numbers cover only the cases and alerts they can open.
 */
export interface ManagedAssetScope {
	restricted: boolean;
}

/** A paginated envelope plus the scope flag. */
export interface ManagedAssetPage<T> {
	total: number;
	data: T[];
	last_page: number | null;
	current_page: number;
	next_page: number | null;
	scope: ManagedAssetScope;
}

export interface ManagedAssetDetail extends ManagedAsset {
	scope: ManagedAssetScope;
}

// ---------------------------------------------------------------------------
// Sightings, timeline, audit
// ---------------------------------------------------------------------------

export type SightingKind = 'case' | 'alert';

/** One observation of the asset, in a case or an alert. */
export interface ManagedAssetSighting {
	kind: SightingKind;
	/** Case id or alert id, depending on `kind`. */
	reference_id: number;
	reference_name?: string | null;
	/** The underlying `case_assets` row. */
	observation_id: number;
	compromise_status_id?: number | null;
	observation_description?: string | null;
	observation_tags?: string | null;
	seen_at?: string | null;
}

export interface ManagedAssetTimelineEntry {
	event_id: number;
	event_title?: string | null;
	event_content?: string | null;
	event_date?: string | null;
	event_tz?: string | null;
	event_tags?: string | null;
	event_color?: string | null;
	case_id: number;
	case_name?: string | null;
}

export type ManagedAssetAuditAction = 'create' | 'update' | 'delete' | 'import';

export type ManagedAssetAuditSource = 'ui' | 'api' | 'import';

/** `{"criticality": {"from": "low", "to": "critical"}}` */
export type ManagedAssetChangeSet = Record<string, { from: unknown; to: unknown }>;

export interface ManagedAssetAuditEntry {
	audit_id: number;
	/** Null once the asset itself has been deleted; the entry survives. */
	managed_asset_id?: number | null;
	asset_name_snapshot: string;
	action: ManagedAssetAuditAction;
	changes?: ManagedAssetChangeSet | null;
	user_id?: number | null;
	user_login?: string | null;
	source: ManagedAssetAuditSource;
	occurred_at: string;
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

export interface ManagedAssetFilters {
	client_id?: number[];
	asset_type_id?: number[];
	criticality?: AssetCriticality[];
	environment?: AssetEnvironment[];
	tag?: string[];
	owner?: string;
	search?: string;
	is_active?: boolean;
	has_sightings?: boolean;
	compromised?: boolean;
}

export interface ManagedAssetListParams extends ManagedAssetFilters {
	page?: number;
	per_page?: number;
	order_by?: string;
	sort_dir?: 'asc' | 'desc';
}

export interface CreateManagedAssetBody {
	client_id: number;
	asset_type_id: number;
	name: string;
	description?: string | null;
	criticality?: AssetCriticality;
	environment?: AssetEnvironment | null;
	owner?: string | null;
	location?: string | null;
	tags?: string | null;
	ip?: string | null;
	domain?: string | null;
	is_active?: boolean;
	custom_attributes?: Record<string, unknown> | null;
}

/**
 * `client_id` and `asset_type_id` are absent on purpose: together with
 * the name they form the dedup identity, and the backend strips them
 * from update payloads rather than silently re-homing the asset.
 */
export type UpdateManagedAssetBody = Partial<
	Omit<CreateManagedAssetBody, 'client_id' | 'asset_type_id'>
>;

// ---------------------------------------------------------------------------
// Import / export
// ---------------------------------------------------------------------------

export type TransferFormat = 'csv' | 'json';

export type ImportConflictPolicy = 'skip' | 'update';

export interface ExportManagedAssetsBody {
	format?: TransferFormat;
	filters?: ManagedAssetFilters;
}

/** What the importer would do with one row of the uploaded file. */
export interface ManagedAssetImportRow {
	row: number;
	name?: string | null;
	asset_type?: string | null;
	action: 'create' | 'update' | 'error';
	errors: string[];
}

export interface ManagedAssetImportReport {
	/**
	 * Names the staged upload and is spendable only by its uploader.
	 * Present on the inspect response; absent on apply, which consumes it.
	 */
	staging_token?: string;
	client_id: number;
	format?: TransferFormat;
	total_rows?: number;
	counts?: { create: number; update: number; error: number };
	rows?: ManagedAssetImportRow[];
	/** True when `rows` was truncated for size; `counts` still covers everything. */
	rows_truncated?: boolean;

	// Apply-only.
	created?: number;
	updated?: number;
	skipped?: number;
	unchanged?: number;
	errors?: number;
}

export interface ApplyManagedAssetImportBody {
	staging_token: string;
	on_conflict?: ImportConflictPolicy;
}

export interface ReconcileManagedAssetsResponse {
	created: number;
}
