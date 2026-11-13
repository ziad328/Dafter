# Demo video: shot list

Target length is 3–4 minutes, recorded on https://dafter-vert.vercel.app. Use a laptop for the staff screens, set to a phone width of 375 px (DevTools device mode) unless the shot says otherwise. Use a real Android phone for the student, mirrored or filmed.

## Before recording (once)

- [ ] Reset the demo data so nobody else's edits show up (see `docs/deploy.md` → "Demo accounts and resetting the data").
- [ ] Prepare one student phone. As the owner, open a student → create the activation link → open it on the phone → install the app → log in inside the installed app with the emailed code → the phone binds. This takes a few minutes, so don't film it. Mention it in one line in shot 4.
- [ ] Make sure that student is enrolled in a group with a session **today**. If there isn't one, move a session to today on the timetable.
- [ ] Record between **08:00 and 22:00 Cairo time**. Outside those hours, quiet hours hold the absence message until 08:00, and shot 7 shows nothing.
- [ ] Open the API once beforehand, so the video doesn't start with a cold start.
- [ ] Use two browser profiles: owner and teacher (sign in as `01000000002`).

## Shots

| # | Screen | Show | Say (one line) | ~s |
|:--|:--|:--|:--|--:|
| 1 | `/login` (Arabic, RTL) | Owner signs in with `01000000001` | "Dafter, Arabic-first, for tutoring centers in Egypt." | 15 |
| 2 | Home → workspace | The center name and the owner role. Switch workspace once if you like | "Each center is its own workspace, isolated in the database with RLS." | 15 |
| 3 | `/timetable` | The Saturday-first week and today's sessions. Optionally move or cancel a session that isn't the demo one | "Sessions are generated four weeks ahead from the group's weekly slots, in Cairo time." | 25 |
| 4 | Teacher profile → today's session → Start → `/sessions/:id/live` | The full-screen QR. Let it rotate once (10 s) | "The code changes every 10 seconds, so a photo sent to a friend doesn't work." | 20 |
| 5 | Student phone → installed app → Scan | Point the camera at the laptop's QR. The confirmation appears on the phone | "The student's phone signs each scan with a key that never leaves it." | 20 |
| 6 | Teacher's live screen | The student appears in the live list within about a second | "Check-ins show up live on the teacher's screen." | 10 |
| 7 | Live screen → Close (two taps) → `/dev/phone` | Everyone who didn't scan is marked absent. The parent's Arabic message is on the fake phone. Point out that a pair of siblings gets one message | "Closing marks absences and writes the parent message in the same transaction." | 25 |
| 8 | `/messages` | The log with statuses and the per-center switches (absence, session change) | "Each message is sent once, with quiet hours, and the center can switch each type off." | 15 |
| 9 | `/students/:id` → fees card | The balance, then record a payment → print-ready `/receipts/:id` | "Fees go into an append-only ledger in piastres. Mistakes are reversed, never edited." | 30 |
| 10 | Language switch → English | The same screen in English, left to right. Optionally open the timetable again | "Every screen works in Arabic and English, on a phone." | 15 |
| 11 | README / GitHub (optional) | The architecture diagram and the test numbers | "NestJS, React, PostgreSQL with RLS, tested with Testcontainers and Playwright." | 10 |

## Tips

- Turn off notifications. Zoom the browser so the text is readable in the video.
- If a scan fails on camera, cut and retake. Don't explain the failure in the video.
- Keep the student's real email out of the shot.
