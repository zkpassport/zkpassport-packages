#!/bin/bash

set -e

# Run shared prepublish checks
../../scripts/prepublish.sh

# Check, test and build package
bun run check && bun run test && bun run build
