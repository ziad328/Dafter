---
name: i18n-rtl
description: Use whenever adding or changing user-visible text, numbers, dates, currency, plurals, error messages, or Arabic search and normalization.
---
- Add keys to packages/i18n/locales/ar first, then en, with the same key set. Run `pnpm i18n:check`.
- Plurals use ICU with Arabic forms: zero, one, two, few, many, other.
- Numbers: Intl with ar-EG-u-nu-latn by default (Western digits). Money: "150 ج.م" / "EGP 150". Dates: Intl.DateTimeFormat; weeks start on Saturday.
- Wording: short, plain Arabic that Egyptian assistants understand at a glance.
- API error codes map to errors.<CODE> keys.
- Arabic search: use normalizeArabic() from packages/contracts on save and on query; never write a second version.
