import test from 'node:test';import assert from 'node:assert/strict';import express from 'express';import {once} from 'node:events';import {ManagedIdentityCredential} from '@azure/identity';
test('patched MSAL remains compatible with Azure Identity managed-identity token acquisition',async()=>{
 const previous={endpoint:process.env.IDENTITY_ENDPOINT,header:process.env.IDENTITY_HEADER};let requests=0;
 const app=express();app.get('/token',(req,res)=>{requests++;assert.equal(req.get('x-identity-header'),'fixture-secret');res.json({access_token:'fixture-token',expires_on:String(Math.floor(Date.now()/1000)+3600),resource:'https://ai.azure.com',token_type:'Bearer',client_id:'00000000-0000-0000-0000-000000000000'});});
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 try{const a=server.address();assert.ok(a&&typeof a!=='string');process.env.IDENTITY_ENDPOINT=`http://127.0.0.1:${a.port}/token`;process.env.IDENTITY_HEADER='fixture-secret';const result=await new ManagedIdentityCredential().getToken('https://ai.azure.com/.default',{abortSignal:AbortSignal.timeout(5000)});assert.equal(result?.token,'fixture-token');assert.ok(requests>0);
 }finally{if(previous.endpoint===undefined)delete process.env.IDENTITY_ENDPOINT;else process.env.IDENTITY_ENDPOINT=previous.endpoint;if(previous.header===undefined)delete process.env.IDENTITY_HEADER;else process.env.IDENTITY_HEADER=previous.header;await new Promise<void>(r=>server.close(()=>r()));}
});
