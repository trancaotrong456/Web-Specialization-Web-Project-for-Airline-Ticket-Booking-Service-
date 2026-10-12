# Serene Flightways — Airline Ticket Booking

## Local Docker demo setup

Requirements: Docker Desktop with a local context, Node.js 20+, and npm. The shared sample data and demo accounts are committed fixtures; members do not need to hand-enter seed data or passwords.

### Safe `docker.env` migration

`docker.env` is now a local-only ignored file; `docker.env.example` is the tracked template. If you already have `docker.env` before pulling this change, back it up before pulling because Git removes the previously tracked copy:

```powershell
$backupPath = Join-Path $env:USERPROFILE ("docker.env.serene-backup-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
Copy-Item .\docker.env $backupPath
$backupPath
git pull
```

After the pull, restore the backup only if `docker.env` is absent:

```powershell
if (-not (Test-Path .\docker.env)) { Copy-Item "<printed-backup-path>" .\docker.env }
```

Never overwrite a customized local file with the example. If you have no prior file, `npm run demo:up` copies `docker.env.example` only when `docker.env` does not exist. The template contains public local-demo database defaults only; do not use it for staging or production.

### One-command setup

For normal local development, run from PowerShell, CMD, or another host terminal:

```powershell
npm run demo:up
```

The host-side wrapper verifies the effective Docker context/endpoint and related overrides, refuses remote or uncertain engines, validates the Compose project and dedicated `airline_booking_docker` target, starts MySQL, waits until healthy, runs migrations, previews and additively seeds only missing shared fixtures, verifies an empty post-seed plan, then starts the API and checks its health. Invoking this command is the explicit intent to prepare the local demo DB; writes remain blocked until Docker and database identity checks pass. It never drops a volume or changes an existing account password, schedule, booking, or payment.

The API Compose service is gated on a successful bootstrap agent and a durable marker tied to the verified MySQL container identity. Running `docker compose up` directly on an uninitialized local stack will not make the API ready; use `npm run demo:up`. If Docker Desktop is unavailable, the command exits before Compose startup or database work. Production startup remains independent of the local demo marker and fixtures. A host-port conflict is reported without stopping unrelated processes.

`npm run demo:setup` remains an interactive maintenance/review utility for an already bootstrapped stack. It previews existing and planned rows and applies only after the exact confirmation `CHO PHÉP APPLY DEMO SEED`; non-interactive runs do not apply. Do not use it for first-time startup.

The shared local-only demo accounts are:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@airline-booking.local` | `DemoAdmin@2026!` |
| Staff | `staff.demo@airline-booking.local` | `DemoStaff@2026!` |
| Customer | `customer.demo@airline-booking.local` | `DemoCustomer@2026!` |

These are public test credentials for the isolated Docker-local demo only. Passwords are bcrypt-hashed before insertion. Existing users, passwords, roles, profile fields and status are never updated; if an account already exists, setup preserves it, so its existing password may differ from the table above. Never use these credentials on staging or production.

The shared seeder uses committed Roles, Airlines, Airports, Flights, Fare Classes and Promotions fixtures. A new database receives 50 scheduled flights (10 routes × 5 days), 100 fare classes and 10 promotions. The initial flight date is chosen for the next day in Vietnam time and is shown in preview. On reruns, the complete existing schedule is inferred and retained even when the date has passed; partial schedules, identity conflicts or mismatched fare classes are refused rather than repaired. Existing promotion usage, including `used_count`, is not changed. The seeder never creates or modifies bookings or payments and never calls the 100,000-user seeder.

For a read-only preview without setup orchestration, run `npm run seed:demo:docker`. It requires already running, verified local Compose services. `npm run demo:up` is the recommended first-start and normal startup path for contributors.

After setup, start the frontend in another terminal:

```powershell
npm --prefix frontend run dev -- --port 5174
```

API health is available at `http://localhost:5000/api/v1/health`; the local MySQL host port defaults to `3307`. Stop services without deleting data using `docker compose --env-file docker.env stop` or `docker compose --env-file docker.env down`. Do not use `down -v` as routine setup; it deletes the demo database volume.

## CI/CD

GitHub Actions runs on pushes and pull requests to `main`/`develop`, installs dependencies, checks Node.js syntax and builds the Docker image. Render deployment behavior is controlled by the repository's deployment configuration.
