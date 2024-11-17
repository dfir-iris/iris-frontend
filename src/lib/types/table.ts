
export interface PageData<T = any> {
    // Current page data items
    items: T[];
    
    // Pagination metadata
    currentPage: number;
    totalPages: number;
    pageSize: number;
    totalItems: number;
    
    // Optional sorting info
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    
    // Optional loading state
    isLoading?: boolean;

    genres: { genreName: string }[];
}