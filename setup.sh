#!/usr/bin/env bash
# setup.sh — Sabor Especial one-time setup wizard.
# From git clone to running app in under 5 minutes.
set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; RED='\033[0;31m'; NC='\033[0m'

ok()   { echo -e "  ${GREEN}✓${NC}  $*"; }
warn() { echo -e "  ${YELLOW}⚠${NC}   $*"; }
err()  { echo -e "  ${RED}✗${NC}  $*"; }
step() { echo -e "\n${BOLD}${BLUE}▶ $*${NC}"; }

banner() {
  echo -e "\n${BOLD}╔══════════════════════════════════════════╗"
  echo    "║     Sabor Especial — Setup Wizard        ║"
  echo -e "╚══════════════════════════════════════════╝${NC}"
}

# ── Helpers ───────────────────────────────────────────────────────────────────

# read_val <prompt> <varname> [default] [secret]
read_val() {
  local prompt="$1" varname="$2" default="${3:-}" secret="${4:-}"
  local display_prompt="$prompt"
  [ -n "$default" ] && display_prompt="$prompt [${default:0:8}…]"

  while true; do
    if [ "$secret" = "secret" ]; then
      read -rsp "  ${display_prompt}: " value; echo ""
    else
      read -rp  "  ${display_prompt}: " value
    fi
    [ -z "$value" ] && value="$default"
    if [ -n "$value" ]; then
      eval "$varname='$value'"; break
    fi
    echo "  Este campo es obligatorio."
  done
}

# generate a random 32-char hex token
gen_token() { node -e "process.stdout.write(require('crypto').randomBytes(16).toString('hex'))"; }

# check if the cafeterias table exists via the REST API
schema_ok() {
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" \
    "${SUPABASE_URL}/rest/v1/cafeterias?select=id&limit=1" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" 2>/dev/null || echo "000")
  # 200 = rows returned, 406 = RLS blocked but table exists
  [[ "$status" == "200" || "$status" == "406" ]]
}

# ── Main ──────────────────────────────────────────────────────────────────────
banner

echo ""
echo "  Este asistente configurará el entorno de desarrollo:"
echo "    1. Verificar herramientas"
echo "    2. Recopilar credenciales de Supabase (una sola vez)"
echo "    3. Generar .env.local y actualizar config.js"
echo "    4. Aplicar el esquema de base de datos"
echo "    5. Crear una cafetería de prueba con menú"
echo "    6. Iniciar la aplicación"
echo ""

# ── 1. Prerequisites ─────────────────────────────────────────────────────────
step "Verificando herramientas"

# Node 18+
if ! command -v node &>/dev/null; then
  err "Node.js no encontrado. Instalar desde https://nodejs.org (versión 18+)"
  exit 1
fi
NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if [ "$NODE_MAJOR" -lt 18 ]; then
  err "Se requiere Node.js 18+. Versión actual: $(node -v). Actualizar en https://nodejs.org"
  exit 1
fi
ok "Node.js $(node -v)"

# curl (used for schema check)
if ! command -v curl &>/dev/null; then
  err "curl no encontrado. Instalar curl para continuar."
  exit 1
fi
ok "curl disponible"

# Vercel CLI
if ! command -v vercel &>/dev/null; then
  warn "Vercel CLI no encontrado. Instalando..."
  npm install -g vercel --silent
  ok "Vercel CLI instalado"
else
  ok "Vercel CLI $(vercel --version 2>/dev/null | head -1 || echo 'disponible')"
fi

# npm install
step "Instalando dependencias npm"
npm install --silent
ok "Dependencias instaladas"

# ── 2. Credentials ───────────────────────────────────────────────────────────
step "Credenciales de Supabase"
echo ""
echo "  Encuéntralas en tu proyecto Supabase:"
echo "  Settings → API → Project URL y Project API keys"
echo ""

# Load existing values so re-running setup is painless
SUPABASE_URL=""; SUPABASE_ANON_KEY=""; SUPABASE_SERVICE_ROLE_KEY=""
ADMIN_SECRET=""; ORDERS_PASSWORD=""
CAFETERIA_SLUG="test-cafeteria"

if [ -f ".env.local" ]; then
  echo "  .env.local encontrado — usando valores existentes como predeterminados."
  SUPABASE_URL=$(grep  -E '^SUPABASE_URL='              .env.local | cut -d= -f2- || true)
  SUPABASE_ANON_KEY=$(grep  -E '^SUPABASE_ANON_KEY='   .env.local | cut -d= -f2- || true)
  SUPABASE_SERVICE_ROLE_KEY=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2- || true)
  ADMIN_SECRET=$(grep  -E '^ADMIN_SECRET='              .env.local | cut -d= -f2- || true)
  ORDERS_PASSWORD=$(grep -E '^ORDERS_PASSWORD='         .env.local | cut -d= -f2- || true)
  CAFETERIA_SLUG=$(grep  -E '^CAFETERIA_SLUG='          .env.local | cut -d= -f2- || echo "test-cafeteria")
  echo ""
fi

read_val "URL del proyecto (https://xxxx.supabase.co)" SUPABASE_URL "$SUPABASE_URL"
read_val "Clave anon / public"                          SUPABASE_ANON_KEY "$SUPABASE_ANON_KEY" "secret"
read_val "Clave service_role"                           SUPABASE_SERVICE_ROLE_KEY "$SUPABASE_SERVICE_ROLE_KEY" "secret"

# Strip trailing slash
SUPABASE_URL="${SUPABASE_URL%/}"

