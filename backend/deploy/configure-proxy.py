#!/usr/bin/env python3
import json, shutil, subprocess
from pathlib import Path

container = 'n8n-docker-caddy-1'
config = Path('/home/ubuntu/n8n-docker/Caddyfile')
host = 'orot-api.doneit.agency'
existing = config.read_text()
if host in existing:
    if '# BEGIN OROT_AFFILIATE' not in existing: raise RuntimeError('Existing hostname is not managed by this deployment.')
else:
    metadata = json.loads(subprocess.check_output(['docker', 'inspect', container]))[0]
    gateway = next(value['Gateway'] for value in metadata['NetworkSettings']['Networks'].values() if value.get('Gateway'))
    import ipaddress
    ipaddress.IPv4Address(gateway)
    backup = Path('/home/ubuntu/orot-affiliate/.caddy-before-orot')
    shutil.copy2(config, backup)
    backup.chmod(0o600)
    block = '\n# BEGIN OROT_AFFILIATE\n' + host + ' {\n    reverse_proxy ' + gateway + ':3007\n}\n# END OROT_AFFILIATE\n'
    with config.open('a') as file: file.write(block)
    checked = subprocess.run(['docker', 'exec', container, 'caddy', 'validate', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'], capture_output=True)
    if checked.returncode:
        config.write_text(existing)
        raise RuntimeError('Caddy validation failed; original configuration restored.')
subprocess.run(['docker', 'exec', container, 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'], check=True)
print('OROT_HTTPS_PROXY_READY')
