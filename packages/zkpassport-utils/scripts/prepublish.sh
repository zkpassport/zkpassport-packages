#!/bin/bash

set -e

# Run shared prepublish checks
../../scripts/prepublish.sh

# Clean, check, test, and build package
bun run clean
bun run check
bun run test
bun run build
