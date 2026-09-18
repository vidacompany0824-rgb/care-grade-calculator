#!/usr/bin/env bash
# 관리자 페이지에 필요한 환경변수 2개를 설정하고 재배포합니다.
#   ./scripts/setup-admin.sh   또는   npm run setup:admin
#
# service_role 키는 화면에 찍히지 않고 셸 히스토리에도 남지 않습니다.
set -euo pipefail

NCLI="/Users/kimshichun/Downloads/goldenrecipe-studio/node_modules/.bin/netlify"
[ -x "$NCLI" ] || NCLI="npx --yes netlify-cli"

echo
echo "────────────────────────────────────────────────────────────"
echo "  관리자 페이지 설정"
echo "────────────────────────────────────────────────────────────"
echo
echo "1) Supabase 대시보드에서 service_role 키를 복사하세요."
echo "   Project Settings → API → Project API keys → service_role"
echo
echo "   ⚠️  anon 키가 아니라 service_role 키입니다."
echo

# -s: 화면에 안 보임 / read 로 받으므로 히스토리에도 안 남음
read -rs -p "   service_role 키 붙여넣고 Enter: " SERVICE_KEY
echo
echo

if [ -z "${SERVICE_KEY}" ]; then
  echo "   ✗ 키가 비어 있습니다. 중단합니다."
  exit 1
fi

# 붙여넣은 게 정말 service_role 인지 확인 (JWT payload 의 role 을 본다)
ROLE=$(printf '%s' "$SERVICE_KEY" | cut -d. -f2 | tr '_-' '/+' \
  | awk '{n=length($0)%4; if(n==2)$0=$0"=="; else if(n==3)$0=$0"="; print}' \
  | base64 -d 2>/dev/null | sed -n 's/.*"role":"\([^"]*\)".*/\1/p') || ROLE=""

if [ "$ROLE" = "anon" ]; then
  echo "   ✗ anon 키를 붙여넣으셨습니다. service_role 키가 필요합니다."
  exit 1
elif [ "$ROLE" = "service_role" ]; then
  echo "   ✓ service_role 키 확인"
else
  echo "   ? 키 형식을 확인하지 못했습니다. 그대로 진행합니다."
fi

$NCLI env:set SUPABASE_SERVICE_ROLE_KEY "$SERVICE_KEY" >/dev/null
unset SERVICE_KEY
echo "   ✓ SUPABASE_SERVICE_ROLE_KEY 등록 완료"
echo

# 관리자 비밀번호 생성 — 이 터미널에만 한 번 보여줍니다
PW=$(openssl rand -base64 18)
$NCLI env:set ADMIN_PASSWORD "$PW" >/dev/null
echo "   ✓ ADMIN_PASSWORD 등록 완료"
echo
echo "   ┌──────────────────────────────────────────────────┐"
echo "     관리자 비밀번호:  $PW"
echo "   └──────────────────────────────────────────────────┘"
echo "   ※ 지금 비밀번호 관리자에 저장하세요. 다시 보여주지 않습니다."
echo "      (잊어버리면 이 스크립트를 다시 돌리면 새로 발급됩니다.)"
echo
unset PW

echo "2) 재배포합니다…"
echo
$NCLI deploy --build --prod --skip-functions-cache
echo
echo "   완료 → https://care-grade-calculator.netlify.app/admin.html"
echo
