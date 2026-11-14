# UX audit 2 (Nov 14, after the olive palette)

Every staff and student screen was opened at 375 px in Arabic with the dev seed (and Today on a 1280 px laptop), after the first audit (`docs/ux-audit.md`) was finished. The dev database holds hundreds of test groups and students, which makes list problems easy to see.

## Top 5

1. **Long lists have no shape.** Groups are identical cards ("اللغة العربية · الصف الأول الابتدائي" again and again, no count or fee), the timetable is one tall card per session, and the staff page draws every teacher checkbox for every assistant (6,000 px with 30 assistants).
2. **The student page is a long scroll of four cards.** The enrol form is always open, every payment has a bare «إلغاء الدفعة» under it, and the fees sit below the fold.
3. **Money reads like a database.** «مصروفات 2026-11», «500.00 ج.م.», and nowhere to see who owes across the center.
4. **Waiting messages don't say why.** The log shows «في الانتظار» for 8:00 ص with no hint that quiet hours hold them.
5. **Small wording and grammar slips.** «من 2 مسجّلين» (should be the dual), initials «سا» for «سنتر النور» (the «ال» is taken as a letter), «إيصال رقم21».

## Fixed during the audit

| ID | Screen | Problem | Fix |
|:--|:--|:--|:--|
| B1 | Group edit | Subject and grade showed «اختر…» on a fresh load (the form mounted before the lists), so saving could send them empty | Waits for the lists; e2e reloads the edit page and checks both (`4e0f1dc`) |

## Findings

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

## Product gaps seen while auditing

- No center-wide fees view (who owes this month, collected today); ST4 and F5 cover the daily part, a report is a bigger task.
- No password reset at all (A1).
- WhatsApp login (S8 from the first audit) still waits for the real WhatsApp provider.

## Status (Nov 14)

Done, each with unit tests (and e2e where a flow changed): F1–F5, M1–M3, LV1, AV1, A2, A3, W1, MO1, T1, G1, G2, TT1, TT2, MB1, ST1–ST4, and the show-password half of A1. Done after: password reset (A1, `0439868`), G1's per-group label (`d486b2f`), and the center-wide fees view from the product gaps (`/fees`). The owner-side reset link was skipped: it would let an owner take over a staff member's global account.

## Suggested order

1. **Quick wins (half a day):** F1, F2, F3, F4, M1, M2, M3, LV1, AV1, A2, A3, W1, MO1, T1.
2. **Lists that scale:** G1, G2, TT1, TT2, MB1.
3. **Student page and money:** ST1, ST2, ST3, ST4, F5.
4. **Accounts:** A1 (show password now, reset later).
