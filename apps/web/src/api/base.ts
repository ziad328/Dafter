import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

/** Endpoints are injected by the generated file; never add them by hand. */
export const baseApi = createApi({
  // Empty in local dev: Vite proxies /api and /health to the API, so no CORS is needed.
  baseQuery: fetchBaseQuery({ baseUrl: import.meta.env.VITE_API_URL ?? '' }),
  endpoints: () => ({}),
});
