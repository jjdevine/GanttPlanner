# Gantt.Planner

A single-page Gantt chart for tracking team workload, backed by **Azure SQL Database** and hosted on **Azure Static Web Apps**. No backend code to maintain — SWA's built-in Database Connections feature exposes the database as a managed REST/GraphQL API directly from a connection string you configure in the portal.

```
[ Browser ] ──HTTPS──▶ [ Azure Static Web Apps ] ──TDS──▶ [ Azure SQL DB ]
                       (serves files + /data-api)
```

## What's in the box

| Path                                                                 | Purpose                                                       |
|----------------------------------------------------------------------|---------------------------------------------------------------|
| [`index.html`](index.html)                                           | App shell (markup only)                                       |
| [`css/styles.css`](css/styles.css)                                   | All styling                                                   |
| [`js/app.js`](js/app.js)                                             | Entry point, state, event wiring                              |
| [`js/api.js`](js/api.js)                                             | GraphQL client against `/data-api/graphql`                    |
| [`js/chart.js`](js/chart.js)                                         | D3 Gantt rendering                                            |
| [`js/modals.js`](js/modals.js)                                       | Quick-add and import/export modals                            |
| [`js/util.js`](js/util.js)                                           | Pure helpers (sorting, normalisation)                         |
| [`staticwebapp.config.json`](staticwebapp.config.json)               | SWA routes + Entra ID auth gate                               |
| [`swa-db-connections/staticwebapp.database.config.json`](swa-db-connections/staticwebapp.database.config.json) | Data API Builder schema + permissions   |
| [`sql/01-schema.sql`](sql/01-schema.sql)                             | Database schema                                               |
| [`sql/02-seed-example.sql`](sql/02-seed-example.sql)                 | Optional demo data                                            |
| [`sql/generate-migration-sql.js`](sql/generate-migration-sql.js)     | Convert an existing tasks JSON to an `INSERT` script          |
| [`docs/SETUP.md`](docs/SETUP.md)                                     | Step-by-step deployment guide                                 |
| [`docs/CAPABILITIES.md`](docs/CAPABILITIES.md)                       | Feature walkthrough & data-shape reference                    |

## Get started

1. Read [`docs/SETUP.md`](docs/SETUP.md) — provision Azure SQL, run the schema, deploy SWA, paste the connection string.
2. Migrate any existing JSON with `node sql/generate-migration-sql.js tasks.json > sql/03-import.sql`.
3. Read [`docs/CAPABILITIES.md`](docs/CAPABILITIES.md) for a tour of the UI.
