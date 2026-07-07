import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse, Paginated } from './api.service';
import type { UserInfo } from './auth.service';

export type CommentIdentifier = number;
export type CommentObjectType =
	| 'alerts'
	| 'assets'
	| 'events'
	| 'evidences'
	| 'alert_clusters'
	| 'iocs'
	| 'notes'
	| 'tasks';

export interface ListCommentsParams {
	page?: number;
	per_page?: number;
}

export interface CreateCommentBody {
	comment_text: string;
}

export interface UpdateCommentBody {
	comment_text: string;
}

export interface Comment {
	comment_id: number;
	comment_text: string;
	comment_date: string;
	comment_update_date: string;
	comment_uuid: string;
	name: string;
	user: UserInfo;
}

export class CommentsService {
	static async list(
		objectType: CommentObjectType,
		objectId: number,
		params: ListCommentsParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<Paginated<Comment>>> {
		const path = ApiService.withQuery(
			`/api/v2/${objectType}/${objectId}/comments`,
			params as Record<string, unknown>
		);

		return ApiService.get<Paginated<Comment>>(path, options);
	}

	static async get(
		objectType: CommentObjectType,
		objectId: number,
		commentId: CommentIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<Comment>> {
		return ApiService.get<Comment>(
			`/api/v2/${objectType}/${objectId}/comments/${commentId}`,
			options
		);
	}

	static async create(
		objectType: CommentObjectType,
		objectId: number,
		body: CreateCommentBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<Comment>> {
		return ApiService.post<Comment>(`/api/v2/${objectType}/${objectId}/comments`, body, options);
	}

	static async update(
		objectType: CommentObjectType,
		objectId: number,
		commentId: CommentIdentifier,
		body: UpdateCommentBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<Comment>> {
		return ApiService.put<Comment>(
			`/api/v2/${objectType}/${objectId}/comments/${commentId}`,
			body,
			options
		);
	}

	static async remove(
		objectType: CommentObjectType,
		objectId: number,
		commentId: CommentIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(
			`/api/v2/${objectType}/${objectId}/comments/${commentId}`,
			options
		);
	}
}
