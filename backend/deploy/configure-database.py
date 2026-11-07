#!/usr/bin/env python3
"""오롯 전용 DB/역할만 생성한다. 다른 DB와 전역 연결 제한은 변경하지 않는다."""
import base64, hashlib, hmac, json, os, subprocess
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path('/home/ubuntu/orot-affiliate')
settings = dict(line.split('=', 1) for line in (ROOT / '.env.production').read_text().splitlines() if line and not line.startswith('#'))
settings = {key: json.loads(value) if value.startswith('"') else value for key, value in settings.items()}
url = urlparse(settings['DATABASE_URL'])
assert url.username == 'orot_app' and url.path == '/orot_affiliate' and url.hostname == '127.0.0.1'

def sql(command):
    result = subprocess.run(['runuser', '-u', 'postgres', '--', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-At'], input=command, text=True, capture_output=True)
    if result.returncode: raise RuntimeError('Orot database configuration failed; SQL and credentials are not logged.')
    return result.stdout.strip()

if sql("SELECT 1 FROM pg_roles WHERE rolname='orot_app';") != '1':
    salt = os.urandom(16)
    salted = hashlib.pbkdf2_hmac('sha256', url.password.encode(), salt, 4096)
    stored = hashlib.sha256(hmac.new(salted, b'Client Key', hashlib.sha256).digest()).digest()
    server = hmac.new(salted, b'Server Key', hashlib.sha256).digest()
    b64 = lambda value: base64.b64encode(value).decode()
    verifier = 'SCRAM-SHA-256$4096:' + b64(salt) + '$' + b64(stored) + ':' + b64(server)
    sql("CREATE ROLE orot_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 5 PASSWORD '" + verifier + "';")

owner = sql("SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='orot_affiliate';")
if owner and owner != 'orot_app': raise RuntimeError('Existing database has a different owner; stopped.')
if not owner: sql('CREATE DATABASE orot_affiliate OWNER orot_app CONNECTION LIMIT 5;')
sql("ALTER ROLE orot_app CONNECTION LIMIT 5; ALTER DATABASE orot_affiliate CONNECTION LIMIT 5; ALTER ROLE orot_app SET statement_timeout='30s'; ALTER ROLE orot_app SET lock_timeout='15s'; ALTER ROLE orot_app SET idle_in_transaction_session_timeout='45s';")
print('OROT_DB_READY role_limit=5 database_limit=5')
