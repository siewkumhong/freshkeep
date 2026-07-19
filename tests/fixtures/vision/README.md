# Synthetic paired-photo accuracy gate

`npm run test:vision-live` generates 16 non-sensitive, high-resolution item and date-label pairs in memory. No fixture photos are stored, and the runner prints only provider, model, fixture ID, pass/fail, and numeric usage.

The cases cover six clear dates, four ambiguous numeric formats, two labels with multiple dates, two blurred or obscured labels, one invalid date, and one missing date. Every case also has an allowlist for its useful item name.

Set `OPENAI_API_KEY` and `OPENROUTER_API_KEY` in the local `.env` before running the gate. The runner:

1. Sends every fixture once at the 1,024-pixel item and 1,408-pixel date limits to both providers.
2. Requires exact dates and date types for clear cases.
3. Requires manual fallback for every unsafe case.
4. Requires every normalized item name to match its allowlist.
5. Sends one additional 1,800-pixel baseline pair to each provider.
6. Requires at least 20% fewer OpenAI input tokens and no OpenRouter input-token increase.

There are no automatic retries. A failure keeps the current production image limits and must be investigated before publishing the optimized profile. Complete one real-device two-photo smoke test after the synthetic gate passes.
