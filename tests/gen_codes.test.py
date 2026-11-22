"""gen_codes.py 测试：格式、无歧义字符、去重、导入文件字段。"""
import json, os, re, subprocess, sys, tempfile, csv

HERE = os.path.dirname(os.path.abspath(__file__))
TOOL = os.path.join(HERE, "..", "tools", "gen_codes.py")
LIB = open(os.path.join(HERE, "..", "cloudfunctions", "redeem", "lib.js"), encoding="utf-8").read()

def run(*args):
    out = tempfile.mkdtemp()
    subprocess.run([sys.executable, TOOL, *args, "--out", out], check=True, capture_output=True)
    return out

def main():
    alphabet = re.search(r"const ALPHABET = '([A-Z0-9]+)'", LIB).group(1)
    sys.path.insert(0, os.path.dirname(TOOL))
    import gen_codes
    assert gen_codes.ALPHABET == alphabet, "字母表和云函数不一致"
    assert not set("01OILU") & set(alphabet)

    out = run("300", "--note", "测试 批次", "--days", "365", "--max-devices", "3")
    files = sorted(os.listdir(out))
    assert len(files) == 3, files
    jl = [f for f in files if f.endswith(".jsonl")][0]
    docs = [json.loads(l) for l in open(os.path.join(out, jl), encoding="utf-8")]
    assert len(docs) == 300
    assert len({d["_id"] for d in docs}) == 300
    pat = re.compile("^MW[" + alphabet + "]{12}$")
    for d in docs:
        assert pat.match(d["code"]) and d["_id"] == d["code"]
        assert d["status"] == "active" and d["boundDevices"] == [] and d["maxDevices"] == 3
        assert d["expiresAt"] > d["createdAt"] and d["note"] == "测试 批次"
    arr = json.load(open(os.path.join(out, jl[:-1]), encoding="utf-8"))
    assert arr == docs
    rows = list(csv.reader(open(os.path.join(out, jl[:-6] + ".csv"), encoding="utf-8-sig")))
    assert rows[0][1] == "兑换码" and len(rows) == 301
    assert re.match(r"^MW-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$", rows[1][1])

    # 不过期 + --avoid 去重
    out2 = run("5", "--avoid", os.path.join(out, jl))
    d2 = [json.loads(l) for f in os.listdir(out2) if f.endswith(".jsonl") for l in open(os.path.join(out2, f), encoding="utf-8")]
    assert all(d["expiresAt"] is None for d in d2)
    assert not {d["code"] for d in d2} & {d["code"] for d in docs}
    print("gen_codes tests passed")

main()
