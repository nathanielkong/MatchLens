// Prepare local ARM parameters; never provision Azure resources or enable public AI.
// The resulting file contains credentials: ignored by Git and excluded from Docker.
import {existsSync, readFileSync, writeFileSync, chmodSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parse} from 'dotenv';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const git = args => execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
assert.equal(git(['status', '--porcelain']), '', 'Commit hosting changes before preparing an immutable release.');
const env = {...parse(readFileSync(`${root}backend/.env`)), ...process.env};
const database = new URL(env.APP_DATABASE_URL ?? '');
assert.ok(database.hostname.endsWith('.postgres.database.azure.com'), 'Use the Azure PostgreSQL runtime connection.');
assert.ok(/app/i.test(decodeURIComponent(database.username)) && !/admin|postgres/i.test(decodeURIComponent(database.username)), 'Only the restricted application database role belongs on the host.');
assert.equal(database.searchParams.get('sslmode'), 'verify-full', 'The database connection must verify TLS.');
assert.ok(env.SESSION_SECRET?.length >= 32 && !/^replace/i.test(env.SESSION_SECRET), 'Supply a stable generated SESSION_SECRET.');
const target = `${root}deploy/production.local.json`;
const parameters = {
  '$schema': 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#',
  contentVersion: '1.0.0.0',
  parameters: {
    imageTag: {value: git(['rev-parse', 'HEAD'])},
    sessionSecret: {value: env.SESSION_SECRET},
    appDatabaseUrl: {value: env.APP_DATABASE_URL},
    publicAIEnabled: {value: false},
    minimumReplicas: {value: 0},
  },
};
// Preserve existing secrets and explicit deployment settings when refreshing a release.
if (!existsSync(target)) writeFileSync(target, `${JSON.stringify(parameters, null, 2)}\n`, {mode: 0o600, flag: 'wx'});
else {
  const existing = JSON.parse(readFileSync(target, 'utf8'));
  assert.ok(existing.parameters?.sessionSecret && existing.parameters?.appDatabaseUrl, 'Existing local parameters must contain runtime secrets.');
  existing.parameters.imageTag = parameters.parameters.imageTag;
  writeFileSync(target, `${JSON.stringify(existing, null, 2)}\n`, {mode: 0o600});
  console.log('Refreshed the commit tag; existing secrets and deployment settings retained.');
}
chmodSync(target, 0o600);
console.log('Prepared deploy/production.local.json with restricted database access and the stable session secret.');
console.log('No credentials were printed and no cloud resources were changed.');
console.log('Private PostgreSQL networking is included in bootstrap. After registering missing providers, deployment order is:');
console.log('1. az deployment group create -g matchlens-dev -n matchlens-hosting --template-file deploy/bootstrap.bicep');
console.log('2. Read registryName from that deployment; build the current commit with az acr build --registry <registryName> --image matchlens:<imageTag> --platform linux/amd64 .');
console.log('3. az deployment group create -g matchlens-dev -n matchlens-app --template-file deploy/app.bicep --parameters @deploy/production.local.json');
console.log('4. Verify /api/ready, replay and Foundry identity; then configure production SQL limits before enabling public AI.');
