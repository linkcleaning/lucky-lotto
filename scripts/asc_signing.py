#!/usr/bin/env python3
"""App Store Connect API로 아이폰 배포 서명을 준비합니다. (GitHub Actions 전용)

  - 번들 ID 등록(없으면)
  - 배포 인증서: 처음 한 번 만들고, 개인키는 ASC_KEY_P8 로 만든 열쇠로 암호화해서
    ios/signing/dist.p12.enc 에 보관 → 다음 빌드부터 같은 인증서를 다시 씀
    (인증서를 지우면 심사 전 빌드가 무효가 될 수 있어서 지우지 않아요)
  - App Store 배포 프로필: 같은 이름으로 재사용, 문제가 있으면 새로 만듦

필요한 저장소 Secrets: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8(.p8 파일 내용 그대로)
"""
import base64, hashlib, json, os, plistlib, re, secrets, sys, time
from datetime import datetime, timezone

import jwt
import requests
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID

BUNDLE_ID = 'kr.co.linkclean.luckylotto'
APP_NAME = 'Lucky Lotto'
PROFILE_NAME = 'Lucky Lotto App Store'
API = 'https://api.appstoreconnect.apple.com/v1'
OUT = os.environ.get('SIGN_OUT', 'signing')
VAULT = 'ios/signing/dist.p12.enc'


def key_text():
    raw = os.environ['ASC_KEY_P8'].strip()
    if 'BEGIN PRIVATE KEY' not in raw:          # base64로 넣었을 때도 허용
        raw = base64.b64decode(raw).decode()
    return raw


def vault_key():
    body = re.sub(r'\s+', '', key_text())
    return hashlib.sha256(('lucky-lotto-signing-v1|' + body).encode()).digest()


def session():
    now = int(time.time())
    tok = jwt.encode({'iss': os.environ['ASC_ISSUER_ID'].strip(), 'iat': now, 'exp': now + 1100, 'aud': 'appstoreconnect-v1'},
                     key_text(), algorithm='ES256', headers={'kid': os.environ['ASC_KEY_ID'].strip(), 'typ': 'JWT'})
    s = requests.Session()
    s.headers.update({'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json'})
    return s


def req(s, method, path, ok404=False, **kw):
    r = s.request(method, API + path, timeout=60, **kw)
    if r.status_code == 404 and ok404:
        return {}
    if r.status_code >= 400:
        raise SystemExit(f'[{r.status_code}] {method} {path}\n{r.text[:1500]}')
    return r.json() if r.text else {}


def load_vault():
    if not os.path.exists(VAULT):
        return None
    try:
        blob = open(VAULT, 'rb').read()
        data = json.loads(AESGCM(vault_key()).decrypt(blob[:12], blob[12:], None))
        key = serialization.load_pem_private_key(data['key'].encode(), None)
        cert = x509.load_der_x509_certificate(base64.b64decode(data['cert']))
        return key, cert, data['id']
    except Exception as e:
        print('보관된 인증서를 열 수 없어요(새로 만듦):', type(e).__name__)
        return None


def save_vault(key, cert, cid):
    os.makedirs(os.path.dirname(VAULT), exist_ok=True)
    data = json.dumps({'id': cid,
                       'cert': base64.b64encode(cert.public_bytes(serialization.Encoding.DER)).decode(),
                       'key': key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                                serialization.NoEncryption()).decode()}).encode()
    nonce = secrets.token_bytes(12)
    open(VAULT, 'wb').write(nonce + AESGCM(vault_key()).encrypt(nonce, data, None))


def env_out(**kv):
    p = os.environ.get('GITHUB_ENV')
    if p:
        with open(p, 'a') as f:
            for k, v in kv.items():
                f.write(f'{k}={v}\n')


