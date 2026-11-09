import type { AdminContext } from "./auth";

/**
 * Standardized result contract returned by all Server Actions.
 */
export type ActionResponse<T = void> =
  | {
      success: true;
      data: T;
      requestId?: string;
      error?: never;
      code?: never;
      fieldErrors?: never;
    }
  | {
      success: false;
      error: string;
      code?: string;
      requestId?: string;
      fieldErrors?: Record<string, string[]>;
      data?: never;
    };

/**
 * Standard pagination query options.
 */
export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

/**
 * Standard paginated response payload.
 */
export interface PaginatedResult<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export type { AdminContext };
