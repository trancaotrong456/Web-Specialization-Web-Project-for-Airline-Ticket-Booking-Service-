# Production secret injection

Production must use `docker-compose.yml` together with `docker-compose.prod.yml` and an external secret store. Do not copy the local `.env` file into a production image or commit it.

Required values are injected as environment variables by the deployment platform:

- Database: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS` and the MySQL root/application values used by the database service.
- Authentication: distinct `JWT_SECRET` and `JWT_REFRESH_SECRET`, each at least 32 characters.
- payOS live mode: `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`, `PAYOS_BASE_URL`, `PAYOS_RETURN_URL`, `PAYOS_CANCEL_URL`, `PAYOS_WEBHOOK_URL`, and `PAYOS_TRUSTED_HOSTS`.
- Email live mode: `EMAIL_DELIVERY_MODE=live`, `RESEND_API_KEY`, and a verified `EMAIL_FROM` address.

`PAYOS_MODE=disabled` and `EMAIL_DELIVERY_MODE=disabled` are safe defaults when those integrations are not yet approved. `PAYOS_MODE=demo` is rejected in production. Test processes always use the no-op email provider, even if a live delivery mode is present.

Before deployment, run a secret scanner against the repository and CI artifacts without printing matches. If a credential is found in a local `.env`, CI log, image layer or commit, revoke it through the provider, issue a replacement, update the secret store, and invalidate the old value. Rotation is an operator action; the application never rotates credentials automatically.

Validate the production configuration before starting the API:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml config >/tmp/serene-production-compose.yml
```

The output file must be treated as sensitive and deleted after review. Start only after `NODE_ENV=production` validation passes and all callback URLs use HTTPS on explicitly trusted public hosts.
