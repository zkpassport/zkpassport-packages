#!/bin/bash

# Check for prerelease version accidentally being published to 'latest' tag
# This script should be called before publishing a package

set -e

# Extract the version and prerelease tag (e.g., "beta" from "0.29.3-beta.1") from package.json
VERSION=$(bun -p "require('./package.json').version")
VERSION_TAG=$(echo "$VERSION" | sed -nE 's/^[0-9]+\.[0-9]+\.[0-9]+-([a-zA-Z]+).*/\1/p')
if [ -z "$VERSION_TAG" ]; then VERSION_TAG="latest"; fi

# Walk process tree for bun publish to find the tag
PUBLISH_TAG="latest" # Default tag is latest if not specified
pid=$$
while :; do
  cmd=$(ps -ww -o command= -p "$pid")
  if [[ "$cmd" =~ bun.*publish.*--tag[=\ ]([a-zA-Z0-9_-]+) ]]; then
    PUBLISH_TAG="${BASH_REMATCH[1]}"
    break
  fi
  ppid=$(ps -o ppid= -p "$pid" | tr -d ' ')
  [ -z "$ppid" ] || [ "$ppid" -eq 1 ] && break
  pid=$ppid
done

# If package version contains a tag it must match the one to which it is being published
# This is to prevent prerelease versions from being published to 'latest' tag
if [[ "$PUBLISH_TAG" != "$VERSION_TAG" ]]; then
    echo "ERROR: Attempting to publish version '$VERSION' to '$PUBLISH_TAG' tag"
    echo "Please publish using the '$VERSION_TAG' tag:"
    echo "  bun publish --tag $VERSION_TAG"
    exit 1
fi
