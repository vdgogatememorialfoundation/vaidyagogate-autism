#!/bin/bash
# Deploy and import pre-registration data
# Usage: ./scripts/deploy-and-import.sh

set -e

echo "=== Autism Portal Deploy & Import Script ==="
echo ""

# Check if data file exists
if [ ! -f "$(dirname "$0")/prereg-data.tsv" ]; then
    echo "ERROR: prereg-data.tsv not found!"
    exit 1
fi

# Count records
RECORDS=$(($(wc -l < "$(dirname "$0")/prereg-data.tsv") - 1))
echo "Found $RECORDS pre-registration records to import."

# Run the import
echo ""
echo "Running import script..."
cd "$(dirname "$0")/.."
node scripts/import-preregistrations.js

echo ""
echo "=== Deploy Complete ==="
