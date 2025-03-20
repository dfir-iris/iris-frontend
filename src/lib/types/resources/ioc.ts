export interface IOCType {
  type_id: number;
  type_name: string;
  type_description: string;
  type_taxonomy: string | null;
  type_validation_regex: string | null;
  type_validation_expect: string | null;
}

export interface TLP {
  tlp_id: number;
  tlp_name: string;
  tlp_bscolor: string;
}

export interface IOC {
  ioc_id: number;
  ioc_uuid: string;
  ioc_value: string;
  ioc_type_id: number;
  ioc_type: IOCType;
  ioc_description: string;
  ioc_tags: string;
  ioc_tlp_id: number;
  tlp: TLP;
  user_id: number;
  ioc_misp: any | null;
  ioc_enrichment: any | null;
  link: any[];
  custom_attributes: Record<string, any>;
  modification_history: Record<string, any> | null;
  case_id: number;
}