def main():
    s = session()
    os.makedirs(OUT, exist_ok=True)

    r = req(s, 'GET', '/bundleIds', params={'filter[identifier]': BUNDLE_ID, 'limit': 5})
    bid = next((x for x in r['data'] if x['attributes']['identifier'] == BUNDLE_ID), None)
    if not bid:
        bid = req(s, 'POST', '/bundleIds', json={'data': {'type': 'bundleIds', 'attributes': {
            'identifier': BUNDLE_ID, 'name': APP_NAME, 'platform': 'IOS'}}})['data']
        print('번들 ID 등록:', BUNDLE_ID)

    apps = req(s, 'GET', '/apps', params={'filter[bundleId]': BUNDLE_ID})['data']
    if not apps:
        raise SystemExit('App Store Connect에 앱이 아직 없어요. "앱 → + → 새로운 앱"에서 번들 ID ' + BUNDLE_ID + ' 로 먼저 만들어 주세요.')
    print('App Store Connect 앱 확인:', apps[0]['attributes']['name'])

    # 인증서: 보관본이 아직 유효하면 재사용
    v = load_vault()
    key = cert = cid = None
    if v:
        key, cert, cid = v
        live = req(s, 'GET', f'/certificates/{cid}', ok404=True).get('data')
        exp = cert.not_valid_after_utc if hasattr(cert, 'not_valid_after_utc') else cert.not_valid_after.replace(tzinfo=timezone.utc)
        if not live or (exp - datetime.now(timezone.utc)).days < 7:
            print('보관된 인증서가 만료됐거나 삭제됨 → 새로 만듦')
            key = cert = cid = None
        else:
            print('보관된 배포 인증서 재사용 (만료:', exp.date(), ')')
    new_cert = False
    if not cert:
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        csr = (x509.CertificateSigningRequestBuilder()
               .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'Lucky Lotto CI'),
                                        x509.NameAttribute(NameOID.COUNTRY_NAME, 'KR')]))
               .sign(key, hashes.SHA256()))
        csr_pem = csr.public_bytes(serialization.Encoding.PEM).decode()
        err = ''
        for ctype in ('DISTRIBUTION', 'IOS_DISTRIBUTION'):
            try:
                c = req(s, 'POST', '/certificates', json={'data': {'type': 'certificates', 'attributes': {
                    'certificateType': ctype, 'csrContent': csr_pem}}})['data']
                cert = x509.load_der_x509_certificate(base64.b64decode(c['attributes']['certificateContent']))
                cid = c['id']
                print('배포 인증서 새로 생성:', ctype)
                break
            except SystemExit as e:
                err += str(e)[:600] + '\n'
        if not cert:
            raise SystemExit('배포 인증서를 만들지 못했어요. 배포 인증서가 이미 최대 개수(보통 3개)인지, '
                             'API 키 권한이 "관리자(Admin)"인지 확인해 주세요.\n' + err)
        save_vault(key, cert, cid)
        new_cert = True

    pw = secrets.token_hex(12)
    enc = (serialization.PrivateFormat.PKCS12.encryption_builder()
           .kdf_rounds(50000)
           .key_cert_algorithm(pkcs12.PBES.PBESv1SHA1And3KeyTripleDESCBC)
           .hmac_hash(hashes.SHA1())
           .build(pw.encode()))
    open(f'{OUT}/dist.p12', 'wb').write(pkcs12.serialize_key_and_certificates(b'Lucky Lotto Distribution', key, cert, None, enc))

    # 프로필: 같은 이름 + 같은 인증서 + 활성 상태면 재사용
    prof = None
    r = req(s, 'GET', '/profiles', params={'filter[name]': PROFILE_NAME, 'include': 'certificates', 'limit': 20})
    for p in r.get('data', []):
        certs = [c['id'] for c in p.get('relationships', {}).get('certificates', {}).get('data', []) or []]
        if not prof and p['attributes'].get('profileState') == 'ACTIVE' and cid in certs:
            prof = p
        else:
            req(s, 'DELETE', f"/profiles/{p['id']}", ok404=True)
    if not prof:
        prof = req(s, 'POST', '/profiles', json={'data': {
            'type': 'profiles',
            'attributes': {'name': PROFILE_NAME, 'profileType': 'IOS_APP_STORE'},
            'relationships': {
                'bundleId': {'data': {'type': 'bundleIds', 'id': bid['id']}},
                'certificates': {'data': [{'type': 'certificates', 'id': cid}]}}}})['data']
        print('배포 프로필 새로 생성:', PROFILE_NAME)
    else:
        print('배포 프로필 재사용:', PROFILE_NAME)
    pdata = base64.b64decode(prof['attributes']['profileContent'])
    open(f'{OUT}/app.mobileprovision', 'wb').write(pdata)
    info = plistlib.loads(re.search(rb'<\?xml.*?</plist>', pdata, re.S).group(0))
    team = info['TeamIdentifier'][0]
    env_out(TEAM_ID=team, PROFILE_NAME=PROFILE_NAME, P12_PASSWORD=pw, NEW_CERT='1' if new_cert else '0')
    print('팀 ID:', team)


if __name__ == '__main__':
    main()
