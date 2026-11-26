# Scripts

Run from anywhere; they work relative to the project root.

- `start.sh` (Mac/Linux), `start.ps1` (Windows): build the `pm` image, replace any running `pm` container, run it on port 8000 with the `pm-data` volume at `/app/data` (SQLite database; `docker volume rm pm-data` resets it). Passes `.env` with `--env-file` if it exists.
- `stop.sh`, `stop.ps1`: remove the `pm` container.
