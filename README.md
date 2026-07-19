# FreshKeep

FreshKeep is a mobile-first shared pantry and fridge tracker. A household member photographs an item and its date label, confirms the extracted details, and receives a reminder digest two calendar months before the date.

## Local development

Requires Node.js 22.13 or newer.

```bash
npm install
cp .env.example .env
npm run dev
```

The development login defaults to `owner@freshkeep.local`. D1 and R2 bindings are declared in `.openai/hosting.json` and simulated locally by Vinext.

## Photo-analysis provider

`/api/analyze` supports one deployment-wide provider. OpenAI is the safe default and remains available for immediate rollback.

| Setting | Purpose | Default |
| --- | --- | --- |
| `VISION_PROVIDER` | `openai` or `openrouter` | `openai` |
| `OPENAI_API_KEY` | OpenAI secret key | none |
| `OPENAI_MODEL` | OpenAI vision-capable model | `gpt-5.4-mini` |
| `OPENROUTER_API_KEY` | OpenRouter secret key | none |
| `OPENROUTER_MODEL` | OpenRouter vision model | `qwen/qwen3-vl-30b-a3b-instruct` |
| `APP_URL` | Public site origin, sent as OpenRouter's optional referrer | none |
| `ANONYMOUS_UPLOAD_SECRET` | Stable signing secret for private no-login add links | none |

Both providers receive the same prompt, two images, and strict output schema. OpenRouter requests pin the ZDR-compatible `novita/bf16` endpoint, require parameter support, use temperature 0 with seed 0, and cap output at 300 tokens. FreshKeep makes one request only: there are no automatic retries, response healing, free-model routing, or cross-provider fallback.

The browser prepares each photo once before upload: item photos use a 1,024-pixel longest edge, date-label photos use 1,408 pixels, and both use JPEG quality 0.86. Returning to unchanged photos reuses the prior in-memory analysis instead of spending another model request. Server logs may include provider-reported token counts, cost, byte sizes, latency, model, and outcome, but never photos or extracted fields.

The shared validator accepts only real ISO dates. Ambiguous, unreadable, invalid, missing, or multiple dates are cleared and require manual entry. Human confirmation is always required. The date-label photo is never persisted.

## No-login household add link

The household owner can retrieve the permanent private link from the Household panel. The link opens `/add` directly, requires no account, and permits only photo analysis and confirmed item creation. Inventory data, stored photos, editing, deletion, and membership stay signed-in.

Keep `ANONYMOUS_UPLOAD_SECRET` unchanged across deployments so the link remains identical. Use a random value of at least 32 characters and rotate it only if the link is exposed. Anonymous requests are limited to 50 analyses and 50 saves per household per Singapore calendar day.

### Switch to OpenRouter

1. Add `OPENROUTER_API_KEY` as a secret environment value in Sites.
2. Leave `OPENROUTER_MODEL` pinned to `qwen/qwen3-vl-30b-a3b-instruct` unless a replacement has passed the same accuracy evaluation.
3. Run the 16-case paired-photo accuracy gate described in `tests/fixtures/vision/README.md`.
4. Set `VISION_PROVIDER=openrouter` only after every gate condition passes.
5. Redeploy the latest saved site version so the environment change takes effect.

If no ZDR endpoint can satisfy the structured-output request, analysis fails safely and the app opens manual entry.

### Roll back

Set `VISION_PROVIDER=openai` and redeploy. The OpenAI key and model settings remain in place, so no code or database change is needed.

## Other runtime settings

| Setting | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Sends invitation and reminder emails |
| `REMINDER_FROM` | Verified sender, for example `FreshKeep <reminders@example.com>` |
| `REMINDER_CRON_SECRET` | Protects the reminder execution endpoint |

## Verification

```bash
npm run lint
npx tsc --noEmit
npm test
```

`npm test` builds the production worker and runs the date, provider-contract, safety, and product-shell tests. Before selecting OpenRouter in production, also complete the paired-photo evaluation and a real-device two-photo smoke test.

Run the synthetic paired-photo gate with `npm run test:vision-live` after setting both provider keys in `.env`. The evaluator generates all 16 high-resolution fixtures in memory, sends each optimized pair once to each provider, and makes one additional baseline request per provider for token comparison. It never prints fixture text or model-extracted fields.
