#!/bin/bash
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <new-version>"
  echo "Example: $0 0.2.6"
  exit 1
fi

VERSION="$1"

# Validate version format
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Error: version must be in format x.y.z"
  exit 1
fi

cd "$(git rev-parse --show-toplevel)"

# Update version in all config files
sed -i '' 's/"version": "'"$(jq -r .version package.json)"'"/"version": "'"$VERSION"'"/' package.json
sed -i '' 's/^version = ".*"$/version = "'"$VERSION"'"/' src-tauri/Cargo.toml
sed -i '' 's/"version": ".*"/"version": "'"$VERSION"'"/' src-tauri/tauri.conf.json

echo "✓ Version bumped to $VERSION"
echo "  - package.json"
echo "  - src-tauri/Cargo.toml"
echo "  - src-tauri/tauri.conf.json"
echo ""
echo "Next steps:"
echo ""
echo "  # 1. Commit and push"
echo "  git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json"
echo "  git commit -m \"chore: bump version to v$VERSION\""
echo "  git push"
echo ""
echo "  # 2. Tag and build (由用户决定执行)"
echo "  git tag v$VERSION"
echo "  git push origin v$VERSION"
echo ""
echo "  # 3. 本地构建（带签名）"
echo "  TAURI_SIGNING_PRIVATE_KEY_PATH=~/.tauri/camo.key npx tauri build"
