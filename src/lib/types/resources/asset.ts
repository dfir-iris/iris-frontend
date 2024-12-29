export interface Asset {
  asset_name: string;
  asset_enrichment: object | null;
  asset_type: {
    asset_name: string;
    asset_description: string;
    asset_icon_compromised: string;
    asset_icon_not_compromised: string;
    asset_id: number;
  };
  alerts: object[];
  analysis_status: {
    id: number;
    name: string;
  };
  asset_id: number;
  asset_uuid: string;
  asset_description: string;
  asset_domain: string;
  asset_ip: string;
  asset_info: string;
  asset_compromise_status_id: number;
  asset_type_id: number;
  asset_tags: string;
  case_id: number;
  date_added: string;
  date_update: string;
  user_id: number;
  analysis_status_id: number;
  custom_attributes: Record<string, Record<string, string>>;
  modification_history: object | null;
  ioc_links: object[] | null;
  link: object[];
}