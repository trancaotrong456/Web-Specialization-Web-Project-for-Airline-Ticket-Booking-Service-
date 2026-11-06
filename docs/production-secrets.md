# Production secret injection

Production must use `docker-compose.yml` together with `docker-compose.prod.yml` and an external secret store. Do not copy the local `.env` file into a production image or commit it.

Run forward migrations through `node scripts/migrate.js --env production`. The preflight rejects missing credentials, root/default users and known local/test database names before invoking Sequelize CLI. Never invoke `sequelize-cli` directly against a production target.

Required values are injected as environment variables by the deployment platform:

- Database: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS` and the MySQL root/application values used by the database service.
- Authentication: distinct `JWT_SECRET` and `JWT_REFRESH_SECRET`, each at least 32 characters.
- payOS live mode: `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`, `PAYOS_BASE_URL`, `PAYOS_RETURN_URL`, `PAYOS_CANCEL_URL`, `PAYOS_WEBHOOK_URL`, and `PAYOS_TRUSTED_HOSTS`.
- Email live mode: `EMAIL_DELIVERY_MODE=live`, `RESEND_API_KEY`, and a verified `EMAIL_FROM` address.

`PAYOS_MODE=disabled` and `EMAIL_DELIVERY_MODE=disabled` are safe defaults when those integrations are not yet approved. `PAYOS_MODE=demo` is rejected in production. Test processes always use the no-op email provider, even if a live delivery mode is present.

For live payOS, `PAYOS_RETURN_URL` and `PAYOS_CANCEL_URL` must be the public frontend SPA result route `/payments/result`; they must not point to the backend informational endpoint. `PAYOS_WEBHOOK_URL` is the separate public HTTPS backend endpoint `/api/v1/payments/payos/webhook`. The webhook URL must be registered/confirmed in the payOS merchant channel before enabling live traffic. Include every URL hostname used by these three values in `PAYOS_TRUSTED_HOSTS`.

## payOS webhook registration runbook

1. Provision a public HTTPS backend and verify `POST /api/v1/payments/payos/webhook` is reachable without customer JWT authentication.
2. Provision the frontend result route `/payments/result` over HTTPS.
3. Inject payOS credentials and callback URLs through the deployment secret store; never place them in an image, repository or shell history.
4. In the payOS merchant channel, register the exact backend webhook URL and save/confirm the channel configuration.
5. Observe the signed validation callback. The endpoint must return 2xx after signature verification; an unknown signed order is acknowledged without changing Booking or Payment state.
6. Verify delivery using application access logs and reconciliation metrics, not by fabricating a successful payment. Invalid signatures must return an error and perform no mutation.

If registration fails, check DNS/TLS reachability, the exact path and HTTP method, firewall/proxy forwarding, JSON body forwarding and `PAYOS_TRUSTED_HOSTS`. Do not disable signature verification or point the webhook at the browser return URL.

## deployment and rollback runbook

Before approval, take a database backup according to the platform recovery policy, verify migration files against the target schema, render the production Compose configuration without exposing its output, and confirm that all live secrets come from the secret store. Keep `PAYOS_RECONCILIATION_WORKER=false` until the deployment owner approves a single worker topology and the lease/reconciliation migrations are present. Enable pending-payment reconciliation only after that approval.

The release owner must approve health checks for the API, database connectivity, webhook reachability, callback URL validation and reconciliation metrics. Roll back the application image if health checks fail, webhook verification errors persist, or payment state processing is not trustworthy. Roll back only the application version; do not roll back payment rows, delete pending transactions or reverse inventory manually as deployment recovery.

During rollback, leave pending payments intact, keep gateway callbacks idempotent, and rerun reconciliation after the compatible version is restored. Late successful payments remain subject to the manual-review policy and must be resolved through the existing durable reconciliation workflow.

Before deployment, run a secret scanner against the repository and CI artifacts without printing matches. If a credential is found in a local `.env`, CI log, image layer or commit, revoke it through the provider, issue a replacement, update the secret store, and invalidate the old value. Rotation is an operator action; the application never rotates credentials automatically.

Validate the production configuration before starting the API:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml config >/tmp/serene-production-compose.yml
```

The output file must be treated as sensitive and deleted after review. Start only after `NODE_ENV=production` validation passes and all callback URLs use HTTPS on explicitly trusted public hosts.
