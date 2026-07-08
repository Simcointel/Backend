# SimcoIntel Backend

SimcoIntel Backend is a Node.js/TypeScript data pipeline designed to fetch, process, and export market data for the game [Sim Companies](https://www.simcompanies.com/). It is built to be "always free" by utilizing GitHub as a flat-file database and Vercel for serverless execution.

## Core Architecture: "Backend as Data Exporter"

To support 25,000+ players without incurring database costs or high server load, this backend follows a "Push-to-Public" model:

1.  **Fetch & Aggregate**: Every 15 minutes, the backend fetches raw market data (Resource prices, VWAPs) from the Sim Companies API.
2.  **Process**: It calculates critical metrics like **Profit Margins**, **Price Indexes**, and **Inflation**.
3.  **Export to Public**: Instead of serving live requests from a database, the backend writes highly optimized JSON files directly into the `Data` repository's `public/` directory.
4.  **Frontend Direct Access**: The Frontend (Web repo) fetches these JSON files directly from GitHub Pages or a CDN, bypassing the Vercel backend entirely for 99% of user traffic.

## Key Features

*   **Multi-Realm Support**: Fully supports both Realm 0 (Entrepreneurs) and Realm 1 (Magnates).
*   **Massive History**: Archives daily snapshots into monthly compressed chunks to maintain performance while preserving years of data.
*   **Data Integrity**: Includes validation checks to prevent zero-price exports or corrupted datasets.
*   **Lightweight**: Only core analytical engines (Profit Margins, Macro Trends) are maintained; complex "gimmick" engines have been removed to keep the system reliable and accurate.

## End-to-End Workflow

1.  **Trigger**: A Vercel Cron or a manual CLI command (`npm start public-export`) triggers the `runPublicExportPipeline`.
2.  **Fresh Data**: The pipeline first calls `runMacroPipeline` which fetches the latest realm status and history from Sim Companies.
3.  **Calculation**: It then calculates current **Profit Margins** for all resources using Level 1 building wages and 4% market fees.
4.  **Validation**: Every dataset (Macro, History, Margins) is passed through `validation.ts`. If data looks "broken" (e.g., >30% zero prices), that specific file is skipped to protect the frontend.
5.  **Local Write**: Valid JSON files are written to the `/tmp/data-repo/public` directory.
6.  **Git Push**: If `enableCommitPush` is true, the `DataRepoWriter` commits these changes and pushes them back to the `Data` GitHub repository.
7.  **Frontend Sync**: The Frontend (Web repo) can now fetch these static files via GitHub Pages URL (e.g., `https://simcointel.github.io/Data/public/realm-0/margins.json`).

## Frontend Data Consumption Guide

The frontend should primarily use `public/manifest.json` to discover available data.

### 1. Load the Manifest
`GET https://raw.githubusercontent.com/SimcoIntel/Data/main/public/manifest.json`
```json
{
  "version": "1.0.0",
  "generatedAt": "2024-03-20T12:00:00Z",
  "realms": [0, 1],
  "files": [
    { "path": "realm-0/macro.json", "bytes": 1234 },
    { "path": "realm-0/margins.json", "bytes": 5678 }
  ]
}
```

### 2. Available Datasets (per realm)

| File | Description | Usage |
| :--- | :--- | :--- |
| `macro.json` | Latest Realm stats (CV, Active Companies, Price Index) | Dashboard Header |
| `margins.json` | Array of profit calculations for every resource | "What to produce" tables |
| `history.json` | Last 120 historical snapshots | Trend charts |
| `indexes.json` | Daily price index movements | Economic health charts |
| `inflation.json` | Inflation rate history | Market sentiment |

## Repository Structure

*   `src/jobs/`: The core data pipeline logic (Fetch, Aggregate, Profit Margins, Export).
*   `src/api/`: A minimal Express-based API for administrative tasks and triggering exports.
*   `config/`: Configuration for formulas, schedules, and feature flags.

## Environment Variables

*   `DATA_REPO_PATH`: Path to the local clone of the Data repository.
*   `GITHUB_TOKEN`: Token used to push data to the Data repository.
*   `SIMCO_API_BASE_URL`: Base URL for the Sim Companies API.
*   `CRON_SECRET`: Secret to secure Vercel cron endpoints.

## Maintenance

The backend is designed to be self-cleaning. It automatically:
1.  Cleans up local `/tmp` storage.
2.  Compresses snapshots older than 90 days.
3.  Ensures the `public/manifest.json` is updated every cycle.
