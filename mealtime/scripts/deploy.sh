#!/usr/bin/env bash
# Build for Vercel and publish. Hobby plans allow only daily crons, so the
# framework's per-minute job sweep runs once a day here (Mealtime has no jobs).
set -euo pipefail
cd "$(dirname "$0")/.."
NITRO_PRESET=vercel pnpm -s build
node -e '
const f=".vercel/output/config.json";const c=require("fs").readFileSync(f,"utf8");
const j=JSON.parse(c);for(const x of j.crons??[])x.schedule="0 5 * * *";
require("fs").writeFileSync(f,JSON.stringify(j,null,2));'
vercel deploy --prebuilt --prod --yes
