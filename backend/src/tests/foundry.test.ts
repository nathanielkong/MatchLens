import test from 'node:test';
import assert from 'node:assert/strict';
import {FoundryClient,foundryStatus,readFoundryConfig} from '../ai/foundry.js';
const environment={AZURE_OPENAI_ENDPOINT:'https://matchlens-test.openai.azure.com/',AZURE_OPENAI_DEPLOYMENT:'matchlens-insights',AZURE_OPENAI_API_KEY:'test-key-never-real',AI_ENABLED:'true'};
test('Foundry validates resource endpoints and keeps optional AI configuration failures away from replay',()=>{
 assert.equal(readFoundryConfig(environment).endpoint,'https://matchlens-test.openai.azure.com/openai/v1/');
 assert.equal(readFoundryConfig({...environment,AZURE_OPENAI_ENDPOINT:'https://matchlens-test.services.ai.azure.com/openai/v1/'}).endpoint,'https://matchlens-test.services.ai.azure.com/openai/v1/');
 for(const endpoint of ['http://example.com','https://example.com/openai/v1/','https://matchlens-test.services.ai.azure.com/api/projects/test','https://matchlens-test.openai.azure.com/?key=secret'])assert.throws(()=>readFoundryConfig({...environment,AZURE_OPENAI_ENDPOINT:endpoint}));
 assert.equal(foundryStatus({}).configured,false);assert.equal(foundryStatus(environment).credentialsVerified,false);
 assert.ok(!JSON.stringify(foundryStatus(environment)).includes(environment.AZURE_OPENAI_API_KEY));
 assert.throws(()=>readFoundryConfig({...environment,AI_MAX_OUTPUT_TOKENS:'100000'}));
});
test('disabled AI sends no requests; live transport uses deployment alias, bounded output, no storage and a request allowance',async()=>{
 let calls=0;
 const transport=(async(url:unknown,init?:RequestInit)=>{calls++;assert.equal(String(url),'https://matchlens-test.openai.azure.com/openai/v1/responses');const body=JSON.parse(String(init?.body));assert.equal(body.model,'matchlens-insights');assert.equal(body.max_output_tokens,400);assert.equal(body.store,false);return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'CONNECTED'}]}],usage:{input_tokens:10,output_tokens:2}});}) as typeof fetch;
 const disabled=new FoundryClient(readFoundryConfig({...environment,AI_ENABLED:'false'}),transport);await assert.rejects(disabled.generate('test'),/disabled/);assert.equal(calls,0);
 const client=new FoundryClient(readFoundryConfig({...environment,AI_MAX_REQUESTS:'1'}),transport);assert.deepEqual(await client.generate('test'),{text:'CONNECTED',usage:{inputTokens:10,outputTokens:2}});await assert.rejects(client.generate('test'),/allowance/);assert.equal(calls,1);
});
test('provider errors never echo remote response bodies or retry automatically',async()=>{
 let calls=0;const transport=(async()=>{calls++;return new Response('remote message containing test-key-never-real',{status:429});}) as typeof fetch;
 await assert.rejects(new FoundryClient(readFoundryConfig(environment),transport).generate('test'),error=>error instanceof Error&&error.message.includes('429')&&!error.message.includes('test-key-never-real'));assert.equal(calls,1);
});
