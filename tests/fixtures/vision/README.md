# Paired-photo accuracy gate

Keep evaluation photos non-sensitive. Each case needs an `item.jpg` showing the product front and a `date.jpg` showing only its printed date label. Test both configured providers with the identical pair; never reuse production uploads.

Place each pair under a folder named for its entry in `manifest.json`, then run `npm run test:vision-live` with both provider keys set. The runner prints only provider, model, fixture ID, and pass/fail; it does not print photos or extracted text.

The 16 required cases are:

1. Clear expiry date in `DD/MM/YYYY`.
2. Clear use-by date in `DD/MM/YYYY`.
3. Clear best-before date in `DD/MM/YYYY`.
4. Clear ISO numeric date.
5. Clear date with a full month name.
6. Clear date with an abbreviated month name.
7. Ambiguous numeric `03/04/2027`.
8. Ambiguous numeric `04/03/27`.
9. Ambiguous numeric `06-07-2027`.
10. Ambiguous numeric `07.06.27`.
11. Label containing packed-on and expiry dates.
12. Label containing manufacture and best-before dates.
13. Blurred date label.
14. Partially obscured date label.
15. Impossible date such as `31/02/2027`.
16. Label with no date.

OpenRouter passes only when cases 1–6 return the exact ISO date and correct date type, cases 7–16 return `date: null` with manual entry required, and no malformed response reaches the confirmation form. Record model IDs and results outside the repository; do not commit photos or extracted label text from real household items.
