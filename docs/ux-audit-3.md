# UX audit 3 (Nov 16)

Every staff and student screen opened in the running app (dev seed plus the e2e test data: ~100 groups, hundreds of students) as owner, teacher, assistant, independent teacher and student. Arabic and English, 375 px and 1366 px, dark and light. Ways in: phone login, email login, wrong password, empty form, rate limit, register, workspace picker and switching, staff invite link, student invite → install gate → email code → home → scan. The goal this time is **less on each screen**, not only bugs. Nothing here is implemented yet.

**Severity:** high = slows a daily job or confuses every user · medium = noticeable friction · low = polish.
**Type:** bug · flow (UX flow) · visual (density, hierarchy, spacing, wording).

## Top 10

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

## Phases

- [x] **Phase 1 · Quick wins (about a day):** W1–W7, F2, F5, SA6 (wording); TT4, A1, A2, H1, N4, E1, S5, SA1, F4, TT1, LV3 (small screen fixes). **Done Nov 16.** N4's cause was the hover state (dark text on the olive sidebar in the light theme). F4 got cell spacing and an unwrapped time; the minus sign looked fine on a second look. The English «Who owes» stayed (only the Arabic was colloquial). The full-screen QR keeps the count as a sentence; the page shows «3 / 20».
- [x] **Phase 2 · Less on each screen (2–3 days):** S1, S2, M1, D1, H2, H3, H5, F1, F3, R1, R3, N1, N2, G2, G3, G4, S4, S6, S7, TT2, V1, V3. **Done Nov 16** in four commits. Filters are one pill each that opens a searchable sheet, and groups are named by subject, label or first slot, and teacher (the shared name helper also covers G5's filters; the forms' dropdowns stay for Phase 3). Message settings live on `/messages/settings`, owner only, so the assistant's read-only view of the wording is gone. The dashboard shows the first 10 groups, lowest attendance first. Rooms, staff and settings leave the menu for non-owners, but their URLs still work. Found and fixed on the way: a dropdown inside a sheet opened its list outside the modal, where it couldn't be clicked (the staff «إدارة» sheet had it too). V1 and V3 were applied on the screens touched, not app-wide. R3's edit and archive moved behind a «⋯» per room, and S4's payments got a «+» in a follow-up.
- [ ] **Phase 3 · Missing flows (2–3 days):** G1, G5, H4, LV1, LV2, LV4, A6, A7, A10, A11 (needs `kind` on `/me`), A13, SA2, SA5, H7.
- [ ] **Phase 4 · API:** A3 (rate-limit keys and a retry time in the error), A5.
- [ ] **Phase 5 · Polish (any time):** A4, A8, A9, A12, N3, N5, N6, H6, TT3, TT5, TT6, S3, S8, S9, S10, LV5, E2, D2, D3, M2, M3, M4, R2, R4, R5, SA3, SA4, SA7, SA8, SA9, V2.

## Still open from audits 1 and 2

| Old ID | Now | Status |
|:--|:--|:--|
| Audit 1 T1 (full-screen QR without header or tabs) | LV2 | Half done: the button hides the list, but the header and tab bar stay |
| Audit 1 T3 (summary after closing) | LV4 | Open: only the present count, no absent or late, no messages count |
| Audit 1 T6 (native time fields, one long column) | TT5, G3 | Open |
| Audit 1 A6 (badges on student rows) | S3 | Half done: the balance badge shipped, «لم يُفعّل» didn't |
| Audit 1 L1, L2, L3, L5, L9 (wording) | W1–W4, SA6 | Fixed on screens, but back in error messages and the login email |
| Audit 2 M3 (one date format) | M4 | Fixed in the log, not on the fake phone |

## Findings

### Sign-in and accounts

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

### Shell and navigation

