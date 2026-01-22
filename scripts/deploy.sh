#!/bin/bash
#
# Deploy Script for example-api to Azion Edge
#
# Usage: ./scripts/deploy.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}Azion Edge Deploy${NC}"
echo ""

cd "$PROJECT_DIR"

# Check prerequisites
echo -e "${YELLOW}[1/4] Checking prerequisites...${NC}"
command -v bun >/dev/null || { echo -e "${RED}bun not found${NC}"; exit 1; }
command -v azion >/dev/null || { echo -e "${RED}azion CLI not found${NC}"; exit 1; }
[ -f .env ] || { echo -e "${RED}.env not found${NC}"; exit 1; }
echo -e "${GREEN}OK${NC}"

# Load .env
echo -e "${YELLOW}[2/4] Loading .env and generating args.json...${NC}"
set -a
source .env
set +a

# Generate args.json
cat > azion/args.json << EOF
{
  "SSO_MODE": "${SSO_MODE}",
  "SSO_GQL_SECRET": "${SSO_GQL_SECRET}",
  "RDS_REGION": "${RDS_REGION}",
  "RDS_RESOURCE_ARN": "${RDS_RESOURCE_ARN}",
  "RDS_SECRET_ARN": "${RDS_SECRET_ARN}",
  "RDS_DATABASE": "${RDS_DATABASE}",
  "AWS_ACCESS_KEY_ID": "${AWS_ACCESS_KEY_ID}",
  "AWS_SECRET_ACCESS_KEY": "${AWS_SECRET_ACCESS_KEY}"
}
EOF
echo -e "${GREEN}OK${NC}"

# Build
echo -e "${YELLOW}[3/4] Building...${NC}"
rm -rf dist .edge
mkdir -p dist .edge
bun build src/azion.ts --outfile=dist/azion.js --target=browser --minify
cp dist/azion.js .edge/worker.js
echo '{"cache":[],"origin":[],"rules":[],"purge":[]}' > .edge/manifest.json
echo -e "${GREEN}OK${NC} - $(du -h dist/azion.js | cut -f1)"

# Deploy
echo -e "${YELLOW}[4/4] Deploying...${NC}"
azion deploy --local --skip-build --yes
echo -e "${GREEN}OK${NC}"

echo ""
echo -e "${GREEN}Done!${NC} Changes may take 15-30s to propagate."
