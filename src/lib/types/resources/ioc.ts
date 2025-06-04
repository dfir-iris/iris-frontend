export interface IocType {
  type_name: string;
  type_description: string;
  type_taxonomy: string | null;
  type_validation_regex: string | null;
  type_validation_expect: string | null;
  type_id: number;
}

export interface Tlp {
  tlp_id: number;
  tlp_name: string;
  tlp_bscolor: string;
}

export interface IocLink {
  case_id: number;
  case_name: string;
  client_name: string;
}

export interface CustomAttributeValue {
  type: string;
  mandatory: boolean;
  value: string | boolean | number | null;
}

export interface CustomAttributes {
  [key: string]: {
    [key: string]: CustomAttributeValue;
  };
}

export interface Ioc {
  ioc_id: number;
  ioc_uuid: string;
  ioc_value: string;
  ioc_type_id: number;
  ioc_type: IocType;
  ioc_tlp_id: number;
  tlp: Tlp;
  ioc_description: string | null;
  ioc_tags: string | null; // Comma-separated string, might be better as string[] post-processing
  user_id: number;
  ioc_misp: any | null; // Define further if structure is known
  ioc_enrichment: Record<string, any> | null;
  link: IocLink[] | null;
  custom_attributes: CustomAttributes | null;
  modification_history: any | null; // Define further if structure is known
  case_id?: number; // Included in the example, seems relevant
}

export interface IocCreate {
  ioc_value: string;
  ioc_type_id: number;
  ioc_tlp_id: number;
  ioc_description?: string;
  ioc_tags?: string; // Or string[] if API supports/expects array
  custom_attributes?: CustomAttributes;
}

export type IocUpdate = Partial<IocCreate> & { ioc_id: number };

export interface IocApiResponse {
  total: number;
  data: Ioc[];
  last_page: number;
  current_page: number;
  next_page: number | null;
}