# Extract project ref (xxxx from https://xxxx.supabase.co)
PROJECT_REF=$(echo "$SUPABASE_URL" | sed 's|https://||' | sed 's|\.supabase\.co.*||')

# Auto-generate secrets on first run
[ -z "$ADMIN_SECRET"     ] && ADMIN_SECRET=$(gen_token)
[ -z "$ORDERS_PASSWORD"  ] && ORDERS_PASSWORD=$(gen_token)

# ── 3. Write .env.local ───────────────────────────────────────────────────────
step "Generando .env.local"

cat > .env.local <<EOF
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
APP_BASE_URL=http://localhost:3000
ADMIN_SECRET=${ADMIN_SECRET}
ORDERS_PASSWORD=${ORDERS_PASSWORD}
CORS_ORIGIN=*
RESEND_API_KEY=
CAFETERIA_SLUG=${CAFETERIA_SLUG}
EOF

ok ".env.local creado"

# ── 4. Patch config.js ───────────────────────────────────────────────────────
step "Actualizando config.js"

node --input-type=module <<JS
import { readFileSync, writeFileSync } from 'fs';
let c = readFileSync('config.js', 'utf8');
c = c.replace(
  /supabaseUrl:\s*"https:\/\/REPLACE_WITH_YOUR_PROJECT_REF\.supabase\.co"/,
  \`supabaseUrl:       "${process.env.SUPABASE_URL}"\`
);
c = c.replace(
  /supabaseAnonKey:\s*"REPLACE_WITH_YOUR_ANON_KEY"/,
  \`supabaseAnonKey:   "${process.env.SUPABASE_ANON_KEY}"\`
);
writeFileSync('config.js', c);
JS

ok "config.js actualizado"

export SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY

# ── 5. Database schema ────────────────────────────────────────────────────────
step "Esquema de base de datos"

if schema_ok; then
  ok "Esquema ya aplicado — omitiendo"
else
  echo ""
  echo "  El esquema de base de datos debe aplicarse una vez."
  echo ""
  echo "  ${BOLD}Paso a paso:${NC}"
  echo "    1. Abre este enlace en tu navegador:"
  echo ""
  echo "       ${BOLD}https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new${NC}"
  echo ""
  echo "    2. Copia el contenido de:  ${BOLD}supabase/schema.sql${NC}"
  echo "       ($(wc -l < supabase/schema.sql) líneas — todo el esquema en un solo archivo)"
  echo ""
  echo "    3. Pégalo en el editor SQL y presiona ${BOLD}Run${NC}."
  echo ""
  read -rp "  Presiona Enter cuando hayas ejecutado el SQL (o escribe 'omitir' para continuar): " SCHEMA_CONFIRM

  if [ "${SCHEMA_CONFIRM:-}" != "omitir" ]; then
    if schema_ok; then
      ok "Esquema verificado correctamente"
    else
      warn "No se pudo verificar el esquema. Continuando de todas formas..."
    fi
  fi
fi

# ── 6. Seed test cafeteria ────────────────────────────────────────────────────
step "Creando cafetería de prueba"

SEED_OUT=$(SUPABASE_URL="$SUPABASE_URL" \
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  CAFETERIA_SLUG="$CAFETERIA_SLUG" \
  node scripts/seed.js 2>&1) || {
    warn "El seeding reportó un error:"
    echo "  $SEED_OUT"
    echo ""
    warn "Asegúrate de que el esquema SQL fue ejecutado y continúa con 'npm start'."
    SEED_OUT=""
  }

SLUG=""
CAFE_ID=""

if [ -n "$SEED_OUT" ]; then
  SLUG=$(echo "$SEED_OUT"    | grep '^SLUG:' | sed 's/^SLUG://' || true)
  CAFE_ID=$(echo "$SEED_OUT" | grep '^ID:'   | sed 's/^ID://'   || true)
fi

[ -n "$SLUG"    ] && ok "Cafetería: ${SLUG}"
[ -n "$CAFE_ID" ] && ok "ID: ${CAFE_ID}"

# Persist slug in .env.local
if [ -n "$SLUG" ]; then
  if grep -q '^CAFETERIA_SLUG=' .env.local 2>/dev/null; then
    sed -i "s|^CAFETERIA_SLUG=.*|CAFETERIA_SLUG=${SLUG}|" .env.local
  else
    echo "CAFETERIA_SLUG=${SLUG}" >> .env.local
  fi
fi

# ── Done ──────────────────────────────────────────────────────────────────────
DISPLAY_SLUG="${SLUG:-${CAFETERIA_SLUG}}"

echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════╗"
echo    "║   ¡Listo! El entorno está configurado.               ║"
echo -e "╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Contraseña de administrador:  ${BOLD}${ADMIN_SECRET}${NC}"
echo -e "  Contraseña de cocina:         ${BOLD}${ORDERS_PASSWORD}${NC}"
echo ""
echo -e "  Inicia la aplicación con:"
echo -e "    ${BOLD}npm start${NC}  →  http://localhost:3000"
echo ""
echo "  URLs de la aplicación (después de 'npm start'):"
echo -e "    Clientes:       ${BOLD}http://localhost:3000/s/${DISPLAY_SLUG}${NC}"
echo -e "    Administración: ${BOLD}http://localhost:3000/management.html?slug=${DISPLAY_SLUG}${NC}"
echo -e "    Cocina:         ${BOLD}http://localhost:3000/deliveries.html?slug=${DISPLAY_SLUG}${NC}"
echo ""
