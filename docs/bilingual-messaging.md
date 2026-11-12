# Bilingual & messaging

Arabic is the default language and the layout is designed RTL-first; English is a full second language, not an afterthought. Parent messages are sent through a transactional outbox, so one event produces exactly one message even when buttons are double-pressed or the server restarts.

## Arabic and English

**Two separate language settings.** Each user picks the language of the app. Each guardian has their own preferred language for messages. An English-speaking teacher can work in English while parents get Arabic.

**Layout**

- The app sets `<html lang dir>` from the locale; every component reads direction from there.
- Tailwind logical classes only (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`); an ESLint rule bans `ml-`, `mr-`, `left-`, `right-`.
- Arrows and chevrons flip with the `rtl:` variant; logos and media controls do not.
- Phone numbers, receipt numbers and codes stay left-to-right inside Arabic text, wrapped in `<bdi>`.
- One font family with both scripts, for example IBM Plex Sans Arabic, so mixed lines align.

**Formatting**

- Numbers: Western digits by default, with a workspace setting for Arabic-Indic digits. Use `ar-EG-u-nu-latn` with `Intl.NumberFormat` to keep Western digits, because plain `ar-EG` switches to ٠١٢.
- Money: "150 ج.م" in Arabic, "EGP 150" in English.
- Dates: `Intl.DateTimeFormat` with the user's locale; weeks start on Saturday.
- Plurals: ICU messages. Arabic has six plural forms (zero, one, two, few, many, other), so "3 طلاب" and "11 طالبًا" come out right.

**Bilingual data.** Workspace, subject and grade-level names have `_ar` and `_en` columns. Student names are entered in Arabic; the English name is optional.

**Arabic name search.** One shared normalize function runs on save (into `name_search`) and on every search query:

1. Remove diacritics (تشكيل) and the tatweel character.
2. Map أ إ آ to ا, ة to ه, ى to ي.
3. Collapse spaces, then match with `pg_trgm` so small typos still find the student.

**Translation files.** Keys live in `packages/i18n/locales/{ar,en}/*.json`. TypeScript types are generated from the Arabic file, so a missing key is a compile error, and CI checks that both languages have the same keys. A lint rule blocks hard-coded strings in JSX.

## Parent messaging

| Trigger | Sent when | Default | Example (Arabic) |
| --- | --- | --- | --- |
| Absence | A session is closed and the student did not attend | On | غاب أحمد عن حصة الفيزياء اليوم الساعة 5:00 م — سنتر النور |
| Session cancelled | A session is cancelled or moved | On | تم تأجيل حصة الفيزياء إلى الخميس 6:00 م |
| Fee overdue | A charge is unpaid 7 days after its due date, at most once a week | Off | متبقي من مصاريف شهر نوفمبر 200 ج.م |
| Exam result | A teacher presses "send results" for an exam | On | حصل أحمد على 18 من 20 في اختبار الفصل الأول |

**Pipeline**

1. The business action (for example, closing a session) writes its attendance rows and its `outbox_messages` rows in the same database transaction. If the transaction fails, no message exists.
2. Each outbox row has a unique `dedupe_key`, such as `absence:<session>:<guardian>`. A second close cannot insert a second row, and siblings collapse into one message for their shared guardian.
3. A relay picks up new rows and creates a pg-boss job. During quiet hours (10 PM to 8 AM, Cairo time) `send_after` delays the job to the morning.
4. The worker renders the template in the guardian's language and calls the provider adapter.
5. Failures retry with exponential backoff, up to 5 attempts, then the message is marked failed and shown in the message log.
6. Provider webhooks update the status to sent, delivered, read or failed.

**Providers**

- **WhatsApp Cloud API** is the main channel, since that is where Egyptian parents are. Business-started messages must use templates pre-approved by Meta and are charged per message, so v1 uses fixed approved templates with variables, and workspaces edit only the wording of the SMS and console versions.
- **SMS** through an Egyptian gateway as a fallback for guardians without WhatsApp.
- **Console adapter** for development and demos: messages appear on a "fake phone" page inside the app, so you can record a demo video without paying for messages.
- Guardian consent is recorded (`whatsapp_opt_in`) before any WhatsApp message is sent.
- **v0 (November 30)** sends parent messages only through the console adapter (absence and session cancelled), and student login codes by email (console in development, a free-tier email service on the demo). WhatsApp for parents and login codes, SMS, and the fee and exam triggers come after v0.
