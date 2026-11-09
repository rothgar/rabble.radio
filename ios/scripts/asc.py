#!/usr/bin/env python3
"""Tiny App Store Connect API client: signs a JWT with the team key via openssl
and performs one request. Usage: asc.py METHOD PATH [json-body]"""
import base64, json, os, subprocess, sys, time, urllib.request
kid = os.environ["ASC_KEY_ID"]; iss = os.environ["ASC_ISSUER_ID"]
key = os.path.expanduser(f"~/.appstoreconnect/private_keys/AuthKey_{kid}.p8")
b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()
now = int(time.time())
signing = b64(json.dumps({"alg":"ES256","kid":kid,"typ":"JWT"}).encode()) + "." + b64(json.dumps({"iss":iss,"iat":now,"exp":now+900,"aud":"appstoreconnect-v1"}).encode())
der = subprocess.run(["openssl","dgst","-sha256","-sign",key], input=signing.encode(), capture_output=True, check=True).stdout
# DER SEQUENCE { INTEGER r, INTEGER s } -> raw r||s
i = 2; parts = []
for _ in range(2):
    assert der[i] == 2; ln = der[i+1]; v = der[i+2:i+2+ln].lstrip(b"\x00"); parts.append(v.rjust(32, b"\x00")); i += 2+ln
token = signing + "." + b64(b"".join(parts))
method, path = sys.argv[1], sys.argv[2]
body = sys.argv[3].encode() if len(sys.argv) > 3 else None
req = urllib.request.Request("https://api.appstoreconnect.apple.com" + path, data=body, method=method, headers={"Authorization":"Bearer "+token, "Content-Type":"application/json"})
try:
    with urllib.request.urlopen(req) as r: print(r.status); print(r.read().decode())
except urllib.error.HTTPError as e: print(e.code); print(e.read().decode())
