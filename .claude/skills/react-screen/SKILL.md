---
name: react-screen
description: Use when creating or editing anything in apps/web - screens, forms, components, data fetching, routing, layout.
---
- Data: generated RTK Query hooks only; no fetch or axios. Invalidate with tags.
- Forms: React Hook Form + zodResolver with the same schema from packages/contracts; show translated error codes.
- UI: shadcn/ui; phone-first (check at 375 px); one primary action per screen; daily actions in 3 taps or fewer.
- RTL: logical classes only; numbers, phones and codes inside <bdi>; flip directional icons with rtl:.
- Loading: skeletons, not spinners. Optimistic updates only for attendance and edits; money waits for the server and shows a pending state.
- Lazy-load routes; keep the initial bundle small.
- Scrolling: the browser's scrollbars are hidden app-wide; the page shows PageScrollbar. Any box that scrolls (`overflow-y-auto`) wraps its content in `ScrollArea` from `components/ui/scroll-area` (`tone="light"` on dark surfaces), so its bar floats, takes no width and shows only while scrolling.
- All text follows the i18n-rtl skill.
