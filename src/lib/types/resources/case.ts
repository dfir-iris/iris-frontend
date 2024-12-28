import type { UserInfo } from "$lib/stores/auth.store"

export interface Case {
  /** Identifiers */

  case_id: number
  case_uuid: string
  case_soc_id: string

  /** Meta */

  /** Case name */
  name: string

  /** Case description */
  description: string
  case_customer: number
  client_id: number

  /** User references */

  user_id: number | null
  user: UserInfo
  owner_id: number | null
  owner: UserInfo

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