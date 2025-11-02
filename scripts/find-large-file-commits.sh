#!/bin/bash
set -e

# Script to find files larger than 1MB in the final squashed state (vs trunk/main)
# Since commits will be squashed on merge, we only check the final working tree state

# Threshold in bytes (1MB)
THRESHOLD=$((1024 * 1024))
THRESHOLD_MB=1

# Determine trunk branch (try main, then master)
TRUNK_BRANCH=""
if git rev-parse --verify origin/main >/dev/null 2>&1; then
    TRUNK_BRANCH="origin/main"
elif git rev-parse --verify origin/master >/dev/null 2>&1; then
    TRUNK_BRANCH="origin/master"
elif git rev-parse --verify main >/dev/null 2>&1; then
    TRUNK_BRANCH="main"
elif git rev-parse --verify master >/dev/null 2>&1; then
    TRUNK_BRANCH="master"
else
    echo "Error: Could not find main or master branch"
    exit 1
fi

HEAD_SHA=$(git rev-parse HEAD)

echo "Searching for files larger than ${THRESHOLD_MB}MB in the final state..."
echo "Comparing HEAD against $TRUNK_BRANCH"
echo ""

LARGE_FILES_FOUND=0

# Get all files that are different between trunk and HEAD (added or modified)
git diff-tree -r --no-commit-id --diff-filter=AM --raw "$TRUNK_BRANCH" "$HEAD_SHA" 2>/dev/null | while IFS=$'\t' read -r metadata file_path; do
    # Parse metadata: :old_mode new_mode old_blob new_blob status
    metadata="${metadata#:}"
    new_blob=$(echo "$metadata" | awk '{print $4}')

    if [ "$new_blob" != "0000000000000000000000000000000000000000" ]; then
        size=$(git cat-file -s "$new_blob" 2>/dev/null || echo "0")

        if [ "$size" -gt "$THRESHOLD" ]; then
            size_mb=$(echo "scale=2; $size / 1024 / 1024" | bc)

            echo "═══════════════════════════════════════════════════════════════"
            echo "❌ LARGE FILE DETECTED!"
            echo "   File: $file_path"
            echo "   Size: ${size_mb} MB (exceeds ${THRESHOLD_MB}MB)"
            echo ""

            LARGE_FILES_FOUND=1
            exit 1
        fi
    fi
done

# Check exit status from the while loop
if [ $? -eq 1 ]; then
    echo "ERROR: Large files found that exceed ${THRESHOLD_MB}MB limit"
    exit 1
fi

echo "✅ No files larger than ${THRESHOLD_MB}MB found in changes since $TRUNK_BRANCH"
echo "Done!"

