import { configureStore } from '@reduxjs/toolkit';
import { api } from './api/generated';

// Saving a group regenerates its sessions on the server, so the timetable must refetch too.
api.enhanceEndpoints({
  endpoints: {
    createGroup: { invalidatesTags: ['groups', 'sessions'] },
    updateGroup: { invalidatesTags: ['groups', 'sessions'] },
  },
});

export const store = configureStore({
  reducer: { [api.reducerPath]: api.reducer },
  middleware: (getDefault) => getDefault().concat(api.middleware),
});
