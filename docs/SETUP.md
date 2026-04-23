# Setup guide

This project is a single-page Gantt planner whose data lives in **Azure SQL Database**. The browser never sees the SQL connection string — it talks to a managed REST/GraphQL endpoint that **Azure Static Web Apps (SWA)** auto-generates from the connection string you paste into the SWA portal.

```
[ Browser ]  --HTTPS-->  [ Azure Static Web Apps ]
                         ├── serves index.html, css, js
                         └── /data-api  (Data API Builder, managed by SWA)
                                              │
                                              ▼ TDS (1433, private)
                                       [ Azure SQL Database ]
```

You configure exactly **one** thing: a connection string, in the SWA portal.

---

## Prerequisites

- An Azure subscription
- Azure CLI (`az`) and `sqlcmd` (or Azure Data Studio / SSMS) installed locally — only needed to run the schema script
- A GitHub account is optional (only needed if you choose GitHub-linked CI/CD)
- Node.js 18+ (only if you want to use the JSON → SQL migration generator)

---

## 1. Create the Azure SQL database

You can do this in the portal, but here's the CLI version. Pick names that are unique inside your subscription.

```powershell
$rg          = "rg-gantt"
$location    = "uksouth"
$sqlServer   = "sql-gantt"
$sqlDb       = "ganttdb"
$sqlAdmin    = "ganttadmin"
$sqlPassword = Read-Host "SQL admin password" -MaskInput

az group create -n $rg -l $location

az sql server create `
    -g $rg -n $sqlServer -l $location `
    -u $sqlAdmin -p $sqlPassword

# Allow Azure services (incl. SWA's Data API Builder) to reach the server.
az sql server firewall-rule create `
    -g $rg -s $sqlServer -n AllowAzureServices `
    --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0

# Allow your own IP so you can run the schema script.
$myIp = (Invoke-RestMethod https://api.ipify.org)
az sql server firewall-rule create `
    -g $rg -s $sqlServer -n AllowMyIp `
    --start-ip-address $myIp --end-ip-address $myIp

# Serverless tier is plenty for a planner — pauses when idle.
az sql db create `
    -g $rg -s $sqlServer -n $sqlDb `
    --edition GeneralPurpose --family Gen5 --capacity 1 `
    --compute-model Serverless --auto-pause-delay 60
```

---

## 2. Create the schema

Run [`sql/01-schema.sql`](../sql/01-schema.sql) against the new database. Replace the placeholders with values from above.

```powershell
sqlcmd -S "$sqlServer.database.windows.net" -d $sqlDb `
       -U $sqlAdmin -P $sqlPassword `
       -i sql/01-schema.sql
```

Optional: load the original example data with [`sql/02-seed-example.sql`](../sql/02-seed-example.sql).

---

## 3. Migrate your existing tasks JSON

If you have a `tasks.json` exported from the old standalone app, generate an `INSERT` script from it and run that:

```powershell
node sql/generate-migration-sql.js path/to/your-tasks.json > sql/03-import.sql

sqlcmd -S "$sqlServer.database.windows.net" -d $sqlDb `
       -U $sqlAdmin -P $sqlPassword `
       -i sql/03-import.sql
```

The generator preserves every field (person, task, dates, capacityImpact, complete, milestones). The generated script is wrapped in a transaction; open it and uncomment the `TRUNCATE` line if you want a clean replace instead of an append.

> Tip: the JSON shape the old app exported (`{ "tasks": [ ... ] }`) **and** a bare array of task objects are both accepted.

---

## 4. Deploy the static site to Azure Static Web Apps

Recommended: create SWA without GitHub repo linkage, then deploy from the local `web/` publish folder with a deployment token.

```powershell
$swaName = "swa-gantt"

# 1) Create the Static Web App (no GitHub OAuth consent required)
az staticwebapp create `
    -n $swaName -g $rg -l "westeurope" `
    --sku Free

# 2) Get a one-time deployment token
$deployToken = az staticwebapp secrets list `
    -n $swaName -g $rg `
    --query properties.apiKey -o tsv

# 3) Deploy only runtime web assets
npm install -g @azure/static-web-apps-cli
swa deploy web --deployment-token $deployToken --env production
```

Notes:

- Deploying `web/` ensures docs, SQL scripts, and misc root files are not published.
- There is no Functions backend; Database Connections handles data APIs.
- The `web/swa-db-connections/` folder is auto-discovered by SWA.
- Treat `$deployToken` like a secret; rotate it if exposed.

Optional: if you still want GitHub-linked CI/CD, use `az staticwebapp create` with `--source` and set app location to `web`.

---

## 5. Connect the SWA to your Azure SQL DB

This is the **only** place a connection string ever lives.

1. In the Azure portal, open the Static Web App resource.
2. Left nav: **Settings → Database connection**.
3. Click **Link existing database**, choose your SQL server + `ganttdb`, and provide a SQL login (or set up a managed-identity login — see the appendix).
4. SWA writes the connection string into a setting called `DATABASE_CONNECTION_STRING`, which the bundled `web/swa-db-connections/staticwebapp.database.config.json` reads via `@env('DATABASE_CONNECTION_STRING')`.

After saving, the endpoint `https://<your-swa>.azurestaticapps.net/data-api/graphql` becomes live and protected by SWA auth.

---

## 6. Sign in

Browse to the SWA URL. You'll be redirected to Azure AD login (configured in [`web/staticwebapp.config.json`](../web/staticwebapp.config.json)). After signing in, the chart loads from the database.

If you're the only user and want to add others, you don't need any role assignments — every authenticated user gets the built-in `authenticated` role, which is what the data-API permissions use.

---

## Local development

You can run the whole thing locally against your Azure SQL DB (or a local SQL Server / SQL Edge container) with the SWA CLI + DAB:

```powershell
npm install -g @azure/static-web-apps-cli @azure/data-api-builder

# 1. Set the connection string for DAB
$env:DATABASE_CONNECTION_STRING = "Server=tcp:$sqlServer.database.windows.net,1433;Database=$sqlDb;User ID=$sqlAdmin;Password=$sqlPassword;Encrypt=True;"

# 2. Start DAB (uses the JSON config in web/swa-db-connections/)
dab start --config web/swa-db-connections/staticwebapp.database.config.json

# 3. In another terminal, start SWA emulator and point it at DAB
swa start web --data-api-location http://localhost:5000
```

Browse to <http://localhost:4280>. Use the SWA emulator's `Mock authentication` link to sign in as a fake user.

---

## Appendix — production hardening (recommended)

These are optional but a good idea before letting other people use the app.

### Use a managed identity instead of a SQL password

1. Enable a system-assigned managed identity on the SWA.
2. In the database, run:

   ```sql
   CREATE USER [<swa-name>] FROM EXTERNAL PROVIDER;
   ALTER ROLE db_datareader ADD MEMBER [<swa-name>];
   ALTER ROLE db_datawriter ADD MEMBER [<swa-name>];
   GRANT EXECUTE ON SCHEMA::gantt TO [<swa-name>];
   ```

3. In SWA's **Database connection** blade, choose **Managed identity** instead of SQL auth. The `DATABASE_CONNECTION_STRING` will use `Authentication=Active Directory Managed Identity`.

### Restrict who can sign in

Edit [`web/staticwebapp.config.json`](../web/staticwebapp.config.json) and replace the `authenticated` role on the `/*` and `/data-api/*` routes with a custom role (e.g. `gantt-user`). Then in the SWA portal under **Role management**, invite specific users and assign them that role.

### Backups

Azure SQL DB has automated PITR backups by default (7-day retention on Serverless). No action needed.
