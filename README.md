# nzbc-gridstatus

A tiny CLI wrapper around the `gridstatus` Python package.

## Usage

- Ensure you're in the repo and the venv is active:
  - `cd /Users/michaelbarry/Documents/GitHub/NZBC-gridstatus`
  - `source .venv/bin/activate`
  - If needed: `pip install gridstatus`

- Install the CLI locally (editable):
  - `pip install -e . --no-build-isolation`

- Run commands:
  - `nzbc-gridstatus isos`          → pretty table
  - `nzbc-gridstatus isos -f json`  → JSON
  - `nzbc-gridstatus isos -f csv`   → CSV

## Notes

- This package intentionally avoids extra deps and uses `argparse`.
- `gridstatus` must be available in your environment.
# Eighty760.com
