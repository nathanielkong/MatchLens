import test from 'node:test';import assert from 'node:assert/strict';import express from 'express';import {once} from 'node:events';import {aiRoutes} from '../ai/routes.js';
test('production AI is opt-in and refuses generation without enabled daily limits',async()=>{
 const saved={mode:process.env.NODE_ENV,public:process.env.PUBLIC_AI_ENABLED};process.env.NODE_ENV='production';process.env.PUBLIC_AI_ENABLED='false';let queries=0;
 const app=express();app.use(express.json());app.use('/api',aiRoutes({query:async()=>{queries++;return {rows:[{limits:{dailyLimitsEnabled:false}}]};}} as never));const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 try{const a=server.address();assert.ok(a&&typeof a!=='string');const url=`http://127.0.0.1:${a.port}/api/matches/match/questions`,send=()=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({throughSequence:1,audience:'casual',question:'Who scored?'})});
  let response=await send();assert.equal(response.status,503);assert.equal((await response.json()).error,'AI_DISABLED');assert.equal(queries,0);
  process.env.PUBLIC_AI_ENABLED='true';response=await send();assert.equal(response.status,503);assert.equal((await response.json()).error,'AI_PUBLIC_LIMITS_REQUIRED');assert.equal(queries,1);
 }finally{if(saved.mode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=saved.mode;if(saved.public===undefined)delete process.env.PUBLIC_AI_ENABLED;else process.env.PUBLIC_AI_ENABLED=saved.public;await new Promise<void>(r=>server.close(()=>r()));}
});
