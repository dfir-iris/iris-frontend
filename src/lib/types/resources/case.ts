interface Owner {
  id: number
  user_name: string
  user_login: string
  user_email: string
}

export interface Case {
  /** Identifiers */

  case_id: number
  case_uuid: string
  case_soc_id: string

  /** Meta */

  case_name: string
  name: string
  case_description: string
  case_customer: number
  customer: string

  /** User references */

  user_id: number | null
  owner: Owner

  /** Review */

  reviewer_id: number | null
  review_status_id: number | null
  review_status: null

  /** Status & classification */

  state: null
  status_id: number
  classification_id: number | null
  severity_id: number | null

  /** Timings */

  open_date: string | null
  close_date: string | null
  closing_note: string | null

  /** Other */

  custom_attributes: object | null
  modification_history: object[] | null
}