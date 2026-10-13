# Deployment

> Status: **M3 complete (Phase 13).** Not deployed anywhere yet. This describes what the code needs, and the container images it ships with.

## Topology

| Component | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web app   | Node ≥ 22 (`npm run build && npm run start`) or a container. With `SCAN_QUEUE=bullmq` the web app only enqueues, so it can also run on serverless. With `SCAN_QUEUE=inline` (single server) it needs a long-running process. Serve over HTTPS, so the session cookie gets the `__Host-` prefix and HSTS applies.                                                                                                                                                                             |
| Worker    | **always required**: it alone runs scheduled monitoring, alert emails and the account purge, and with `SCAN_QUEUE=bullmq` every scan. A long-running container (`Dockerfile.worker`) or VM running `npm run worker:build` then `node --conditions=react-server dist/worker.mjs`; never a serverless function. It needs the same env as the web app. Scale it by running more instances; scheduling claims are atomic. It stops gracefully on SIGTERM (finishes in-flight scans, 30 s limit). |
| MongoDB   | a managed cluster (e.g. Atlas) or an authenticated self-hosted instance. **Never an open instance.** Use a least-privilege user with read/write on the app database only. A standalone server works (no transactions needed, D-004).                                                                                                                                                                                                                                                         |
| Redis     | managed or self-hosted, with `maxmemory-policy noeviction` and auth/TLS. Used for rate limits, provider budgets and the BullMQ queues. Rate limits **fail closed**, so Redis is required.                                                                                                                                                                                                                                                                                                    |
| Email     | a transactional provider's SMTP relay (`SMTP_HOST/PORT/SECURE/USER/PASSWORD`, `EMAIL_FROM` on a domain with SPF/DKIM).                                                                                                                                                                                                                                                                                                                                                                       |
| Proxy     | if a load balancer or CDN sits in front, set `TRUSTED_PROXY_COUNT` to the number of hops that append `X-Forwarded-For` (D-021).                                                                                                                                                                                                                                                                                                                                                              |

## Vercel only, with Vercel Cron (D-039)

No second host: the web app runs on Vercel, scans run inside the request (`after()`), and Vercel Cron calls `GET /api/cron/run` for monitoring, alerts and the account purge.

**1. Services to create (all have free tiers):**

| Service                        | What to set up                                                                                                                                                                                                                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MongoDB Atlas (M0)             | A cluster in the region nearest your Vercel functions (default `iad1`, i.e. AWS us-east-1). A database user with `readWrite` on `exovault` only. Network Access: `0.0.0.0/0`, because Vercel has no fixed IPs on Hobby. So the user's long random password is the protection. |
| Redis (Upstash or Redis Cloud) | One database; copy the TLS URL (`rediss://default:<password>@<host>:6379`). Only rate limits use it in this mode, so traffic is tiny.                                                                                                                                         |
| SMTP                           | Brevo (no domain needed: verify one sender address; `smtp-relay.brevo.com:587`) or Resend (needs a verified domain to email anyone but yourself; `smtp.resend.com:465`, user `resend`, password = API key).                                                                   |

**2. Environment variables** (Vercel → Project → Settings → Environment Variables, scope **Production**):

