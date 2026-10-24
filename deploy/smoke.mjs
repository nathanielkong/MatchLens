// Run against the built image. No real database, model credentials or model calls.
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';

const image = process.argv[2] ?? 'matchlens:verify';
const docker = args => execFileSync('docker', args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
let container;
try {
  container = docker(['run', '--detach', '--publish', '127.0.0.1::8080',
    '--env', 'NODE_ENV=production', '--env', 'PUBLIC_AI_ENABLED=false',
    '--env', 'AI_ENABLED=false', '--env', 'APP_DATABASE_URL=postgresql://smoke:smoke@127.0.0.1:1/smoke?connect_timeout=1',
    '--env', `SESSION_SECRET=${randomBytes(32).toString('hex')}`, image]);
  const binding = JSON.parse(docker(['inspect', container]))[0].NetworkSettings.Ports['8080/tcp'][0];
  const base = `http://127.0.0.1:${binding.HostPort}`;
  const get = path => fetch(`${base}${path}`, {signal: AbortSignal.timeout(15000)});
  let healthy = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try { healthy = (await get('/api/health')).ok; } catch { /* Wait for process startup. */ }
    if (healthy) break;
    await delay(1000);
  }
  assert.ok(healthy, 'Container must start and answer liveness checks.');
  assert.equal(docker(['exec', container, 'id', '-u']), '1000', 'Runtime must run as the node user.');
  for (const path of ['/', '/match-room']) {
    const response = await get(path), html = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.match(html, /id="root"/);
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"\s]+)"/g)].map(match => match[1]);
    assert.ok(assets.length, 'Built frontend must reference bundled assets.');
    for (const asset of assets) assert.equal((await get(asset)).status, 200, `Missing asset: ${asset}`);
  }
  assert.equal((await get('/assets/missing.js')).status, 404);
  assert.equal((await get('/api/not-a-route')).status, 404);
  const ready = await get('/api/ready');
  assert.equal(ready.status, 503, 'Unavailable PostgreSQL must fail readiness, without killing the process.');
  assert.deepEqual(await ready.json(), {status: 'unavailable'});
  const disabled = await fetch(`${base}/api/matches/smoke/insights`, {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({throughSequence: 1, audience: 'casual'}), signal: AbortSignal.timeout(5000),
  });
  assert.equal(disabled.status, 503);
  assert.deepEqual(await disabled.json(), {error: 'AI_DISABLED'});
  assert.equal((await get('/api/health')).status, 200);
  docker(['stop', '--time', '15', container]);
  assert.equal(JSON.parse(docker(['inspect', container]))[0].State.ExitCode, 0, 'SIGTERM must shut down cleanly.');
  console.log('Container verified: non-root startup, frontend/assets, API, readiness, disabled AI and graceful shutdown.');
} catch (error) {
  if (container) process.stderr.write(docker(['logs', container]));
  throw error;
} finally {
  if (container) docker(['rm', '--force', container]);
}
