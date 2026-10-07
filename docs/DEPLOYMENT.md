# Deployment

> Status: **first version (end of M1).** Not yet deployed anywhere; this describes what the code needs. It gets finalised and verified in Phase 13.

## Topology (M1)

| Component | Requirement                                                                                                                                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Web app   | a **long-running Node ≥ 22 server** (`npm run build && npm run start`, or a container). Scans run in an in-process queue (D-029), so **serverless is not supported until the M2 worker exists**. Serve over HTTPS, so the session cookie gets the `__Host-` prefix and HSTS applies. |
| MongoDB   | a managed cluster (e.g. Atlas) or an authenticated self-hosted instance. **Never an open instance.** Use a least-privilege user with read/write on the app database only. A standalone server works (no transactions needed, D-004).                                                 |
| Redis     | managed or self-hosted, with `maxmemory-policy noeviction` and auth/TLS. Used for rate limits and provider budgets now, BullMQ in M2. Rate limits **fail closed**, so Redis is required.                                                                                             |
| Email     | a transactional provider's SMTP relay (`SMTP_HOST/PORT/SECURE/USER/PASSWORD`, `EMAIL_FROM` on a domain with SPF/DKIM).                                                                                                                                                               |
| Proxy     | if a load balancer or CDN sits in front, set `TRUSTED_PROXY_COUNT` to the number of hops that append `X-Forwarded-For` (D-021).                                                                                                                                                      |

## Steps

1. Provide every variable from `.env.example` through the platform's secret store. Generate secrets fresh: `IDENTIFIER_ENCRYPTION_KEYS`, `BLIND_INDEX_PEPPER`, `AUTH_SECRET`. **Losing the encryption keys makes stored identifiers unreadable; losing the pepper breaks duplicate detection.** Back them up separately from database backups.
2. Set `APP_URL` to the public HTTPS origin and `NODE_ENV=production`.
3. Choose `PROVIDER_MODE`:
   - `live` needs `HIBP_API_KEY` and `HIBP_REQUESTS_PER_MINUTE` matching the subscription.
   - `mock` labels everything "Demo data".
4. Run `npm run db:indexes` once per release; production doesn't auto-create indexes (D-010).
5. Start the server. Confirm the response headers (CSP with nonce, HSTS, nosniff, frame denial) and a sign-up round trip.

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