| Variable                                                              | Value                                                                                                                        |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `APP_URL`                                                             | `https://<your-project>.vercel.app`, the exact production URL with no trailing slash                                         |
| `MONGODB_URI`                                                         | Atlas URI **with `/exovault`**: `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/exovault?retryWrites=true&w=majority` |
| `MONGODB_URI_TEST`                                                    | same cluster, database `exovault_test` (validated at startup, never used in production)                                      |
| `REDIS_URL`                                                           | the `rediss://…` URL                                                                                                         |
| `IDENTIFIER_ENCRYPTION_KEYS`                                          | `v1:` + `openssl rand -base64 32`                                                                                            |
| `IDENTIFIER_ENCRYPTION_ACTIVE_KEY_ID`                                 | `v1`                                                                                                                         |
| `BLIND_INDEX_PEPPER`                                                  | `openssl rand -base64 32`                                                                                                    |
| `AUTH_SECRET`                                                         | `openssl rand -hex 32`                                                                                                       |
| `SCHEDULER`                                                           | `cron`                                                                                                                       |
| `SCAN_QUEUE`                                                          | `inline`                                                                                                                     |
| `CRON_SECRET`                                                         | `openssl rand -hex 32`                                                                                                       |
| `CRON_INTERVAL_MINUTES`                                               | `1440` (matches the daily schedule in `vercel.json`; Hobby allows at most daily)                                             |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` | from the SMTP provider (`SMTP_SECURE=true` only for port 465)                                                                |
| `EMAIL_FROM`                                                          | `Exovault <the-verified-sender@…>`                                                                                           |
| `TRUSTED_PROXY_COUNT`                                                 | `1` (Vercel's edge sets `X-Forwarded-For`)                                                                                   |
| `PROVIDER_MODE`                                                       | `mock` (labelled demo data), or `live` plus `HIBP_API_KEY` and `HIBP_REQUESTS_PER_MINUTE`                                    |
| `PASSWORD_BREACH_CHECK`                                               | `on`                                                                                                                         |

Leave unset: `NODE_ENV` (Vercel sets it), `DESIGN_SYSTEM_PAGES` (the `/design-system` reference pages 404 in production unless set to `on`), `EXOVAULT_ALLOW_TEST_SECRETS`, `NEXT_OUTPUT`, `WORKER_*`, `MONITORING_TICK_MS`, `NOTIFICATION_DISPATCH_MS`, `ACCOUNT_PURGE_MS` (worker only). The secrets must be **new values**, not the ones in your `.env.local`, and must never change once data exists. Losing `IDENTIFIER_ENCRYPTION_KEYS` makes stored addresses unreadable.

**3. Create the indexes (and optionally the demo account) once, from your machine,** with the production values:

```bash
npx vercel link && npx vercel env pull .env.production.local --environment=production
set -a; source .env.production.local; set +a
npm run db:indexes
npm run seed            # optional: demo@exovault.example with fictional data; needs PROVIDER_MODE=mock
rm .env.production.local
```

**4. Deploy:**

- Import the GitHub repo in Vercel. The framework preset is Next.js, the build command is `npm run build`, and Node 22 is used (`engines`).
- In Vercel → Settings → General → Node.js Version, choose **22.x**, so a future Node major is never picked automatically (`engines` says `>=22`).
- `vercel.json` registers the cron (`0 6 * * *`, daily at 06:00 UTC; Hobby runs it within that hour).

**5. Check:**

- Sign up on the production URL and confirm the code email arrives.
- Run a scan.
- In Vercel → Settings → Cron Jobs, press **Run** once. The response is a JSON summary, and `401` without the secret.

**What changes compared with the worker:**

- Monitoring offers "Daily" only, and the page says checks run once a day.
- Alerts and the daily summary go out with the daily run (the settings page says "at the first scheduled run after 08:00").
- The account purge runs daily.
- Preview deployments have a different URL than `APP_URL`, so sign-in and Origin checks fail there by design. Test on the production URL.
- On Vercel Pro, set the cron to `*/15 * * * *` and `CRON_INTERVAL_MINUTES=15`; every frequency becomes available.

## Container images (D-038)

```bash
docker build -t exovault-web .                              # Next standalone server, non-root, healthcheck on /
docker build -f Dockerfile.worker -t exovault-worker .      # worker bundle + production dependencies
docker run --env-file .env.production -p 3000:3000 exovault-web
docker run --env-file .env.production exovault-worker
```

- Nothing secret is baked in. `.dockerignore` excludes `.env*` and `.git`, and the build needs no environment variables.
- Configuration comes only from the runtime environment. Use the platform's secret store, not an `--env-file` on disk, in real deployments.
- Run `npm run db:indexes` once per release from a machine or job with the same env.
- CI builds both images on every push (not pushed to a registry).
- `docker-compose.yml` stays dev-only (Redis + Mailpit). MongoDB runs outside Docker (spec 4.5).

Suggested hosts:

- **Web:** Vercel or any Node/container host. On serverless, use `SCAN_QUEUE=bullmq` so the request only enqueues.
- **Worker:** Fly.io, Railway, Render or a VM.
- **Data:** Atlas and a managed Redis with `noeviction`.

## Steps

1. Provide every variable from `.env.example` through the platform's secret store. Generate secrets fresh: `IDENTIFIER_ENCRYPTION_KEYS`, `BLIND_INDEX_PEPPER`, `AUTH_SECRET`. **Losing the encryption keys makes stored identifiers unreadable; losing the pepper breaks duplicate detection.** Back them up separately from database backups.
2. Set `APP_URL` to the public HTTPS origin and `NODE_ENV=production`.
3. Choose `PROVIDER_MODE`:
   - `live` needs `HIBP_API_KEY` and `HIBP_REQUESTS_PER_MINUTE` matching the subscription.
   - `mock` labels everything "Demo data".
4. Run `npm run db:indexes` once per release; production doesn't auto-create indexes (D-010). This creates the TTL indexes that enforce retention, and the unique indexes that keep sign-up bindings and pending deletions to one per user.
5. Optionally tune `ACCOUNT_DELETION_GRACE_DAYS` (default 7) and `ACCOUNT_PURGE_MS` (default hourly). Update the `/privacy` page wording if you change the grace period's meaning; the number itself is read from env.
6. Start the web app and the worker. Confirm the response headers (CSP with nonce, HSTS, nosniff, frame denial) and a sign-up round trip.

## Backups and moving from local MongoDB to Atlas (spec 4.5)

- **Local data lives on this machine** until a hosted database is configured. Back up with `mongodump --uri "mongodb://127.0.0.1:27017/exovault" --out backups/$(date +%F)`.
- **To migrate:**
  1. Create the Atlas cluster and a least-privilege user. Allow-list the app's egress IPs.
  2. Run `mongodump` locally, then `mongorestore --uri "<atlas-uri>/exovault" backups/<date>/exovault`.
  3. Run `npm run db:indexes` against Atlas.
  4. Point `MONGODB_URI` at Atlas.
  5. Keep the **same** encryption keyring and pepper. They're what make the restored ciphertext readable.
- **Retention after deletion:** backups should roll off within 35 days (spec 5.2).

## Key rotation

1. Add a new key to `IDENTIFIER_ENCRYPTION_KEYS` (e.g. `v1:…,v2:…`) and set `IDENTIFIER_ENCRYPTION_ACTIVE_KEY_ID=v2`. Deploy.
2. Run `npm run keys:rotate` until it reports `rotated: 0, failed: 0`.
3. Only then remove `v1` from the keyring.
