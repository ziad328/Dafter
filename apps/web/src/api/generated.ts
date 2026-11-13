import { baseApi as api } from './base';
export const addTagTypes = ['system'] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      getHealth: build.query<GetHealthApiResponse, GetHealthApiArg>({
        query: () => ({ url: `/health` }),
        providesTags: ['system'],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as api };
export type GetHealthApiResponse = /** status 200 The API is up */ HealthResponse;
export type GetHealthApiArg = void;
export type HealthResponse = {
  status: 'ok';
};
export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL';
export type ErrorResponse = {
  code: ErrorCode;
  details?: {
    [key: string]: any;
  };
};
export const { useGetHealthQuery } = injectedRtkApi;
