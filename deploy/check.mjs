// Read-only hosting checks. Run npm run hosting:check -- --azure for account checks.
// Nothing is provisioned, registered, published, migrated or enabled by this file.
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));
function az(args) {
  return execFileSync('az', [...args, '--only-show-errors'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit']}).trim();
}
for (const name of ['bootstrap', 'app']) {
  const template = JSON.parse(az(['bicep', 'build', '--file', `${directory}${name}.bicep`, '--stdout']));
  if (name === 'app') {
    for (const secret of ['sessionSecret', 'appDatabaseUrl']) assert.equal(template.parameters[secret].type.toLowerCase(), 'securestring');
    assert.equal(template.parameters.publicAIEnabled.defaultValue, false);
    const app = template.resources.find(resource => resource.type === 'Microsoft.App/containerApps');
    assert.equal(app.properties.template.scale.maxReplicas, 1);
    assert.equal(app.properties.configuration.ingress.allowInsecure, false);
    assert.deepEqual(app.properties.template.containers[0].probes.map(probe => probe.type), ['Startup', 'Liveness', 'Readiness']);
  }
  console.log(`${name}: Azure template compiled and checked`);
}

if (process.argv.includes('--azure')) {
  const account = JSON.parse(az(['account', 'show', '-o', 'json']));
  console.log(`Azure subscription: ${account.name}`);
  const expected = 'd3434551-ea51-4d5e-8edc-88c2f8a2505b';
  assert.equal(account.id, expected, 'Select the MatchLens subscription before deploying.');
  const missing = [];
  for (const namespace of ['Microsoft.App', 'Microsoft.ContainerRegistry', 'Microsoft.ManagedIdentity', 'Microsoft.OperationalInsights']) {
    const state = az(['provider', 'show', '--namespace', namespace, '--query', 'registrationState', '-o', 'tsv']);
    console.log(`${namespace}: ${state}`);
    if (state !== 'Registered') missing.push(namespace);
  }
  const database = JSON.parse(az(['postgres', 'flexible-server', 'show', '-g', 'matchlens-dev', '-n', 'matchlens', '--query', '{state:state,publicAccess:network.publicNetworkAccess}', '-o', 'json']));
  console.log(`PostgreSQL: ${database.state}; public access: ${database.publicAccess}`);
  console.log('Deployment gates: choose database network access before bootstrap; supply restricted database and session secrets; build the image with a commit tag.');
  console.log('Public AI stays off until production SQL daily limits, managed identity and the public origin are verified.');
  if (missing.length || database.state !== 'Ready') process.exitCode = 1;
}
