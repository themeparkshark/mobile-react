#!/bin/bash
# TPS App Audit Script — zero tokens, pure shell
# Run: bash scripts/audit.sh

set -uo pipefail
cd "$(dirname "$0")/.."

RED='\033[0;31m'
YEL='\033[1;33m'
GRN='\033[0;32m'
DIM='\033[0;90m'
NC='\033[0m'

ISSUES=0
WARNINGS=0

section() { echo -e "\n${YEL}━━━ $1 ━━━${NC}"; }
pass() { echo -e "  ${GRN}✓${NC} $1"; }
warn() { echo -e "  ${YEL}⚠${NC} $1"; WARNINGS=$((WARNINGS + 1)); }
fail() { echo -e "  ${RED}✗${NC} $1"; ISSUES=$((ISSUES + 1)); }

# ── 1. TypeScript Errors ──
section "TypeScript"
TS_ERRORS=$(npx tsc --noEmit 2>&1 | grep "error TS" | wc -l | tr -d ' ')
if [ "$TS_ERRORS" -eq 0 ]; then
  pass "No TypeScript errors"
else
  fail "$TS_ERRORS TypeScript errors"
  echo -e "  ${DIM}Top files:${NC}"
  npx tsc --noEmit 2>&1 | grep "error TS" | sed 's/(.*//' | sort | uniq -c | sort -rn | head -5 | while read line; do
    echo -e "    ${DIM}$line${NC}"
  done
fi

# ── 2. Console.log Pollution ──
section "Console Statements"
CONSOLE_COUNT=$(grep -rn "console\.\(log\|warn\|error\|debug\)" src/ --include="*.ts" --include="*.tsx" | grep -v "// ok" | grep -v "🦈" | wc -l | tr -d ' ')
if [ "$CONSOLE_COUNT" -eq 0 ]; then
  pass "No stray console statements"
elif [ "$CONSOLE_COUNT" -lt 20 ]; then
  warn "$CONSOLE_COUNT console statements (review before release)"
else
  fail "$CONSOLE_COUNT console statements — clean up before release"
fi

# ── 3. Dead Exports (files not imported anywhere) ──
section "Potentially Unused Components"
UNUSED=0
for f in src/components/*.tsx; do
  BASENAME=$(basename "$f" .tsx)
  # Skip index files
  [ "$BASENAME" = "index" ] && continue
  IMPORTS=$(grep -rl "$BASENAME" src/ --include="*.ts" --include="*.tsx" | grep -v "$f" | wc -l | tr -d ' ')
  if [ "$IMPORTS" -eq 0 ]; then
    warn "$(basename $f) — not imported anywhere"
    UNUSED=$((UNUSED + 1))
  fi
done
[ "$UNUSED" -eq 0 ] && pass "All components imported somewhere"

# ── 4. Large Files (complexity risk) ──
section "Large Files (>500 lines)"
LARGE=0
find src/ -type f \( -name "*.ts" -o -name "*.tsx" \) -exec wc -l {} + | sort -rn | head -20 | while read lines file; do
  [ "$file" = "total" ] && continue
  if [ "$lines" -gt 500 ]; then
    warn "$file ($lines lines)"
  fi
done

# ── 5. TODO/FIXME/HACK ──
section "TODO/FIXME/HACK Comments"
TODO_COUNT=$(grep -rn "TODO\|FIXME\|HACK\|XXX" src/ --include="*.ts" --include="*.tsx" | wc -l | tr -d ' ')
if [ "$TODO_COUNT" -eq 0 ]; then
  pass "No TODOs found"
else
  warn "$TODO_COUNT TODO/FIXME/HACK comments"
  grep -rn "TODO\|FIXME\|HACK\|XXX" src/ --include="*.ts" --include="*.tsx" | head -10 | while read line; do
    echo -e "    ${DIM}$line${NC}"
  done
fi

# ── 6. Hardcoded Strings (potential i18n / magic values) ──
section "Hardcoded API URLs"
HARDCODED=$(grep -rn "https\?://" src/ --include="*.ts" --include="*.tsx" | grep -v "node_modules" | grep -v "open-meteo" | grep -v "themeparks.wiki" | grep -v "config\." | grep -v "// ok" | wc -l | tr -d ' ')
if [ "$HARDCODED" -eq 0 ]; then
  pass "No hardcoded URLs outside config"
else
  warn "$HARDCODED hardcoded URLs — verify they use config.apiUrl"
fi

# ── 7. Design System Compliance ──
section "Design System"
RAW_COLORS=$(grep -rn "color:.*['\"]#" src/components/ src/screens/ --include="*.tsx" | grep -v "design-system" | grep -v "TEAM_COLORS" | grep -v "idle-game" | wc -l | tr -d ' ')
if [ "$RAW_COLORS" -lt 10 ]; then
  pass "Minimal raw hex colors ($RAW_COLORS instances)"
else
  warn "$RAW_COLORS raw hex colors — consider using design-system.ts constants"
fi

# ── 8. Bundle Size Check ──
section "Dependencies"
DEP_COUNT=$(node -e "const p=require('./package.json'); console.log(Object.keys(p.dependencies).length)")
echo -e "  ${DIM}$DEP_COUNT production dependencies${NC}"
if [ "$DEP_COUNT" -gt 60 ]; then
  warn "Heavy dependency count ($DEP_COUNT) — review for unused packages"
else
  pass "Dependency count reasonable ($DEP_COUNT)"
fi

# ── 9. Missing Error Boundaries ──
section "Error Handling"
EB_COUNT=$(grep -rl "ErrorBoundary\|error-boundary" src/ --include="*.tsx" | wc -l | tr -d ' ')
if [ "$EB_COUNT" -gt 0 ]; then
  pass "Error boundary found ($EB_COUNT files reference it)"
else
  fail "No error boundaries detected — crashes will kill the app"
fi

CATCH_COUNT=$(grep -rn "\.catch\|try {" src/ --include="*.ts" --include="*.tsx" | wc -l | tr -d ' ')
echo -e "  ${DIM}$CATCH_COUNT try/catch blocks across codebase${NC}"

# ── Summary ──
echo -e "\n${YEL}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if [ "$ISSUES" -eq 0 ] && [ "$WARNINGS" -eq 0 ]; then
  echo -e "${GRN}✓ CLEAN — ready to build${NC}"
elif [ "$ISSUES" -eq 0 ]; then
  echo -e "${YEL}⚠ $WARNINGS warnings — review before release${NC}"
else
  echo -e "${RED}✗ $ISSUES issues, $WARNINGS warnings — fix before release${NC}"
fi
echo ""