| ID | Screen | Who · locale · width | Problem | Suggestion | Sev | Type |
|:--|:--|:--|:--|:--|:-:|:--|
| N1 | More | owner · 375 | Nine flat rows mix daily (fees, cash), setup (rooms, staff, settings) and demo (fake phone); language and theme take two full-width rows | Three short sections with small headings; language and theme as two icon buttons in one row | medium | visual |
| N2 | More, sidebar | teacher, assistant, independent | Rooms, Staff, Settings and Dashboard show for roles that can't change them; Settings shows an editable field with «المالك فقط…» under it; an independent teacher sees Rooms and Staff | Hide owner-only entries; hide Rooms and Staff for an independent workspace until asked | medium | flow |
| N3 | Sidebar | owner · 1366 | 13 flat items; language, theme and sign-out take three full-width rows | Same three sections as N1; one row of icon buttons at the bottom | low | visual |
| N4 | Sidebar | all · light · 1366 | The «Dark mode» button is almost invisible (light text on a light chip over olive) | Use the sidebar's foreground color | medium | bug |
| N5 | Today | all · 1366 | The header search and the «Find a student» quick action do the same thing | Drop the tile on desktop; on phones a search icon in the header instead of a tile | low | visual |
| N6 | Breadcrumbs | all | /fees and /dashboard have none; /groups/:id/exams has none; /cash-summary, /rooms and /members do | One rule: every page opened from More or from another page has one | low | visual |

### Today

| ID | Screen | Who · locale · width | Problem | Suggestion | Sev | Type |
|:--|:--|:--|:--|:--|:-:|:--|
| H1 | Today | owner · all | «16 حصة اليوم» in the subtitle vs «11 عدد الحصص» in the tile (cancelled classes counted in one) | One number without cancelled ones, or «11 حصة · 5 ملغاة»; drop the tile | medium | bug |
| H2 | Today | all · 375 | Four ~120 px tiles (2×2) for four numbers | One compact strip: «11 حصة · 14 مسجّل · 3 حضروا · 97 طالب» | medium | visual |
| H3 | Today | all · 375 | Four ~160 px shortcut tiles; a teacher gets three, which leaves a hole | One row of four small icon chips | medium | visual |
| H4 | Today | teacher, owner | The big start button shows 17 h before a class that opens 30 min before | Before then: smaller card, «تُفتح 5:30 م», button disabled | high | flow |
| H5 | Today | all · 375 | Every future row has its own «ابدأ» (seven in a row); the subtitle cuts off the teacher («الصف الأول الابتدائي · أح…») | Button only on the next or open class; show the group label instead of the grade when there is one | medium | visual |
| H6 | Today | owner | The week chart draws days without classes as 0%; «50%» has no period next to it | «—» for days without classes; «50% هذا الأسبوع» | low | visual |
| H7 | Today (empty workspace) | new owner, independent | «لا توجد حصص اليوم / افتح الجدول» plus tiles full of zeros | A setup checklist: add a group → add a student → invite an assistant | medium | flow |

### Timetable

| ID | Screen | Who · locale · width | Problem | Suggestion | Sev | Type |
|:--|:--|:--|:--|:--|:-:|:--|
| TT1 | Timetable | all | The week bar never says which week is shown | «15 – 21 نوفمبر» between the arrows | medium | visual |
| TT2 | Timetable | owner · 375 | Two unlabeled chip rows (teacher, grade), each with its own «الكل»; they will wrap like Students as staff grows | One «تصفية» button opening a sheet, or one labeled, scrolling row | medium | visual |
| TT3 | Timetable | all · 375 | Titles cut to «اللغة العربية · الصف الأول الابتد…»; the label and room are lost | Line 1: subject + label; line 2: grade · teacher · room | low | visual |
| TT4 | Move form | owner, teacher · ar | The start-time label is «ابدأ» (imperative "Start!") | «من», as in the group form | low | bug |
| TT5 | Move form, group slots, exam date | all · ar | Native pickers show «11/21/2026» and «05:30 PM» in Arabic, left to right | A localized display (Arabic digits/«م» in Arabic), or set `lang` on the inputs | medium | visual |
| TT6 | Timetable | all · 1366 | One long list on a wide screen | A 7-column week grid on desktop | low | visual |

### Groups

| ID | Screen | Who · locale · width | Problem | Suggestion | Sev | Type |
|:--|:--|:--|:--|:--|:-:|:--|
| G1 | Group | teacher, owner | No group page: a tap opens the edit form; no roster, no next classes, no fees status | A group page: roster (with owes / not activated), next classes, exams; Edit in the header | high | flow |
| G2 | Groups | all · 375 | ~240 px cards (icon, title, grade, slot pill, divider, avatar, count) plus a detached «الامتحانات» button under each | Two-line rows; exams move into the group page | high | visual |
| G3 | Group form | owner | One long column; label, capacity, fee and room always open | Optional fields under «تفاصيل أكثر», like the student form; two columns on desktop | medium | visual |
| G4 | Group form | owner | «أرشفة المجموعة» is a full-width button right under «حفظ» | A text button at the end, after a gap, or in a «⋯» | low | visual |
| G5 | New student, enrol, filters | assistant | Groups show «المادة · الصف · المدرّس» only; 101 identical options | Add the label or first slot: «… · السبت 4:00 م» | high | flow |

