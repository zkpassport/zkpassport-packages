#!/bin/bash
set -e

# Script to find individual files larger than 1MB in commits since trunk/main

# Get GitHub repo URL from git remote
REMOTE_URL=$(git config --get remote.origin.url 2>/dev/null || echo "")

if [ -z "$REMOTE_URL" ]; then
    echo "Warning: Could not determine remote URL"
    GITHUB_BASE_URL=""
else
    # Convert SSH/HTTPS URL to GitHub web URL
    GITHUB_BASE_URL=$(echo "$REMOTE_URL" | sed -e 's/git@github.com:/https:\/\/github.com\//' -e 's/\.git$//')
fi

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

echo "Searching for individual files larger than ${THRESHOLD_MB}MB..."
echo "Checking commits from $TRUNK_BRANCH to HEAD"
echo "This may take a while..."
echo ""

# Get all commits since trunk
COMMITS=$(git rev-list $TRUNK_BRANCH..$HEAD_SHA 2>/dev/null || echo "")

if [ -z "$COMMITS" ]; then
    echo "No commits found since $TRUNK_BRANCH"
    exit 0
fi

LARGE_FILES_FOUND=0
TEMP_FILE=$(mktemp)

# Iterate through commits since trunk
echo "$COMMITS" | while read commit; do
    # Get parent commit (if exists)
    parent=$(git rev-parse --verify --quiet "${commit}^" || echo "")

    if [ -z "$parent" ]; then
        # First commit - compare against empty tree
        parent="4b825dc642cb6eb9a060e54bf8d69288fbee4904"
    fi

    # Check each file ADDED in this commit
    while IFS=$'\t' read -r metadata file_path; do
        # Parse metadata part (space-separated): :old_mode new_mode old_blob new_blob status
        # Remove leading colon
        metadata="${metadata#:}"

        old_mode=$(echo "$metadata" | awk '{print $1}')
        new_mode=$(echo "$metadata" | awk '{print $2}')
        old_blob=$(echo "$metadata" | awk '{print $3}')
        new_blob=$(echo "$metadata" | awk '{print $4}')
        status=$(echo "$metadata" | awk '{print $5}')

        # Only check ADDED files
        if [ "$status" = "A" ]; then
            if [ "$new_blob" != "0000000000000000000000000000000000000000" ]; then
                size=$(git cat-file -s "$new_blob" 2>/dev/null || echo "0")

                if [ "$size" -gt "$THRESHOLD" ]; then
                    size_mb=$(echo "scale=2; $size / 1024 / 1024" | bc)
                    commit_msg=$(git log -1 --pretty=format:"%s" "$commit")
                    commit_author=$(git log -1 --pretty=format:"%an" "$commit")
                    commit_date=$(git log -1 --pretty=format:"%ai" "$commit")

                    echo "═══════════════════════════════════════════════════════════════"
                    echo "❌ LARGE FILE DETECTED!"
                    echo "   File: $file_path"
                    echo "   Size: ${size_mb} MB (exceeds ${THRESHOLD_MB}MB)"
                    echo ""
                    echo "   Commit: $commit"
                    echo "   Date: $commit_date"
                    echo "   Author: $commit_author"
                    echo "   Message: $commit_msg"

                    if [ -n "$GITHUB_BASE_URL" ]; then
                        echo "   GitHub URL: $GITHUB_BASE_URL/commit/$commit"
                    fi

                    echo ""
                    echo "1" > "$TEMP_FILE"
                fi
            fi
        fi
    done < <(git diff-tree -r --raw --no-commit-id "$parent" "$commit" 2>/dev/null)
done

if [ -f "$TEMP_FILE" ] && [ "$(cat "$TEMP_FILE" 2>/dev/null)" = "1" ]; then
    LARGE_FILES_FOUND=1
fi

rm -f "$TEMP_FILE"

if [ "$LARGE_FILES_FOUND" -eq 0 ]; then
    echo "✅ No large files found in commits since $TRUNK_BRANCH"
fi

echo "Done!"

