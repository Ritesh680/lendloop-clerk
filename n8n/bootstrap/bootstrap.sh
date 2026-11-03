#!/bin/sh
# One-shot, run by the n8n-bootstrap service before n8n starts. It turns
# environment variables into encrypted n8n credentials, imports the workflows and
# publishes them. Safe to re-run: IDs are fixed, so imports overwrite in place.
set -eu

: "${CONVEX_TO_N8N_SECRET:?must be set; see .env.example}"
: "${N8N_TO_CONVEX_SECRET:?must be set; see .env.example}"
: "${CONVEX_SITE_URL:?must be set; see .env.example}"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Node instead of a heredoc, so a secret containing quotes can't break the JSON.
node -e '
const e = process.env;
const creds = [
  { id: "LLhmacVerify0001", name: "LendLoop inbound HMAC (Convex to n8n)", type: "crypto",
    data: { hmacSecret: e.CONVEX_TO_N8N_SECRET } },
  { id: "LLhmacSign000001", name: "LendLoop outbound HMAC (n8n to Convex)", type: "crypto",
    data: { hmacSecret: e.N8N_TO_CONVEX_SECRET } },
  { id: "LLsmtp0000000001", name: "LendLoop SMTP", type: "smtp",
    data: {
      host: e.SMTP_HOST, port: Number(e.SMTP_PORT), secure: e.SMTP_SECURE === "true",
      user: e.SMTP_USER ?? "", password: e.SMTP_PASSWORD ?? "",
      disableStartTls: e.SMTP_SECURE !== "true",
    } },
];
require("fs").writeFileSync(process.argv[1], JSON.stringify(creds), { mode: 0o600 });
' "$work/credentials.json"

n8n import:credentials --input="$work/credentials.json"

# Exported workflows hold placeholders for deployment-specific, non-secret values.
# Substituting here means N8N_BLOCK_ENV_ACCESS_IN_NODE can stay on.
mkdir "$work/workflows"
for file in /workflows/*.json; do
  sed -e "s|__CONVEX_SITE_URL__|${CONVEX_SITE_URL%/}|g" \
      -e "s|__OPS_EMAIL__|${OPS_EMAIL:-ops@lendloop.local}|g" \
      "$file" > "$work/workflows/$(basename "$file")"
done
n8n import:workflow --separate --input="$work/workflows"

# All three must be published. n8n refuses to run an inactive error workflow, and
# failures would then go unreported.
n8n publish:workflow --id=LLrequestNotify1
n8n publish:workflow --id=LLoverdueRemind1
n8n publish:workflow --id=LLerrorHandler01

echo "n8n bootstrap complete"
