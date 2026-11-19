# UX audits

The three UX, UI and wording audits, oldest first. All three are done; each keeps its findings and status.

## Contents

1. [Audit 1 (Nov 14)](#audit-1) (was `docs/ux-audit.md`)
2. [Audit 2 (Nov 14, after the olive palette)](#audit-2) (was `docs/ux-audit-2.md`)
3. [Audit 3 (Nov 16)](#audit-3) (was `docs/ux-audit-3.md`)

<a id="audit-1"></a>

## UX, UI and language audit (Nov 14)

A walkthrough of the redesigned app as owner, teacher, assistant and student, in Arabic and English, on a phone (375 px) and a laptop. **Nothing here is implemented yet.** Items already in `docs/progress.md#known-limits` are left out unless they block a daily goal.

**Severity:** high = blocks or slows a daily goal, or reads wrong to every user · medium = noticeable friction · low = polish.
**Effort:** S = under an hour · M = a few hours · L = a day or more.

### Top 5

1. **Recording a payment takes about 7 taps plus a long scroll.** "تسجيل دفعة" on Today just opens the students list. The payment form sits low on a long student page, and the amount isn't pre-filled with what the student owes.
2. **Registering a student and putting them in a group is two separate forms and about 7 taps.** The vision's 20-second door registration isn't met. The form shows every optional field.
3. **The student app was left out of the redesign.** It still has the old cards, 24-hour times and dot separators. The student's main action, Scan, is a small button inside a status card, and Sign out sits in the header where it's easy to tap by mistake.
4. **The Arabic wording uses one word for two different things.** "الرمز" means both the QR code and the email login code, and "امسح الشاشة" reads as "wipe the screen". "إلغاء" has four different meanings across the app.
5. **The live screen on a phone isn't built for class.** The QR and the class list fight for space, the tab bar stays on screen, and a wrong "تحضير" tap can't be undone.

### Clicks to goal (phone, already signed in, workspace remembered)

| Goal | Who | Taps today | Possible | How |
|:--|:--|:-:|:-:|:--|
| Open the QR for the next session | Teacher | 1 | 1 | Already one tap from Today ✓ |
| Mark a student without a phone | Teacher / assistant | 1 per student (after scrolling past the QR) | 1 | Put the list beside or above the QR on phones |
| Close the session | Teacher | 2 | 2 | ✓ (the second tap is the confirmation) |
| Register a student and enrol them | Assistant | ~7 taps + 3 fields, two screens | 3 + 3 fields | Pick the group inside the new-student form; the grade follows the group |
| Record a payment and print the receipt | Assistant | ~7 taps + search + amount | 3 | A payment sheet: search student → amount pre-filled with the balance due → save → receipt |
| Send a student their activation link | Assistant | ~5 + copy, then switch to WhatsApp | 2 | A "send on WhatsApp" share button; show "not activated" in the students list |
| Invite a teacher or assistant | Owner | 6 (More → Staff → role → create → copy → WhatsApp) | 3 | Share button; default role "assistant" already set |
| Read parent messages | Owner | 2 on a phone, 1 on a laptop | 2 | ✓ |
| Scan into a session | Student | 1 + camera | 1 | ✓, but make Scan the main button |
| See today's sessions | Student | 0 (home), but mixed into a 2-week list | 0 | Put today and the next session at the top |
| First sign-in after login | All staff | +1 (workspace list every first login) | 0 | Pick the workspace automatically when the user has exactly one |

### Owner

| # | Screen | Issue | Why it matters | Suggested fix | Sev | Effort |
|:-:|:--|:--|:--|:--|:-:|:-:|
| O1 | Login → Workspaces | After the first login, a user with one workspace still lands on the list, with a "create workspace" form under it | One extra tap, and the create form looks like the next step | Pick the only workspace automatically; hide the create form behind a "new workspace" button | high | S |
| O2 | Login | No "forgot password" and no show-password toggle | A locked-out owner has no way back in on their own | A reset by email or phone code; an eye icon on the password field | high | M |
| O3 | Staff | The invite link has to be copied and pasted into WhatsApp by hand | Slower, and it gets lost | A "Send" button using the phone's share sheet (`navigator.share`), with copy as a fallback | medium | S |
| O4 | Staff | Assistant scopes are a list of checkboxes with no explanation | "يعمل مع" doesn't say what changes | One line: "يرى مجموعات هؤلاء المدرسين فقط" | low | S |
| O5 | Messages | The page still has the old card style; the filter is a dropdown over a long log | Inconsistent with the redesigned screens | Status pill tabs (الكل · في الانتظار · فشلت), rows like the students list | medium | M |
| O6 | Workspaces | Old style; the create form is always open | Looks unfinished | Cards per workspace with role and logo initials; the create form in a dialog | medium | M |
| O7 | Today (laptop) | "البحث عن طالب" and "تسجيل دفعة" both just open the students list | Two buttons, one result | Make "تسجيل دفعة" open the payment sheet (Top 5 #1) | high | M |
| O8 | Fake phone | In the deployed demo, `/dev/phone` isn't in any menu | The demo's key moment (the parent's message) is hidden | Show it under "More" when the API reports `DEV_FAKE_PHONE` | medium | S |

### Teacher

| # | Screen | Issue | Why it matters | Suggested fix | Sev | Effort |
|:-:|:--|:--|:--|:--|:-:|:-:|
| T1 | Live (phone) | The QR fills the screen width, and the class list starts below it; the header and tab bar stay visible | Marking students without a phone means scrolling past the QR every time | A full-screen QR mode (no header or tabs) and a separate "class list" tab or toggle | high | M |
| T2 | Live | A wrong "تحضير" tap can't be undone from this screen | Mistakes stay until someone uses the API | Tap a marked row to choose present, late, excused or absent | high | M |
| T3 | Live | After closing, there's no summary | The teacher doesn't see "18 present, 3 absent, 1 make-up" | A summary card with counts and "messages sent to N parents" | medium | S |
| T4 | Live | The screen may dim during class (known limit) and there's no brightness hint | The QR stops being scannable | Wake Lock API while the QR is shown | medium | S |
| T5 | Timetable | Every future card shows "نقل" and "إلغاء الحصة" | Busy cards, and an easy wrong tap on "cancel" | Move both into a "⋯" menu per card | medium | S |
| T6 | Group form | Old style, one long column; the time fields are the browser's native time pickers | Inconsistent; in Arabic the native time field reads left to right | Two-column layout on laptops; slot rows as chips like on the groups list | low | M |
| T7 | Groups | No student count on a group card | A teacher can't see how full a group is | "12 / 30 طالب" on the card (the roster endpoint already exists) | low | S |

### Assistant (at the door)

| # | Screen | Issue | Why it matters | Suggested fix | Sev | Effort |
|:-:|:--|:--|:--|:--|:-:|:-:|
| A1 | New student | All fields shown: parent name, relation, message language, WhatsApp, English name, school, status | The 20-second goal is out of reach | Show name, student phone, parent phone and group; put the rest under "تفاصيل أكثر" | high | S |
| A2 | New student → enrol | Enrolling is a second form on the next page (group dropdown, discount, button) | ~3 extra taps for every new student | Group (and optional discount) in the new-student form | high | M |
| A3 | Student page | One long page: summary, groups, fees, app access | On a phone the fees card is far down | Tabs under the summary: المجموعات · المصروفات · التطبيق | medium | M |
| A4 | Fees | The amount field starts empty, and the group dropdown is required even with one group | Typing the same number every month | Pre-fill with the balance due; pick the group automatically when there's one | high | S |
| A5 | Fees | "إلغاء" (reverse a payment) sits next to entries with no explanation | It reads like "cancel", not "undo a payment" | Rename (see L4); show "مَن ألغى ولماذا" | medium | S |
| A6 | Students list | No sign of who owes money or who hasn't activated the app | The assistant opens students one by one | Small badges on each row: "عليه 250 ج.م.", "لم يُفعّل" | medium | M |
| A7 | Receipt | Print only; no way to send it to the parent | Parents in Egypt expect a WhatsApp photo | A "Send" button using the share sheet | low | S |
| A8 | Activation link | Copy only, like O3 | Same friction for every student | Share sheet button | medium | S |

### Student (installed app)

| # | Screen | Issue | Why it matters | Suggested fix | Sev | Effort |
|:-:|:--|:--|:--|:--|:-:|:-:|
| S1 | Home | Not redesigned: old cards, 24-hour times (`localTime`), dot-joined lines | Looks like a different product from the staff app | Same shell style: next session card on top, big Scan button | high | M |
| S2 | Home | Scan is a normal button inside the welcome card, under "هذا الهاتف مربوط بحسابك" | The one daily action isn't the main thing on screen | A large Scan button (or a bottom bar with Scan in the middle); show the binding text only when it fails | high | S |
| S3 | Header | "تسجيل الخروج" in the header of the student app | One wrong tap means email code again | Move sign-out to a settings sheet | medium | S |
| S4 | Schedule | Two weeks in one flat list; cancelled sessions only get a word at the end | Today and tomorrow don't stand out | Group by day, highlight today, strike through cancelled sessions | medium | S |
| S5 | Attendance history | Status words only, no summary | The student can't see "حضرت 18 من 20" | A rate at the top and coloured status pills | low | S |
| S6 | Scan | "امسح الشاشة" (title) and "تم" (back button) | See L1 and L7; "تم" doesn't say "go back" | "سجّل حضورك" / "رجوع" | high | S |
| S7 | Activation (iPhone) | Install, then copy and paste the invite link inside the app | The hardest step for a 15-year-old; most drop-off will be here | A short visual guide (3 pictures) on the install screen | medium | M |
| S8 | Login | Email only; many Egyptian students don't use email | Activation stalls | Already planned (WhatsApp OTP later); until then, the spam hint helps | — | L |

### Language (Arabic first)

| # | Where | Now | Problem | Suggested |
|:-:|:--|:--|:--|:--|
| L1 | Scan title | امسح الشاشة | "امسح" also means "wipe"; it reads as "wipe the screen" | سجّل حضورك / وجّه الكاميرا إلى الكود |
| L2 | QR vs login code | الرمز / الكود / رمز الحصة for the QR, الرمز for the email code | One word, two things; three words, one thing | QR: **كود الحضور** everywhere; email: **كود الدخول** |
| L3 | Workspace | مساحة العمل / مساحات العمل | SaaS jargon; nobody in a سنتر says it | **السنتر** (and "مكان العمل" for an independent teacher) |
| L4 | "إلغاء" | إلغاء الحصة, إلغاء التسجيل, إلغاء (payment), إلغاء (edit form) | Four meanings of one word | Cancel session: إلغاء الحصة · leave group: **إخراج من المجموعة** · reverse payment: **إلغاء الدفعة** · close the edit form: **رجوع** |
| L5 | Reversal entry | إلغاء قيد | Accounting term | **دفعة ملغاة** |
| L6 | Fees | المصروفات (most screens) vs المصاريف (tagline) | Inconsistent | Pick **المصروفات** everywhere |
| L7 | Scan back button | تم | Reads as "done" | **رجوع** |
| L8 | Owner role | مالك (role) vs صاحب المساحة (messages) | Two names for one role | **صاحب السنتر** |
| L9 | Phone fields | رقم الهاتف (login) vs موبايل (everywhere else) | Mixed | **رقم الموبايل** everywhere |
| L10 | Timetable | نقل | "Move" is vague; the message says "تغيير موعد" | **تغيير الموعد** |
| L11 | Make-up | تعويض | The product doc says حصة تعويضية | **حصة تعويضية** |
| L12 | Today tiles | طلاب متوقعون | Literal translation of "expected" | **مسجّلون في حصص اليوم** |
| L13 | Today | "حصص اليوم" is both a tile label and the list title on the same screen | Repeated label | Tile: **عدد الحصص** |
| L14 | Fake phone empty state | "…ستظهر الرسالة خلال دقيقة" | On Vercel it's instant, or 8:00 during quiet hours | "ستظهر الرسالة فور إغلاق الحصة (أو الساعة 8 صباحًا إن كانت ليلًا)" |
| L15 | Close confirm | اضغط مرة أخرى: سيُسجَّل الغائبون | Stiff passive | **اضغط مرة أخرى لتسجيل الباقين غياب** |
| L16 | English | "Fake phone", "Make-up", "Students expected" | Reads like a translation | "Parent phone (demo)", "Make-up class", "Booked today" |

### UI consistency

| # | Where | Issue | Suggested fix | Sev | Effort |
|:-:|:--|:--|:--|:-:|:-:|
| U1 | Login, register, invite, workspaces, messages, staff, forms | Only got the shared card, input and dropdown styles; no page headers, icons or layout | Same `PageHeader` + `Panel` pattern as students and groups | medium | M |
| U2 | Login header | The text "دفتر" with no logo, unlike the staff shell | Use the logo and wordmark | low | S |
| U3 | More (phone) | "تغيير مساحة العمل" row has no icon, unlike the rows above | Add an icon | low | S |
| U4 | Phone header | The workspace chip can take 60% of the header next to the logo | Show the name only, smaller; the role on the More screen | low | S |
| U5 | Student app, receipt | Still 24-hour times | `displayTime` everywhere a person reads a time | medium | S |
| U6 | All | No dark mode | Optional; many teachers use phones at night | low | M |

### Suggested order

1. **Quick wins (a day):** O1, A1, A4, S2, S6, all of L1–L15, U5. **Done Nov 14**: L3 became «مكان العمل» rather than «السنتر», since an independent teacher has no center; L8 kept «مالك» and fixed the one place that said «صاحب المساحة»; A4 pre-fills only when the student is in one group.
2. **The three slow daily jobs:** the payment sheet (Top 5 #1), group in the new-student form (A2), and the live phone layout with undo (T1, T2). **Done Nov 14**: the sheet opens from Today and the students list (search, pay, receipt: 3 taps plus the search); the group in the new-student form also sets the grade; the full-screen QR is a button, not the default, and the class list is a jump button rather than a separate tab; a status is changed by tapping it in the row.
3. **The student app redesign:** S1, S3, S4, S5. **Done Nov 14**: the next class sits on top in the staff app's gradient card, with a large Scan button under it; the schedule is grouped by day with today marked and cancelled classes struck through; the history opens with «حضرت X من Y» (excused classes are not counted) and coloured status pills; sign-out moved to a folded «الإعدادات» section and needs a second tap, and now lands on the student login rather than the staff one.
4. **Share buttons:** O3, A7, A8. **Done Nov 14**: one `ShareButton` (the phone's share sheet, or Copy with a «تم النسخ» confirmation where there is none) on the staff invite, the student activation link and the receipt; the receipt is shared as text, since a parent has no account to open its page.
5. **Consistency pass:** U1, O5, O6, T5. **Done Nov 14**: messages has a page header, status pill filters (الكل · في الانتظار · أُرسلت · فشلت) and rows like the students list; workspaces are cards with initials, role and a tick on the current one, and «new workspace» opens a sheet; timetable move and cancel sit behind a «⋯» menu per card; the group, student and staff screens use `PageHeader`, and the sign-in, register, invite and student sign-in cards open with an icon. `Sheet` (in `components/Page.tsx`) is now shared by the payment sheet and the new-workspace form.
6. **After the plan, Nov 14:** U6 dark mode: follows the phone's setting until the viewer picks one (toggle in «المزيد» for staff, the moon in the header for students and sign-in); a soft slate-navy rather than black, with a lighter blue and dim tints of the accents. S7: the install screen shows three pictured steps (iPhone: Share, «إضافة إلى الشاشة الرئيسية», open and paste; others: menu, install, open) and a button that copies the invite link before installing. S8 (WhatsApp login) stays for later.

<a id="audit-2"></a>

## UX audit 2 (Nov 14, after the olive palette)

Every staff and student screen was opened at 375 px in Arabic with the dev seed (and Today on a 1280 px laptop), after the first audit (`docs/ux.md#audit-1`) was finished. The dev database holds hundreds of test groups and students, which makes list problems easy to see.

### Top 5

1. **Long lists have no shape.** Groups are identical cards ("اللغة العربية · الصف الأول الابتدائي" again and again, no count or fee), the timetable is one tall card per session, and the staff page draws every teacher checkbox for every assistant (6,000 px with 30 assistants).
2. **The student page is a long scroll of four cards.** The enrol form is always open, every payment has a bare «إلغاء الدفعة» under it, and the fees sit below the fold.
3. **Money reads like a database.** «مصروفات 2026-11», «500.00 ج.م.», and nowhere to see who owes across the center.
4. **Waiting messages don't say why.** The log shows «في الانتظار» for 8:00 ص with no hint that quiet hours hold them.
5. **Small wording and grammar slips.** «من 2 مسجّلين» (should be the dual), initials «سا» for «سنتر النور» (the «ال» is taken as a letter), «إيصال رقم21».

### Fixed during the audit

| ID | Screen | Problem | Fix |
|:--|:--|:--|:--|
| B1 | Group edit | Subject and grade showed «اختر…» on a fresh load (the form mounted before the lists), so saving could send them empty | Waits for the lists; e2e reloads the edit page and checks both (`4e0f1dc`) |

### Findings

Priority: high (hurts a daily job), medium, low. Size: S (under an hour), M (a few hours), L (a day or more).

| ID | Screen | Problem | Fix | Priority | Size |
|:--|:--|:--|:--|:-:|:-:|
| G1 | Groups | Cards are identical when a teacher has several groups of one subject and grade | Show students (12/20 with capacity), monthly fee and the next slot; an optional short label per group | high | M |
| G2 | Groups | No search or filter; 200+ cards in one column | Filter chips by teacher and grade, and search | medium | M |
| TT1 | Timetable | One tall card per session (about 110 px each); a busy day is a long scroll | Compact rows grouped by start time, with subject, grade, teacher and a status dot | high | M |
| TT2 | Timetable | No filter by teacher or group | Same filter chips as groups | medium | S |
| MB1 | Staff | Every assistant card lists all teacher checkboxes, always open | One line per person («يعمل مع: أحمد محمود»), edit in a sheet; search when more than 10 | high | M |
| ST1 | Student page | The enrol form (group, discount, button) is always open | An «إضافة إلى مجموعة» button that opens it | medium | S |
| ST2 | Student page | «إلغاء الدفعة» sits under every payment as plain text | Move it into a «⋯» menu per entry, like the timetable | medium | S |
| ST3 | Student page | Four stacked cards; fees are below the fold on a phone | Section chips at the top (البيانات · المجموعات · المصروفات · التطبيق) that jump down, or tabs | medium | M |
| ST4 | Students | No way to see who owes, or filter by group or grade | Filter chips (group, grade, «عليه مصروفات») and a small balance badge on rows that owe | high | M |
| F1 | Fees, receipt, sheet | «500.00 ج.م.»: decimals on whole pounds | Show «500 ج.م.» when there are no piastres | medium | S |
| F2 | Fees | Charges read «مصروفات 2026-11» | Month name: «مصروفات نوفمبر 2026» | medium | S |
| F3 | Fees | «إيصال رقم21»: the number touches the word | A space outside the underline, or «إيصال #21» | low | S |
| F4 | Receipt | A reversed receipt only says «أُلغيت» at the bottom; the amount looks valid | Strike through the amount and show a red «ملغي» stamp at the top | medium | S |
| F5 | Payment sheet | Empty until the user types | Under the search, list students who owe, most owed first | medium | M |
| M1 | Messages | «في الانتظار» with 8:00 ص and no reason | «سيُرسل 8:00 ص (بعد ساعات الهدوء)» when held by quiet hours | high | S |
| M2 | Messages | Trigger and names run together («غياب يوسف…») | A separator or the trigger as a small label above the names | low | S |
| M3 | Messages | Dates as «2026/11/14، 8:00 ص»; the rest of the app says «السبت، 14 نوفمبر» | Use the shared `dayLabel` + `displayTime` | low | S |
| LV1 | Live | «من 2 مسجّلين» | ICU plural with Arabic forms (`=2 {من مسجّلَين اثنين}`…) like `live.count` | medium | S |
| AV1 | All lists | Initials take the «ا» of «ال» («سا» for «سنتر النور») | Skip a leading «ال» when picking initials | low | S |
| A1 | Sign in | No show-password button and no way to reset a forgotten password | Eye toggle now; password reset by email or by the owner later | high | M |
| A2 | Register | The password rule shows only after an error | A hint under the field (at least 8 characters) | low | S |
| A3 | Student sign in | Email sign-in and «الصق رابط الدعوة» share one card; returning students see both | Paste section behind a «أول مرة؟» link | low | S |
| W1 | Workspaces | The breadcrumb says «تغيير مكان العمل» and the title says «أماكن العمل» | One name for both | low | S |
| MO1 | More | «تغيير مكان العمل» is the only row without an icon | Add one | low | S |
| T1 | Today (phone) | Four stat tiles push «حصص اليوم» and the shortcuts below the fold | On phones, shortcuts before the tiles, and tiles two-up in one row | medium | S |

### Product gaps seen while auditing

- No center-wide fees view (who owes this month, collected today); ST4 and F5 cover the daily part, a report is a bigger task.
- No password reset at all (A1).
- WhatsApp login (S8 from the first audit) still waits for the real WhatsApp provider.

### Status (Nov 14)

Done, each with unit tests (and e2e where a flow changed): F1–F5, M1–M3, LV1, AV1, A2, A3, W1, MO1, T1, G1, G2, TT1, TT2, MB1, ST1–ST4, and the show-password half of A1. Done after: password reset (A1, `0439868`), G1's per-group label (`d486b2f`), and the center-wide fees view from the product gaps (`/fees`). The owner-side reset link came later, limited to accounts that exist only in that workspace, so an owner can't take over an account used elsewhere.

### Suggested order

1. **Quick wins (half a day):** F1, F2, F3, F4, M1, M2, M3, LV1, AV1, A2, A3, W1, MO1, T1.
2. **Lists that scale:** G1, G2, TT1, TT2, MB1.
3. **Student page and money:** ST1, ST2, ST3, ST4, F5.
4. **Accounts:** A1 (show password now, reset later).

<a id="audit-3"></a>

## UX audit 3 (Nov 16)

Every staff and student screen opened in the running app (dev seed plus the e2e test data: ~100 groups, hundreds of students) as owner, teacher, assistant, independent teacher and student. Arabic and English, 375 px and 1366 px, dark and light. Ways in: phone login, email login, wrong password, empty form, rate limit, register, workspace picker and switching, staff invite link, student invite → install gate → email code → home → scan. The goal this time is **less on each screen**, not only bugs. Nothing here is implemented yet.

**Severity:** high = slows a daily job or confuses every user · medium = noticeable friction · low = polish.
**Type:** bug · flow (UX flow) · visual (density, hierarchy, spacing, wording).

### Top 10

1. **S1 · Students:** the group filter draws one chip per group. With 100 groups that is a ~3,800 px wall of identical «اللغة العربية · أحمد محمود» chips; the results of a search sit under it, so typing a name looks like nothing happened.
2. **A3 · Sign in:** 5 wrong passwords from one IP block every login from that IP for 15 minutes. A center's shared Wi‑Fi means one person's typos lock out every teacher and assistant, and the message («انتظر قليلًا») doesn't say how long.
3. **SA1 · Student scan:** no back button while the camera is open. In the installed app on iPhone there is no browser back, so a student who opens Scan by mistake is stuck.
4. **M1 · Messages:** the log, the thing people open daily, starts ~1,200 px down, under five settings toggles and the five-row wording editor.
5. **D1 · Dashboard:** ~20,000 px on a phone. One 140 px card per group with an empty chart area and a «لا امتحانات مرصودة» pill.
6. **G1 + G2 · Groups:** there is no group page. A tap opens the edit form, so nobody can see who is in a group. Each card is ~240 px, plus a detached full-width «الامتحانات» button that looks like a second card.
7. **G5 · Group pickers:** groups are named «المادة · الصف · المدرّس» only. In the new-student form, enrol and the filters, 101 options read the same; nothing tells two groups apart (no label, no day or time).
8. **H4 + LV1 · Start too early:** Today's big «ابدأ واعرض كود الحضور» shows 17 hours before the class. Tapping it opens a blank page with one red line, with no title, no back button and no list.
9. **A6 · New account:** after register you land on «ليس لديك مكان عمل بعد» with a small outline button at the top, a breadcrumb to a «المزيد» that doesn't exist yet, and no sign-out or language switch.
10. **H1 + H2 · Today:** the subtitle says «16 حصة اليوم» and the first tile says «11 عدد الحصص» (one counts cancelled classes). Four ~120 px tiles hold four numbers.

### Phases

- [x] **Phase 1 · Quick wins (about a day):** W1–W7, F2, F5, SA6 (wording); TT4, A1, A2, H1, N4, E1, S5, SA1, F4, TT1, LV3 (small screen fixes). **Done Nov 16.** N4's cause was the hover state (dark text on the olive sidebar in the light theme). F4 got cell spacing and an unwrapped time; the minus sign looked fine on a second look. The English «Who owes» stayed (only the Arabic was colloquial). The full-screen QR keeps the count as a sentence; the page shows «3 / 20».
- [x] **Phase 2 · Less on each screen (2–3 days):** S1, S2, M1, D1, H2, H3, H5, F1, F3, R1, R3, N1, N2, G2, G3, G4, S4, S6, S7, TT2, V1, V3. **Done Nov 16** in four commits. Filters are one pill each that opens a searchable sheet, and groups are named by subject, label or first slot, and teacher (the shared name helper also covers G5's filters; the forms' dropdowns stay for Phase 3). Message settings live on `/messages/settings`, owner only, so the assistant's read-only view of the wording is gone. The dashboard shows the first 10 groups, lowest attendance first. Rooms, staff and settings leave the menu for non-owners, but their URLs still work. Found and fixed on the way: a dropdown inside a sheet opened its list outside the modal, where it couldn't be clicked (the staff «إدارة» sheet had it too). V1 and V3 were applied on the screens touched, not app-wide. R3's edit and archive moved behind a «⋯» per room, and S4's payments got a «+» in a follow-up.
- [x] **Phase 3 · Missing flows (2–3 days):** G1, G5, H4, LV1, LV2, LV4, A6, A7, A10, A11 (needs `kind` on `/me`), A13, SA2, SA5, H7. **Done Nov 16** in five commits, no migration. Groups open a page (roster with owes and not activated, next classes, exams); edit moved to `/groups/:id/edit`, and a save lands on the group's page. The close now returns `{ records, messagesQueued }`, and the open window is a shared contract constant. Full-screen QR is portalled to `<body>` and asks for browser full screen. `GET /invites/:token` is public (the web base query lets only that read through signed out); revoke expires the invite now. Who sent an invite was left out at first (needs a column); **done Nov 17** with migration 0016 (`invitedBy` on the pending list, «أرسلها …»). Found on the way: the dev API reads `@dafter/contracts` from `dist`, so a new runtime export needs `pnpm --filter @dafter/contracts build` and an API restart locally.
- [x] **Phase 4 · API:** A3 (rate-limit keys and a retry time in the error), A5. **Done Nov 16**, no migration. Login failures count per login (5 in 15 min) and per IP (50), so one person's typos no longer lock a shared Wi-Fi; every RATE_LIMITED carries `details.retryAfterSeconds`, and the sign-in screens say «حاول بعد 15 دقيقة». Register says what the optional email is for. The limits were still in-process memory then; **since Nov 17 they live in PostgreSQL** (`rate_limits`, migration 0016), so a restart or a sleeping instance no longer clears a lockout.
- [x] **Phase 5 · Polish (any time):** A4, A8, A9, A12, N3, N5, N6, H6, TT3, TT5, TT6, S3, S8, S9, S10, LV5, E2, D2, D3, M2, M3, M4, R2, R4, R5, SA3, SA4, SA7, SA8, SA9, V2. **Done Nov 16** in five commits (`ec079d8` shell, `52b0693` timetable, `1769feb` students and live, `a584fe3` exams to settings, `82d1b91` student app), no migration. SA4's public `GET /student-invites/:token` answers INVITE_INVALID (410) for an unknown, expired or used link, like the staff preview, not 404. R5 was already one titled section; it is now a labelled `<section>` for the next ones.

### Still open from audits 1 and 2

| Old ID | Now | Status |
|:--|:--|:--|
| Audit 1 T1 (full-screen QR without header or tabs) | LV2 | Done (Phase 3) |
| Audit 1 T3 (summary after closing) | LV4 | Done (Phase 3) |
| Audit 1 T6 (native time fields, one long column) | TT5, G3 | Done (Phases 2 and 5) |
| Audit 1 A6 (badges on student rows) | S3 | Done (Phase 5) |
| Audit 1 L1, L2, L3, L5, L9 (wording) | W1–W4, SA6 | Done (Phase 1) |
| Audit 2 M3 (one date format) | M4 | Done (Phase 5) |

### Findings

#### Sign-in and accounts

| ID | Screen | Who · locale · width | Problem | Suggestion | Sev | Type |
|:--|:--|:--|:--|:--|:-:|:--|
| A1 | Login | all · ar · 375 | An empty submit says «كلمة المرور 8 أحرف على الأقل»; that rule belongs to register | «اكتب كلمة المرور» on login | low | bug |
| A2 | Login | all · ar | INVALID_CREDENTIALS says «رقم الهاتف…» while the field says «رقم الموبايل» | «رقم الموبايل أو البريد أو كلمة المرور غير صحيحة» | low | visual |
| A3 | Login | all | 5 failures per IP lock every login from that IP for 15 min (shared center Wi‑Fi); «انتظر قليلًا» has no time | Key the limit on the login, with a much higher IP cap; return the wait and show «حاول بعد 15 دقيقة» | high | flow |
| A4 | Login | all · 375 | A large gap between «نسيت كلمة المرور؟» and «ليس لديك حساب؟»; no way to the student sign-in | Tighten the gap; add a small «طالب؟ ادخل من هنا» link | low | visual |
| A5 | Register | new owner | Email is optional, but password reset is email-only, so a phone-only owner can never reset alone | Hint under email: «للاستعادة لو نسيت كلمة المرور» | medium | flow |
| A6 | Workspaces (new account) | new owner · 375 | Empty card, a small outline button at the top, a breadcrumb to «المزيد», and no sign-out or language switch | A welcome screen with two big choices (سنتر · مدرّس مستقل) that opens the form directly | high | flow |
| A7 | New workspace sheet | new owner | The type radio (سنتر / مدرّس مستقل) is last and tiny, though it decides the wording | Make the type the first step, as two cards; move the English name into «تفاصيل أكثر» | low | visual |
| A8 | Workspace picker | teacher with two workspaces | Breadcrumb «المزيد › أماكن العمل» right after login; her own workspace says «مالك» | No breadcrumb on the picker; show «مدرّس مستقل» for an independent workspace | low | visual |
| A9 | Picker, header | all | Every center starts with «سنتر», so the initials all read «سن…» | Skip «سنتر» and «دروس» when picking initials | low | visual |
| A10 | Invite accept | invited staff | «تمت دعوتك للانضمام إلى مكان عمل» doesn't name the center, the role or who invited | «سنتر النور يدعوك كمساعد» | medium | flow |
| A11 | `/` as a student | student | A signed-in student who opens a staff URL lands on «ليس لديك مكان عمل بعد. أنشئ واحدًا» | Send students to `/s` | medium | bug |
| A12 | Sign-out mid-screen | staff | When the session ended on the live screen, the app went to `/login` without `?next`, so signing in again lands on Today | Keep `next` on every forced sign-out | low | bug |
| A13 | Staff invite | owner | A 70-character URL is printed in mono; no list of pending invites and no way to revoke one | Show Send/Copy only; a «دعوات لم تُقبل» list with revoke | medium | flow |

#### Shell and navigation

| ID | Screen | Who · locale · width | Problem | Suggestion | Sev | Type |
|:--|:--|:--|:--|:--|:-:|:--|
| N1 | More | owner · 375 | Nine flat rows mix daily (fees, cash), setup (rooms, staff, settings) and demo (fake phone); language and theme take two full-width rows | Three short sections with small headings; language and theme as two icon buttons in one row | medium | visual |
| N2 | More, sidebar | teacher, assistant, independent | Rooms, Staff, Settings and Dashboard show for roles that can't change them; Settings shows an editable field with «المالك فقط…» under it; an independent teacher sees Rooms and Staff | Hide owner-only entries; hide Rooms and Staff for an independent workspace until asked | medium | flow |
| N3 | Sidebar | owner · 1366 | 13 flat items; language, theme and sign-out take three full-width rows | Same three sections as N1; one row of icon buttons at the bottom | low | visual |
| N4 | Sidebar | all · light · 1366 | The «Dark mode» button is almost invisible (light text on a light chip over olive) | Use the sidebar's foreground color | medium | bug |
| N5 | Today | all · 1366 | The header search and the «Find a student» quick action do the same thing | Drop the tile on desktop; on phones a search icon in the header instead of a tile | low | visual |
| N6 | Breadcrumbs | all | /fees and /dashboard have none; /groups/:id/exams has none; /cash-summary, /rooms and /members do | One rule: every page opened from More or from another page has one | low | visual |

#### Today

| ID | Screen | Who · locale · width | Problem | Suggestion | Sev | Type |
|:--|:--|:--|:--|:--|:-:|:--|
| H1 | Today | owner · all | «16 حصة اليوم» in the subtitle vs «11 عدد الحصص» in the tile (cancelled classes counted in one) | One number without cancelled ones, or «11 حصة · 5 ملغاة»; drop the tile | medium | bug |
| H2 | Today | all · 375 | Four ~120 px tiles (2×2) for four numbers | One compact strip: «11 حصة · 14 مسجّل · 3 حضروا · 97 طالب» | medium | visual |
| H3 | Today | all · 375 | Four ~160 px shortcut tiles; a teacher gets three, which leaves a hole | One row of four small icon chips | medium | visual |
| H4 | Today | teacher, owner | The big start button shows 17 h before a class that opens 30 min before | Before then: smaller card, «تُفتح 5:30 م», button disabled | high | flow |
| H5 | Today | all · 375 | Every future row has its own «ابدأ» (seven in a row); the subtitle cuts off the teacher («الصف الأول الابتدائي · أح…») | Button only on the next or open class; show the group label instead of the grade when there is one | medium | visual |
| H6 | Today | owner | The week chart draws days without classes as 0%; «50%» has no period next to it | «—» for days without classes; «50% هذا الأسبوع» | low | visual |
| H7 | Today (empty workspace) | new owner, independent | «لا توجد حصص اليوم / افتح الجدول» plus tiles full of zeros | A setup checklist: add a group → add a student → invite an assistant | medium | flow |

#### Timetable

| ID | Screen | Who · locale · width | Problem | Suggestion | Sev | Type |
|:--|:--|:--|:--|:--|:-:|:--|
| TT1 | Timetable | all | The week bar never says which week is shown | «15 – 21 نوفمبر» between the arrows | medium | visual |
| TT2 | Timetable | owner · 375 | Two unlabeled chip rows (teacher, grade), each with its own «الكل»; they will wrap like Students as staff grows | One «تصفية» button opening a sheet, or one labeled, scrolling row | medium | visual |
| TT3 | Timetable | all · 375 | Titles cut to «اللغة العربية · الصف الأول الابتد…»; the label and room are lost | Line 1: subject + label; line 2: grade · teacher · room | low | visual |
| TT4 | Move form | owner, teacher · ar | The start-time label is «ابدأ» (imperative "Start!") | «من», as in the group form | low | bug |
| TT5 | Move form, group slots, exam date | all · ar | Native pickers show «11/21/2026» and «05:30 PM» in Arabic, left to right | A localized display (Arabic digits/«م» in Arabic), or set `lang` on the inputs | medium | visual |
| TT6 | Timetable | all · 1366 | One long list on a wide screen | A 7-column week grid on desktop | low | visual |

#### Groups

| ID | Screen | Who · locale · width | Problem | Suggestion | Sev | Type |
|:--|:--|:--|:--|:--|:-:|:--|
| G1 | Group | teacher, owner | No group page: a tap opens the edit form; no roster, no next classes, no fees status | A group page: roster (with owes / not activated), next classes, exams; Edit in the header | high | flow |
| G2 | Groups | all · 375 | ~240 px cards (icon, title, grade, slot pill, divider, avatar, count) plus a detached «الامتحانات» button under each | Two-line rows; exams move into the group page | high | visual |
| G3 | Group form | owner | One long column; label, capacity, fee and room always open | Optional fields under «تفاصيل أكثر», like the student form; two columns on desktop | medium | visual |
| G4 | Group form | owner | «أرشفة المجموعة» is a full-width button right under «حفظ» | A text button at the end, after a gap, or in a «⋯» | low | visual |
| G5 | New student, enrol, filters | assistant | Groups show «المادة · الصف · المدرّس» only; 101 identical options | Add the label or first slot: «… · السبت 4:00 م» | high | flow |

#### Students

| ID | Screen | Who · locale · width | Problem | Suggestion | Sev | Type |
|:--|:--|:--|:--|:--|:-:|:--|
| S1 | Students | all · 375 | One chip per group: ~100 chips, ~3,800 px before the first student; search results land under the wall | A single «المجموعة ▾» picker (sheet with search) | high | bug |
| S2 | Students | all · 375 | Three filter rows (owes, groups, grades) | One row: [عليه مصروفات] [المجموعة ▾] [الصف ▾] | medium | visual |
| S3 | Students | assistant | Rows don't show «لم يُفعّل» (audit 1 A6, half done) | A small dot or pill next to the balance | low | visual |
| S4 | Student page, fees | assistant · all | No dates; charges and payments look alike (same color, no sign); a reversed payment is two lines | Date on each line; payments green with «+»; one struck line «دفعة ملغاة» per reversed pair | medium | visual |
| S5 | Student page, fees | owner | The «⋯» on a monthly charge offers «إلغاء الدفعة» | «إلغاء المصروفات», or no menu on charges | medium | bug |
| S6 | Student page, fees | assistant | The payment form is always open, in an old fieldset-with-legend style used nowhere else; the amount shows «500.00» | A «تسجيل دفعة» button that opens the payment sheet, pre-filled | medium | visual |
| S7 | Student page, groups | assistant | «إخراج من المجموعة» is plain text next to each group | Put it in a «⋯» per group with a second tap | medium | flow |
| S8 | Student page, app | assistant | After the link is made, «إنشاء رابط التفعيل» stays and the full URL is printed | Show Send/Copy and «صالح حتى الخميس 9:00 م» | low | visual |
| S9 | Student page | all · 1366 | One narrow column; the section chips do nothing on a wide screen | Two columns (info, groups, app · fees); no chips on desktop | low | visual |
| S10 | Student page, breadcrumbs | all · en | Arabic names with digits flip in English («98114798 نور») | Wrap names in `<bdi>` | low | bug |

#### Live attendance

| ID | Screen | Who · locale · width | Problem | Suggestion | Sev | Type |
|:--|:--|:--|:--|:--|:-:|:--|
| LV1 | Live (too early) | teacher | Blank page with one red line, no title, no back | Keep the header and the list; a card «تُفتح 5:30 م» with a back button | medium | flow |
| LV2 | Live, full screen | teacher · 375 | «الكود بملء الشاشة» keeps the app header and tab bar | Fullscreen API, or hide the shell in this mode | medium | flow |
| LV3 | Live | teacher · ar | «لم يسجّل أحد بعد» over «من طالب واحد مسجّل» reads oddly | A big «0 / 1» with «حاضر» under it | low | visual |
| LV4 | Live, closed | teacher | Only «تم إغلاق الحصة.» and the present count; «العودة للجدول» although the breadcrumb says اليوم | Counts per status and «أُرسلت N رسالة لأولياء الأمور»; go back to where the teacher came from | medium | flow |
| LV5 | Live list | teacher | The marked status «حاضر» looks like plain text, not a button | A pill with a small chevron | low | visual |

#### Fees, cash, receipts, exams

| ID | Screen | Who · locale · width | Problem | Suggestion | Sev | Type |
|:--|:--|:--|:--|:--|:-:|:--|
| F1 | Fees | owner · 375 | Two big cards (today, month), each with three method rows, mostly «0 ج.م.» | One card with both totals side by side; methods only when not zero | medium | visual |
| F2 | Fees | owner · ar | «مين عليه فلوس · 17 طالبًا» is colloquial; the rest is MSA | «عليهم مصروفات (17)» | low | visual |
| F3 | Cash summary | owner · dark | A white paper card with a light-grey native date field inside the dark app | Theme colors on screen; white only in `@media print` | medium | visual |
| F4 | Cash summary | owner · 375 | Time and receipt number run together («12:28 ص 17»); «-200 ج.م.» puts the minus on the wrong side | Card rows on phones; `<bdi>` around signed amounts | medium | bug |
| F5 | Receipt, cash summary, fees | all · ar | Three spellings: «ملغي», «(ملغى)», «أُلغيت» | «ملغاة» everywhere | low | visual |
| E1 | Exams | teacher · 375 | The date field overflows into «الدرجة النهائية» | Stack the two fields on phones | medium | bug |
| E2 | Exams | teacher | The new-exam form is always open above the list; no breadcrumb back to the group | A button that opens a sheet; المجموعات › group › الامتحانات | low | visual |

#### Dashboard

| ID | Screen | Who · locale · width | Problem | Suggestion | Sev | Type |
|:--|:--|:--|:--|:--|:-:|:--|
| D1 | Dashboard | owner · 375 | ~20,000 px: a 140 px card per group, an empty chart area and «لا امتحانات مرصودة» | A compact table (group · attendance % · last exam), worst first; groups without data behind «عرض الكل» | high | visual |
| D2 | Dashboard | owner · 375 | Week labels cut («14 نوف…»); empty weeks draw flat lines; no values on the money bars | Short labels («14/11»), the value on tap or above each bar | low | visual |
| D3 | Dashboard | owner · ar | «آخر 8 أسابيع» repeats the selected chip; the plural has no one/two forms | Drop the subtitle | low | visual |

#### Messages

| ID | Screen | Who · locale · width | Problem | Suggestion | Sev | Type |
|:--|:--|:--|:--|:--|:-:|:--|
| M1 | Messages | owner · 375 | The log starts ~1,200 px down, under the toggles and the wording editor | Log first; toggles and wording on a «إعدادات الرسائل» page behind a gear | high | visual |
| M2 | Messages | owner | Each row shows the time twice («… 8:00 ص» and «سيُرسل 8:00 ص…»); the text itself isn't shown | One time; tap a row to read the message | low | visual |
| M3 | Messages settings | owner · ar | Long toggle labels with brackets («لولي الأمر الأساسي فقط (وليس كل أولياء الأمور المسجلين)») | Short label, details in a hint line | low | visual |
| M4 | Fake phone | owner · ar | English bubbles get scrambled bidi; dates «2026/11/15، 3:40 م» differ from the app | `dir="auto"` per bubble; the shared date format | low | bug |
| M5 | Wording editor | owner · ar | ~~«was/were» is listed as a part in the Arabic tab~~ Not an issue: the editor already hides it in Arabic (found while planning) | — | — | — |

#### Staff, rooms, settings

| ID | Screen | Who · locale · width | Problem | Suggestion | Sev | Type |
|:--|:--|:--|:--|:--|:-:|:--|
| R1 | Staff | owner · 375 | The invite form fills the first screen; the list is below | «+ دعوة» opens a sheet | medium | visual |
| R2 | Staff | owner | Row actions are bare icons (person-gear, key); the key (reset link) isn't obvious | A «⋯» with text items | low | visual |
| R3 | Rooms | owner · 375 | The add form is always open on top; every row has «تعديل» and «أرشفة» as text | «+ قاعة» opens a sheet; archive in a «⋯» | low | visual |
| R4 | Rooms | owner · ar | The subtitle is a rule («مجموعتان لا تُحجزان…») | Drop it, or make it a hint under the add form | low | visual |
| R5 | Settings | owner | A whole page for one number | Fine for now; group future settings (name, logo, quiet hours) as sections on this page | low | visual |

#### Student app

| ID | Screen | Who · locale · width | Problem | Suggestion | Sev | Type |
|:--|:--|:--|:--|:--|:-:|:--|
| SA1 | Scan | student · installed app | No back button while scanning (only after success) | «رجوع» in the card header | high | bug |
| SA2 | Home | student | «الحصة التالية» shows a class that is already closed and attended; the schedule repeats it below | Next = first class not closed and not over; mark attended ones ✓ | medium | bug |
| SA3 | Home | student | Empty cards: «درجاتي — لا درجات بعد.» | Hide sections with nothing in them | low | visual |
| SA4 | Activation | student | No name and no center: reads like a generic login | «أهلًا يا دافع — سنتر النور» | low | flow |
| SA5 | Code step | student · 375 | A big orange spam warning appears at once, above the code field; no resend | Show the hint after 60 s, small, under the field; «أعد إرسال الكود» with a countdown | medium | flow |
| SA6 | Login email | student | The email says «رمز الدخول»; the screen says «كود الدخول» | «كود الدخول» in the email too | low | visual |
| SA7 | Install gate | student · ar | «تسجيل دخولك ومفتاح الحضور يكونان داخل التطبيق المثبّت…» is technical | «ثبّت التطبيق، ثم سجّل الدخول منه.» | low | visual |
| SA8 | Scan, camera blocked | student · installed app | Says «إعدادات المتصفح» inside the app; no retry | «إعدادات الهاتف» and a «حاول مرة أخرى» button | low | flow |
| SA9 | Scan done | student | Only the status line | Add the class name and time; back to home after 3 s | low | visual |

#### Wording (Arabic first)

| ID | Where | Now | Suggested | Sev |
|:--|:--|:--|:--|:-:|
| W1 | Errors GROUP_REFERENCE_INVALID, WORKSPACE_NOT_FOUND, ALREADY_MEMBER, SCOPE_TEACHER_INVALID, STUDENT_REFERENCE_INVALID | «مساحة العمل» | «مكان العمل» (audit 1 L3) | medium |
| W2 | Errors OTP_INVALID, CHECKIN_CODE_INVALID, CHECKIN_CODE_EXPIRED | «الرمز», «رمز حصة», «امسح الشاشة» | «كود الدخول» / «كود الحضور» / «وجّه الكاميرا مرة أخرى» (audit 1 L1, L2) | medium |
| W3 | Errors INVALID_CREDENTIALS, PHONE_TAKEN | «الهاتف» | «الموبايل» (audit 1 L9) | low |
| W4 | Errors ENTRY_NOT_FOUND, ENTRY_ALREADY_REVERSED, ENTRY_NOT_REVERSIBLE | «القيد» | «الدفعة» / «الإلغاء» (audit 1 L5) | low |
| W5 | teacherBusyAt, TEACHER_BOOKED, scan.hint, timetable.teacherBookedAt | «المدرس» | «المدرّس», as everywhere else | low |
| W6 | Cash page | nav «ملخص اليوم», title «ملخص النقدية اليومي» | «ملخص اليوم» for both | low |
| W7 | Fees, forgot password | «مين عليه فلوس», «لو فيه حساب…» | MSA like the rest: «عليهم مصروفات», «إن كان هناك حساب…» | low |

#### Visual system

| ID | Where | Problem | Suggestion | Sev |
|:--|:--|:--|:--|:-:|
| V1 | Most pages · 375 | Cards inside cards (page card → list card → row box) with 16–24 px padding at each level leave ~300 px for content | On phones, sections without an outer card; rows with 12 px padding | medium |
| V2 | Today, student home | The gradient next-class card is full size even when the class is hours away | A one-line card when the class is more than 2 h away | low |
| V3 | Many forms | Secondary actions are full-width outline buttons («إضافة إلى مجموعة…», «إنشاء رابط التفعيل», «إغلاق الحصة», «العودة للجدول», «أرشفة المجموعة»), as heavy as the primary | Full width only for the one primary action; secondary as text or small buttons | low |

### Not covered

A real camera scan and installing the PWA on a phone (the browser pane blocks the camera), the password-reset email end to end and the owner's reset link, a removed member's next request, and offline behaviour. Worth a pass on a real phone before a center uses it. **Done Nov 17:** Ziad checked these on a real phone.
