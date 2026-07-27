/**
 * v2 service for the manual bug-report intake fallback.
 *
 * The dialog prefers to submit via `Sentry.captureFeedback` when
 * the browser SDK is initialised — that path attaches a screenshot
 * and correlates against a synthesized event id. The fallback below
 * is what fires when reporting is disabled or the SDK failed to
 * load; the backend just logs the payload and drops a row in the
 * activity trail.
 *
 * Backend route: `POST /api/v2/bug-reports` (session-authed, rate
 * limited to 5/min/user).
 */
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export interface BugReportBody {
	title: string;
	description: string;
	url?: string;
	user_agent?: string;
	// Server-issued request id from the last failed API call — helps
	// support pair the report with the crash log line.
	request_id?: string;
}

export interface BugReportAck {
	received: boolean;
}

export class BugReportsService {
	static async submit(
		body: BugReportBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<BugReportAck>> {
		return ApiService.post<BugReportAck>('/bug-reports', body, options);
	}
}
