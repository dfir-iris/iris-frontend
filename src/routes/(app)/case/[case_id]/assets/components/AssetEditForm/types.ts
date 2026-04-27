export type AssetEditData = {
	asset_name: string;
	asset_description: string;
	asset_ip: string;
	asset_domain: string;
	asset_type_id?: number;
	analysis_status_id?: number;
	asset_compromise_status_id?: number;
	asset_tags?: string;
};
