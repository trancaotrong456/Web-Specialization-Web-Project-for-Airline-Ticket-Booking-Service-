# Local Docker demo data

This helper is for the dedicated local Compose database only. It refuses production, non-development, remote Docker contexts, unexpected container identities, and any database other than `airline_booking_docker`. It never deletes existing rows and never creates bookings or payments.

The default command is a read-only dry run:

```powershell
npm run seed:demo:docker
```

It reports which demo rows already exist and which rows it would create. It does not open a transaction or write to the database. This command requires the local `api` and `db` Compose services to be running and the database healthy.

For an intentional local demo-data apply only:

1. Copy `demo-seed.local.env.example` to `demo-seed.local.env`. PowerShell: `Copy-Item demo-seed.local.env.example demo-seed.local.env`. CMD: `copy demo-seed.local.env.example demo-seed.local.env`.
2. Set three unique, demo-only passwords. Do not use real account credentials.
3. Choose `SEED_FLIGHT_START_DATE` once, 1–7 days in the future in Vietnam time. Keep it unchanged for reruns. If the existing schedule is found, the seeder recognizes it and does not create another one.
4. Run the dry-run command and inspect the counts first.
5. Only if the target and counts are expected, run:

```powershell
npm run seed:demo:docker -- --apply
```

`--apply` is an explicit write operation, guarded again inside the API container and wrapped in a database transaction. Existing accounts are left unchanged; new account passwords are bcrypt-hashed. The plan creates up to three demo accounts, 50 scheduled flights over ten real airport-code routes, two fare classes per flight (100 total), and ten promotions. Airline and airport IDs are read from the local database; missing prerequisites cause a safe refusal.

The runner sends only the current `scripts/demo-seed-core.js` and `scripts/seed-demo-local.js` source to a private temporary folder inside the already verified API container. It deletes that temporary folder when the command exits, so editing only these seed scripts does not require an API image rebuild or a bind mount. The payload contains only the four `SEED_*` fields; passwords are sent over Docker exec stdin, not command-line arguments or logs. No env file or secret is mounted into the container.

The API image still includes backend migrations/seeders and `sequelize-cli`; the Dockerfile keeps `npm ci` (including dev dependencies) because startup runs `npx sequelize-cli db:migrate`. Rebuilds are therefore only needed when API runtime dependencies or application image contents change, not for edits to the two demo-seed scripts.

This is mock/demo booking data only. It does not contact a payment provider, send email, or issue tickets. Remove `demo-seed.local.env` only through your normal local secret-management process; it is ignored by Git.
