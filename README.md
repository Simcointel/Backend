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
