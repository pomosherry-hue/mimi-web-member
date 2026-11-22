#!/usr/bin/env bash
# 本地测试：云函数逻辑（假数据库）、前端（jsdom）、兑换码生成器、语法检查
set -euo pipefail
cd "$(dirname "$0")"
[ -d node_modules/jsdom ] || npm install --silent
for f in ../js/*.js ../cloudfunctions/redeem/*.js; do node --check "$f"; done
echo "syntax ok"
node --test redeem.test.js frontend.test.js storage-rule.test.js
python3 gen_codes.test.py
