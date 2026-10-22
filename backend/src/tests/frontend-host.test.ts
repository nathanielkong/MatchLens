import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import express from 'express';import {once} from 'node:events';import {frontendRoutes} from '../http/frontend.js';
test('production hosting serves both app routes, caches hashed assets and keeps missing APIs as JSON',async()=>{
 const root=await mkdtemp(join(tmpdir(),'matchlens-host-'));await mkdir(join(root,'assets'));await writeFile(join(root,'index.html'),'<!doctype html><title>MatchLens fixture</title>');await writeFile(join(root,'assets','app-test.js'),'console.log("fixture")');await writeFile(join(root,'.env'),'DO_NOT_SERVE');
 const app=express();app.use('/api',(_req,res)=>res.status(404).json({error:'API route not found'}));app.use(frontendRoutes(root));const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 try{const address=server.address();assert.ok(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`;
  for(const route of ['/','/match-room','/match-room/']){const r=await fetch(base+route);assert.equal(r.status,200);assert.match(await r.text(),/MatchLens fixture/);assert.match(r.headers.get('cache-control')??'',/no-cache/);}
  const asset=await fetch(base+'/assets/app-test.js');assert.equal(asset.status,200);assert.match(asset.headers.get('cache-control')??'',/immutable/);assert.match(await asset.text(),/fixture/);
  const api=await fetch(base+'/api/missing');assert.equal(api.status,404);assert.deepEqual(await api.json(),{error:'API route not found'});
  assert.equal((await fetch(base+'/missing')).status,404);assert.equal((await fetch(base+'/.env')).status,404);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});}
});
test('production hosting fails clearly when the frontend build is missing',()=>{assert.throws(()=>frontendRoutes(join(tmpdir(),'matchlens-missing-build-'+crypto.randomUUID())),/Build the frontend/);});