### Students

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

### Live attendance

| ID | Screen | Who · locale · width | Problem | Suggestion | Sev | Type |
|:--|:--|:--|:--|:--|:-:|:--|
| LV1 | Live (too early) | teacher | Blank page with one red line, no title, no back | Keep the header and the list; a card «تُفتح 5:30 م» with a back button | medium | flow |
| LV2 | Live, full screen | teacher · 375 | «الكود بملء الشاشة» keeps the app header and tab bar | Fullscreen API, or hide the shell in this mode | medium | flow |
| LV3 | Live | teacher · ar | «لم يسجّل أحد بعد» over «من طالب واحد مسجّل» reads oddly | A big «0 / 1» with «حاضر» under it | low | visual |
| LV4 | Live, closed | teacher | Only «تم إغلاق الحصة.» and the present count; «العودة للجدول» although the breadcrumb says اليوم | Counts per status and «أُرسلت N رسالة لأولياء الأمور»; go back to where the teacher came from | medium | flow |
| LV5 | Live list | teacher | The marked status «حاضر» looks like plain text, not a button | A pill with a small chevron | low | visual |

### Fees, cash, receipts, exams

| ID | Screen | Who · locale · width | Problem | Suggestion | Sev | Type |
|:--|:--|:--|:--|:--|:-:|:--|
| F1 | Fees | owner · 375 | Two big cards (today, month), each with three method rows, mostly «0 ج.م.» | One card with both totals side by side; methods only when not zero | medium | visual |
| F2 | Fees | owner · ar | «مين عليه فلوس · 17 طالبًا» is colloquial; the rest is MSA | «عليهم مصروفات (17)» | low | visual |
| F3 | Cash summary | owner · dark | A white paper card with a light-grey native date field inside the dark app | Theme colors on screen; white only in `@media print` | medium | visual |
| F4 | Cash summary | owner · 375 | Time and receipt number run together («12:28 ص 17»); «-200 ج.م.» puts the minus on the wrong side | Card rows on phones; `<bdi>` around signed amounts | medium | bug |
| F5 | Receipt, cash summary, fees | all · ar | Three spellings: «ملغي», «(ملغى)», «أُلغيت» | «ملغاة» everywhere | low | visual |
| E1 | Exams | teacher · 375 | The date field overflows into «الدرجة النهائية» | Stack the two fields on phones | medium | bug |
| E2 | Exams | teacher | The new-exam form is always open above the list; no breadcrumb back to the group | A button that opens a sheet; المجموعات › group › الامتحانات | low | visual |

### Dashboard

| ID | Screen | Who · locale · width | Problem | Suggestion | Sev | Type |
|:--|:--|:--|:--|:--|:-:|:--|
| D1 | Dashboard | owner · 375 | ~20,000 px: a 140 px card per group, an empty chart area and «لا امتحانات مرصودة» | A compact table (group · attendance % · last exam), worst first; groups without data behind «عرض الكل» | high | visual |
| D2 | Dashboard | owner · 375 | Week labels cut («14 نوف…»); empty weeks draw flat lines; no values on the money bars | Short labels («14/11»), the value on tap or above each bar | low | visual |
| D3 | Dashboard | owner · ar | «آخر 8 أسابيع» repeats the selected chip; the plural has no one/two forms | Drop the subtitle | low | visual |

### Messages

