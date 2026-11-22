#!/usr/bin/env python3
"""生成网页版兑换码。

用法：
  python3 tools/gen_codes.py 数量 [--max-devices 2] [--days 365 | --expires 2027-12-31] [--note 备注] [--out 目录]

例子：
  python3 tools/gen_codes.py 50 --note 小红书第一批
  python3 tools/gen_codes.py 20 --days 365 --note 一年码

输出（默认在 tools/out/）：
  <日期>-<备注>-<数量>个.csv    给你自己看、记录卖给了谁（用 Excel / WPS 打开）
  <日期>-<备注>-<数量>个.jsonl  导入云开发数据库 redeem_codes 集合用（每行一个码）
  <日期>-<备注>-<数量>个.json   同样内容的 JSON 数组，备用

码的样子：MW-7K3P-QX9D-H2TB（去掉了容易看错的 0 O 1 I L U）。
数据库里存的是去掉横线的大写形式（MW7K3PQX9DH2TB），同时作为 _id 和 code。
"""
import argparse
import csv
import datetime as dt
import json
import os
import re
import secrets
import sys

ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ"  # 必须和云函数 lib.js 一致
PREFIX = "MW"
BODY_LEN = 12


def make_code() -> str:
    return PREFIX + "".join(secrets.choice(ALPHABET) for _ in range(BODY_LEN))


def pretty(code: str) -> str:
    body = code[len(PREFIX):]
    return PREFIX + "-" + "-".join(body[i:i + 4] for i in range(0, len(body), 4))


def load_existing(paths):
    seen = set()
    for p in paths or []:
        with open(p, encoding="utf-8") as f:
            for m in re.finditer(r"MW-?[A-Z0-9-]{12,17}", f.read()):
                seen.add(re.sub(r"[^A-Z0-9]", "", m.group(0)))
    return seen


def main(argv=None):
    ap = argparse.ArgumentParser(description="生成网页版兑换码")
    ap.add_argument("count", type=int, help="生成多少个")
    ap.add_argument("--max-devices", type=int, default=2, help="每个码最多绑定几台设备，默认 2")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--days", type=int, help="从今天起多少天后过期（不填 = 永不过期）")
    g.add_argument("--expires", help="到期日期，如 2027-12-31（当天 23:59:59，北京时间）")
    ap.add_argument("--note", default="", help="备注，比如 小红书第一批")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "out"))
    ap.add_argument("--avoid", nargs="*", help="已有的 csv/jsonl 文件，避免生成重复的码")
    a = ap.parse_args(argv)

    if not 1 <= a.count <= 10000:
        ap.error("数量要在 1 到 10000 之间")
    if a.max_devices < 1:
        ap.error("--max-devices 至少 1")

    now = dt.datetime.now(dt.timezone.utc)
    now_ms = int(now.timestamp() * 1000)
    expires_ms = None
    beijing = dt.timezone(dt.timedelta(hours=8))
    if a.days:
        expires_ms = now_ms + a.days * 86400 * 1000
    elif a.expires:
        d = dt.datetime.strptime(a.expires, "%Y-%m-%d").replace(hour=23, minute=59, second=59, tzinfo=beijing)
        expires_ms = int(d.timestamp() * 1000)

    seen = load_existing(a.avoid)
    codes = []
    while len(codes) < a.count:
        c = make_code()
        if c not in seen:
            seen.add(c)
            codes.append(c)

    docs = [{
        "_id": c,
        "code": c,
        "status": "active",
        "createdAt": now_ms,
        "boundDevices": [],
        "maxDevices": a.max_devices,
        "expiresAt": expires_ms,
        "note": a.note,
    } for c in codes]

    os.makedirs(a.out, exist_ok=True)
    safe_note = re.sub(r"[\\/:*?\"<>|\s]+", "_", a.note).strip("_")
    stem = "-".join(x for x in [now.astimezone(beijing).strftime("%Y-%m-%d"), safe_note, f"{a.count}个"] if x)
    base = os.path.join(a.out, stem)
    exp_txt = dt.datetime.fromtimestamp(expires_ms / 1000, beijing).strftime("%Y-%m-%d") if expires_ms else "永不过期"

    with open(base + ".csv", "w", newline="", encoding="utf-8-sig") as f:  # utf-8-sig：Excel 打开不乱码
        w = csv.writer(f)
        w.writerow(["序号", "兑换码", "最多设备", "到期", "备注", "卖给谁（自己填）", "日期（自己填）"])
        for i, c in enumerate(codes, 1):
            w.writerow([i, pretty(c), a.max_devices, exp_txt, a.note, "", ""])
    with open(base + ".jsonl", "w", encoding="utf-8") as f:
        for d in docs:
            f.write(json.dumps(d, ensure_ascii=False) + "\n")
    with open(base + ".json", "w", encoding="utf-8") as f:
        json.dump(docs, f, ensure_ascii=False, indent=1)

    print(f"生成了 {a.count} 个码（每码最多 {a.max_devices} 台设备，{exp_txt}）")
    print("  " + base + ".csv")
    print("  " + base + ".jsonl   ← 导入云开发数据库 redeem_codes")
    print("  " + base + ".json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
