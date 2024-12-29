import { ENDPOINTS } from '$lib/constants/endpoints';
import { ApiService } from '$lib/services/api.service';
import type { LayoutData } from './$types';
import type { Paginated } from '$lib/services/api.service';
import type { NoteFolder } from '$lib/types/resources/note';

export const load = (async ({ params }) => {
  return {
    notes: await ApiService.get<Paginated<NoteFolder>>(ENDPOINTS.case.notes.list(params.case_id))
  };
}) satisfies LayoutData;