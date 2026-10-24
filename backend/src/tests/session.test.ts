import test from 'node:test';import assert from 'node:assert/strict';import express from 'express';import {once} from 'node:events';
import {sessionMiddleware} from '../http/session.js';import {runtimeConfig} from '../http/config.js';
test('signed session cookies separate people sharing an IP and reject edited tokens',async()=>{
 const app=express();app.use(sessionMiddleware('a'.repeat(64)));app.get('/',(_q,r)=>r.json({id:r.locals.clientId}));const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 try{const a=server.address();assert.ok(a&&typeof a!=='string');const url=`http://127.0.0.1:${a.port}/`,first=await fetch(url),cookie=first.headers.get('set-cookie')!,id=(await first.json()).id;
 assert.match(cookie,/HttpOnly; SameSite=Strict/);assert.equal((await (await fetch(url,{headers:{Cookie:cookie}})).json()).id,id);
 assert.notEqual((await (await fetch(url)).json()).id,id);assert.notEqual((await (await fetch(url,{headers:{Cookie:cookie.replace('ml_session=','ml_session=f')}})).json()).id,id);
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
test('production requires a stable secret and explicit secure origins for public AI',()=>{
 assert.throws(()=>runtimeConfig({NODE_ENV:'production'}));assert.throws(()=>runtimeConfig({NODE_ENV:'production',SESSION_SECRET:'x'.repeat(64),PUBLIC_AI_ENABLED:'true'}));
 assert.equal(runtimeConfig({NODE_ENV:'production',SESSION_SECRET:'x'.repeat(64),PUBLIC_AI_ENABLED:'true',AI_ALLOWED_ORIGINS:'https://matchlens.example'}).publicAI,true);
 assert.equal(runtimeConfig({}).publicAI,false);
});
