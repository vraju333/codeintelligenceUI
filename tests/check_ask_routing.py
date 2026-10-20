"""Run against a LIVE backend; no claims of passing until executed."""
import json, os, sys, urllib.request
from pathlib import Path
URL=os.getenv("CI_ASK_URL","http://127.0.0.1:8081/api/knowledge-agent/ask")
cases=json.loads((Path(__file__).parent/"ask_routing_100.json").read_text())
passed=0
for i,case in enumerate(cases,1):
    req=urllib.request.Request(URL,data=json.dumps({"query":case["query"]}).encode(),headers={"Content-Type":"application/json"},method="POST")
    try:
        with urllib.request.urlopen(req,timeout=45) as response: data=json.load(response)
        source=data.get("source","")
        # Only mapping-document intent has a known source contract; others need backend intent telemetry.
        if case["expected_intent"]=="MAPPING_DOCUMENT_SEARCH":
            ok=source=="MAPPING_DOCUMENT_EVIDENCE"
        else:
            print(f"UNVERIFIED {i:03d} {case['expected_intent']}: {source} (backend intent field required)")
            continue
        print(("PASS" if ok else "FAIL"),f"{i:03d}",case["query"],source)
        passed+=bool(ok)
    except Exception as exc: print("ERROR",i,str(exc))
print(f"Verified mapping-document cases: {passed}/20; remaining 80 require explicit backend intent telemetry.")