| ID | Screen | Who · locale · width | Problem | Suggestion | Sev | Type |
|:--|:--|:--|:--|:--|:-:|:--|
| M1 | Messages | owner · 375 | The log starts ~1,200 px down, under the toggles and the wording editor | Log first; toggles and wording on a «إعدادات الرسائل» page behind a gear | high | visual |
| M2 | Messages | owner | Each row shows the time twice («… 8:00 ص» and «سيُرسل 8:00 ص…»); the text itself isn't shown | One time; tap a row to read the message | low | visual |
| M3 | Messages settings | owner · ar | Long toggle labels with brackets («لولي الأمر الأساسي فقط (وليس كل أولياء الأمور المسجلين)») | Short label, details in a hint line | low | visual |
| M4 | Fake phone | owner · ar | English bubbles get scrambled bidi; dates «2026/11/15، 3:40 م» differ from the app | `dir="auto"` per bubble; the shared date format | low | bug |
| M5 | Wording editor | owner · ar | ~~«was/were» is listed as a part in the Arabic tab~~ Not an issue: the editor already hides it in Arabic (found while planning) | — | — | — |

### Staff, rooms, settings

| ID | Screen | Who · locale · width | Problem | Suggestion | Sev | Type |
|:--|:--|:--|:--|:--|:-:|:--|
| R1 | Staff | owner · 375 | The invite form fills the first screen; the list is below | «+ دعوة» opens a sheet | medium | visual |
| R2 | Staff | owner | Row actions are bare icons (person-gear, key); the key (reset link) isn't obvious | A «⋯» with text items | low | visual |
| R3 | Rooms | owner · 375 | The add form is always open on top; every row has «تعديل» and «أرشفة» as text | «+ قاعة» opens a sheet; archive in a «⋯» | low | visual |
| R4 | Rooms | owner · ar | The subtitle is a rule («مجموعتان لا تُحجزان…») | Drop it, or make it a hint under the add form | low | visual |
| R5 | Settings | owner | A whole page for one number | Fine for now; group future settings (name, logo, quiet hours) as sections on this page | low | visual |

### Student app

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

### Wording (Arabic first)

| ID | Where | Now | Suggested | Sev |
|:--|:--|:--|:--|:-:|
| W1 | Errors GROUP_REFERENCE_INVALID, WORKSPACE_NOT_FOUND, ALREADY_MEMBER, SCOPE_TEACHER_INVALID, STUDENT_REFERENCE_INVALID | «مساحة العمل» | «مكان العمل» (audit 1 L3) | medium |
| W2 | Errors OTP_INVALID, CHECKIN_CODE_INVALID, CHECKIN_CODE_EXPIRED | «الرمز», «رمز حصة», «امسح الشاشة» | «كود الدخول» / «كود الحضور» / «وجّه الكاميرا مرة أخرى» (audit 1 L1, L2) | medium |
| W3 | Errors INVALID_CREDENTIALS, PHONE_TAKEN | «الهاتف» | «الموبايل» (audit 1 L9) | low |
| W4 | Errors ENTRY_NOT_FOUND, ENTRY_ALREADY_REVERSED, ENTRY_NOT_REVERSIBLE | «القيد» | «الدفعة» / «الإلغاء» (audit 1 L5) | low |
| W5 | teacherBusyAt, TEACHER_BOOKED, scan.hint, timetable.teacherBookedAt | «المدرس» | «المدرّس», as everywhere else | low |
| W6 | Cash page | nav «ملخص اليوم», title «ملخص النقدية اليومي» | «ملخص اليوم» for both | low |
| W7 | Fees, forgot password | «مين عليه فلوس», «لو فيه حساب…» | MSA like the rest: «عليهم مصروفات», «إن كان هناك حساب…» | low |

### Visual system

| ID | Where | Problem | Suggestion | Sev |
|:--|:--|:--|:--|:-:|
| V1 | Most pages · 375 | Cards inside cards (page card → list card → row box) with 16–24 px padding at each level leave ~300 px for content | On phones, sections without an outer card; rows with 12 px padding | medium |
| V2 | Today, student home | The gradient next-class card is full size even when the class is hours away | A one-line card when the class is more than 2 h away | low |
| V3 | Many forms | Secondary actions are full-width outline buttons («إضافة إلى مجموعة…», «إنشاء رابط التفعيل», «إغلاق الحصة», «العودة للجدول», «أرشفة المجموعة»), as heavy as the primary | Full width only for the one primary action; secondary as text or small buttons | low |

## Not covered

A real camera scan and installing the PWA on a phone (the browser pane blocks the camera), the password-reset email end to end and the owner's reset link, a removed member's next request, and offline behaviour. Worth a pass on a real phone before a center uses it.
