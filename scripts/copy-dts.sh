#!/bin/bash

# Add .js extensions to .d.ts files and create .d.cts for CommonJS
# This ensures proper type resolution for both ESM and CJS consumers

set -e

TYPES_DIR="dist/types"

if [ ! -d "$TYPES_DIR" ]; then
  echo "Error: $TYPES_DIR directory not found"
  exit 1
fi

# Step 1: Add .js extensions to relative imports in .d.ts files for ESM
find "$TYPES_DIR" -name "*.d.ts" -type f | while read -r file; do
  # Create a temp file for processing
  tmpfile=$(mktemp)

  # Process each line to add proper extensions
  while IFS= read -r line; do
    # Extract imports/exports with relative paths
    if [[ $line =~ (from|import\()[[:space:]]*[\"\'](\.\.?/[^\"\']+)[\"\'] ]]; then
      import_path="${BASH_REMATCH[2]}"

      # Skip if already has an extension
      if [[ ! $import_path =~ \.(js|ts|json)$ ]]; then
        # Get directory of current file
        file_dir=$(dirname "$file")
        # Resolve the imported path relative to current file
        resolved_path="$file_dir/$import_path"

        # Check if it's a directory with index, or a file
        if [ -d "$resolved_path" ]; then
          # It's a directory, add /index.js
          line=$(echo "$line" | sed -E "s|(from\|import\\()[[:space:]]*([\"'])${import_path}([\"'])|\1 \2${import_path}/index.js\3|g")
        else
          # It's a file, add .js
          line=$(echo "$line" | sed -E "s|(from\|import\\()[[:space:]]*([\"'])${import_path}([\"'])|\1 \2${import_path}.js\3|g")
        fi
      fi
    fi
    echo "$line" >> "$tmpfile"
  done < "$file"

  # Replace original file with processed version
  mv "$tmpfile" "$file"
done

# Step 2: Create .d.cts files with .cjs extensions for CJS
find "$TYPES_DIR" -name "*.d.ts" -type f | while read -r file; do
  cts_file="${file%.d.ts}.d.cts"

  # Copy and rewrite .js to .cjs for CommonJS
  sed -e 's/from "\([^"]*\)\.js"/from "\1.cjs"/g' \
      -e "s/from '\([^']*\)\.js'/from '\1.cjs'/g" \
      -e 's/import("\([^"]*\)\.js")/import("\1.cjs")/g' \
      -e "s/import('\([^']*\)\.js')/import('\1.cjs')/g" \
      "$file" > "$cts_file"
done

echo "Added .js extensions to .d.ts and created .d.cts for CJS compatibility"

