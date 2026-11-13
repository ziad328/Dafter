import { configureStore } from '@reduxjs/toolkit';
import { api } from './api/generated';

// Saving a group regenerates its sessions on the server, so the timetable must refetch too.
api.enhanceEndpoints({
  endpoints: {
    createGroup: { invalidatesTags: ['groups', 'sessions'] },
    updateGroup: { invalidatesTags: ['groups', 'sessions'] },
    // Opening and closing change the session's status in the timetable.
    openSession: { invalidatesTags: ['sessions'] },
    closeSession: { invalidatesTags: ['sessions'] },
  },
});

export const store = configureStore({
  reducer: { [api.reducerPath]: api.reducer },
  middleware: (getDefault) => getDefault().concat(api.middleware),
});

export type AppDispatch = typeof store.dispatch;
