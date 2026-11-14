# UX, UI and language audit (Nov 14)

A walkthrough of the redesigned app as owner, teacher, assistant and student, in Arabic and English, on a phone (375 px) and a laptop. **Nothing here is implemented yet.** Items already in `docs/known-limits.md` are left out unless they block a daily goal.

**Severity:** high = blocks or slows a daily goal, or reads wrong to every user · medium = noticeable friction · low = polish.
**Effort:** S = under an hour · M = a few hours · L = a day or more.

## Top 5

1. **Recording a payment takes about 7 taps plus a long scroll.** "تسجيل دفعة" on Today just opens the students list. The payment form sits low on a long student page, and the amount isn't pre-filled with what the student owes.
2. **Registering a student and putting them in a group is two separate forms and about 7 taps.** The vision's 20-second door registration isn't met. The form shows every optional field.
3. **The student app was left out of the redesign.** It still has the old cards, 24-hour times and dot separators. The student's main action, Scan, is a small button inside a status card, and Sign out sits in the header where it's easy to tap by mistake.
4. **The Arabic wording uses one word for two different things.** "الرمز" means both the QR code and the email login code, and "امسح الشاشة" reads as "wipe the screen". "إلغاء" has four different meanings across the app.
5. **The live screen on a phone isn't built for class.** The QR and the class list fight for space, the tab bar stays on screen, and a wrong "تحضير" tap can't be undone.

## Clicks to goal (phone, already signed in, workspace remembered)

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

## Owner

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

## Teacher

| # | Screen | Issue | Why it matters | Suggested fix | Sev | Effort |
|:-:|:--|:--|:--|:--|:-:|:-:|
| T1 | Live (phone) | The QR fills the screen width, and the class list starts below it; the header and tab bar stay visible | Marking students without a phone means scrolling past the QR every time | A full-screen QR mode (no header or tabs) and a separate "class list" tab or toggle | high | M |
| T2 | Live | A wrong "تحضير" tap can't be undone from this screen | Mistakes stay until someone uses the API | Tap a marked row to choose present, late, excused or absent | high | M |
| T3 | Live | After closing, there's no summary | The teacher doesn't see "18 present, 3 absent, 1 make-up" | A summary card with counts and "messages sent to N parents" | medium | S |
| T4 | Live | The screen may dim during class (known limit) and there's no brightness hint | The QR stops being scannable | Wake Lock API while the QR is shown | medium | S |
| T5 | Timetable | Every future card shows "نقل" and "إلغاء الحصة" | Busy cards, and an easy wrong tap on "cancel" | Move both into a "⋯" menu per card | medium | S |
| T6 | Group form | Old style, one long column; the time fields are the browser's native time pickers | Inconsistent; in Arabic the native time field reads left to right | Two-column layout on laptops; slot rows as chips like on the groups list | low | M |
| T7 | Groups | No student count on a group card | A teacher can't see how full a group is | "12 / 30 طالب" on the card (the roster endpoint already exists) | low | S |

## Assistant (at the door)

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

## Student (installed app)

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

## Language (Arabic first)

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

## UI consistency

| # | Where | Issue | Suggested fix | Sev | Effort |
|:-:|:--|:--|:--|:-:|:-:|
| U1 | Login, register, invite, workspaces, messages, staff, forms | Only got the shared card, input and dropdown styles; no page headers, icons or layout | Same `PageHeader` + `Panel` pattern as students and groups | medium | M |
| U2 | Login header | The text "دفتر" with no logo, unlike the staff shell | Use the logo and wordmark | low | S |
| U3 | More (phone) | "تغيير مساحة العمل" row has no icon, unlike the rows above | Add an icon | low | S |
| U4 | Phone header | The workspace chip can take 60% of the header next to the logo | Show the name only, smaller; the role on the More screen | low | S |
| U5 | Student app, receipt | Still 24-hour times | `displayTime` everywhere a person reads a time | medium | S |
| U6 | All | No dark mode | Optional; many teachers use phones at night | low | M |

## Suggested order

1. **Quick wins (a day):** O1, A1, A4, S2, S6, all of L1–L15, U5. **Done Nov 14**: L3 became «مكان العمل» rather than «السنتر», since an independent teacher has no center; L8 kept «مالك» and fixed the one place that said «صاحب المساحة»; A4 pre-fills only when the student is in one group.
2. **The three slow daily jobs:** the payment sheet (Top 5 #1), group in the new-student form (A2), and the live phone layout with undo (T1, T2). **Done Nov 14**: the sheet opens from Today and the students list (search, pay, receipt: 3 taps plus the search); the group in the new-student form also sets the grade; the full-screen QR is a button, not the default, and the class list is a jump button rather than a separate tab; a status is changed by tapping it in the row.
3. **The student app redesign:** S1, S3, S4, S5. **Done Nov 14**: the next class sits on top in the staff app's gradient card, with a large Scan button under it; the schedule is grouped by day with today marked and cancelled classes struck through; the history opens with «حضرت X من Y» (excused classes are not counted) and coloured status pills; sign-out moved to a folded «الإعدادات» section and needs a second tap, and now lands on the student login rather than the staff one.
4. **Share buttons:** O3, A7, A8.
5. **Consistency pass:** U1, O5, O6, T5.
