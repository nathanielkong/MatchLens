import {AIProjectClient} from '@azure/ai-projects';
import {DefaultAzureCredential,ManagedIdentityCredential} from '@azure/identity';
import {createHash,randomUUID} from 'node:crypto';
import type {BudgetStore} from './budget.js';
import './foundry.js';

type Env=Record<string,string|undefined>;
export type ProjectConfig={endpoint:string;agent:string;version:string;model:string;enabled:boolean;maxOutputTokens:number;longOutputTokens?:number;reviewOutputTokens?:number;timeoutMs:number};
export class AIError extends Error {constructor(public code:string,public httpStatus=503,cause?:unknown){super(code,{cause});}}
function bounded(value:string|undefined,fallback:number,min:number,max:number){const n=value===undefined?fallback:Number(value);if(!Number.isInteger(n)||n<min||n>max)throw new Error('Invalid AI request limit');return n;}
export function projectConfig(env:Env=process.env):ProjectConfig {
 const url=new URL(env.FOUNDRY_PROJECT_ENDPOINT??'');
 if(url.protocol!=='https:'||!url.hostname.match(/^[a-z0-9-]+\.services\.ai\.azure\.com$/i)||url.port||url.username||url.password||url.search||url.hash||!/^\/api\/projects\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname))throw new Error('Invalid Foundry project endpoint');
 const agent=env.FOUNDRY_AGENT_NAME??'',version=env.FOUNDRY_AGENT_VERSION??'',model=env.FOUNDRY_MODEL_DEPLOYMENT_NAME??'';
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(agent)||!/^\d+$/.test(version)||!model.match(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/))throw new Error('Set the Foundry agent name, pinned numeric version and connected model');
 if(!['true','false'].includes(env.AI_ENABLED??'false'))throw new Error('Invalid AI_ENABLED');
 return {endpoint:url.href.replace(/\/$/,''),agent,version,model,enabled:env.AI_ENABLED==='true',maxOutputTokens:bounded(env.AI_MAX_OUTPUT_TOKENS,2000,64,4000),longOutputTokens:bounded(env.AI_LONG_OUTPUT_TOKENS,6000,64,8000),reviewOutputTokens:bounded(env.AI_REVIEW_OUTPUT_TOKENS,4000,64,8000),timeoutMs:bounded(env.AI_TIMEOUT_MS,45000,1000,60000)};
}
export function projectStatus(env:Env=process.env){
 try {const c=projectConfig(env);return {provider:'foundry-agent',configured:true,enabled:c.enabled,authentication:'Microsoft Entra ID',credentialsVerified:false,agent:c.agent,version:c.version,message:'Configured locally; use ai:check -- --auth to verify Azure access.'};}
 catch{return {provider:'foundry-agent',configured:false,enabled:false,credentialsVerified:false,message:'Foundry project settings are incomplete or invalid.'};}
}
export type AgentDefinition={kind:string;model?:string;instructions?:string;tools?:unknown[];skills?:unknown[];harness?:unknown};
export interface AgentTransport {
 definition():Promise<AgentDefinition>;
 generate(input:string,maxOutputTokens:number):Promise<{text:string;inputTokens:number;outputTokens:number}>;
}
export function azureAgentTransport(config:ProjectConfig,options:{credential?:ConstructorParameters<typeof AIProjectClient>[1];fetch?:typeof fetch}={}):AgentTransport {
 const credential=options.credential??(process.env.NODE_ENV==='production'?new ManagedIdentityCredential(process.env.AZURE_CLIENT_ID?{clientId:process.env.AZURE_CLIENT_ID}:{}):new DefaultAzureCredential());
 const project=new AIProjectClient(config.endpoint,credential,{retryOptions:{maxRetries:0}});
 const baseClient=project.getOpenAIClient({maxRetries:0,timeout:config.timeoutMs});
 // AI Projects overrides the fetch option passed to getOpenAIClient. Inject
 // the test transport afterwards so unit tests cannot reach Azure accidentally.
 const openai=options.fetch?baseClient.withOptions({fetch:options.fetch}):baseClient;
 return {
  async definition(){return (await project.agents.getVersion(config.agent,config.version,{abortSignal:AbortSignal.timeout(config.timeoutMs)})).definition as AgentDefinition;},
  async generate(input,maxOutputTokens){
   // A fresh request has no conversation or previous_response_id: replay cutoffs
   // cannot inherit evidence from a later request. The agent version is pinned.
   // Agent tools are defined in the immutable version, not in an invocation.
   const request={input,max_output_tokens:maxOutputTokens,store:false,
    agent_reference:{name:config.agent,version:config.version,type:'agent_reference'}};
   const response=await openai.responses.create(request);
   const text=response.output_text?.trim()||response.output.filter(item=>item.type==='message')
    .flatMap(item=>item.content).filter(item=>item.type==='output_text').map(item=>item.text).join('\n').trim();
   if(response.status==='incomplete'&&response.incomplete_details?.reason==='max_output_tokens')throw new AIError('AI_OUTPUT_LIMIT');
   if(response.status!=='completed'||!text)throw new AIError('AI_INCOMPLETE_RESPONSE');
   if(response.output.some(item=>item.type!=='message'&&item.type!=='reasoning'))throw new AIError('AI_UNEXPECTED_TOOL');
   return {text,inputTokens:response.usage?.input_tokens??0,outputTokens:response.usage?.output_tokens??0};
  }
 };
}
export class ProjectAgentClient {
 constructor(public config:ProjectConfig,private budget:BudgetStore,private transport:AgentTransport=azureAgentTransport(config)){}
 async authenticate(){
  try {
   const d=await this.transport.definition();
   if(d.kind!=='prompt'||d.model!==this.config.model||d.tools?.length||d.skills?.length||d.harness||Buffer.byteLength(d.instructions??'')>8000)throw new AIError('AI_UNSAFE_AGENT_CONFIG');
   return d;
  }catch(e){if(e instanceof AIError)throw e;throw new AIError('AI_AZURE_AUTH_OR_AGENT_ACCESS');}
 }
 async run<T>(input:string,clientId:string,verify:(text:string)=>T,contractVersion:string):Promise<{result:T;cached:boolean}> {
  if(!this.config.enabled)throw new AIError('AI_DISABLED');
  if(!input.trim()||Buffer.byteLength(input)>28000)throw new AIError('AI_INPUT_LIMIT',400);
  const key=createHash('sha256').update(JSON.stringify([this.config.endpoint,this.config.agent,this.config.version,this.config.model,contractVersion,input])).digest('hex');
  const cached=await this.budget.cached(key);
  if(cached!==null)return {result:cached as T,cached:true};
  const definition=await this.authenticate();
  // Reserve conservatively using UTF-8 bytes, agent instructions and framing.
  // Never refund failures/timeouts: Azure may have completed an unseen request.
  const longDraft=/:(summary|question|recap|talking_point):draft:/.test(contractVersion);
  // Reasoning tokens share the output allowance. A compact verdict can still
  // need more room to inspect a paragraph-length draft than routing requires.
  const review=/:verdict:\d+$/.test(contractVersion);
  const outputLimit=longDraft?(this.config.longOutputTokens??6000):review?(this.config.reviewOutputTokens??4000):this.config.maxOutputTokens;
  const tokens=Buffer.byteLength(input)+Buffer.byteLength(definition.instructions??'')+outputLimit+4096;
  const id=randomUUID(),client=createHash('sha256').update(clientId).digest('hex');
  try {await this.budget.reserve(id,key,client,tokens);}catch(e){const message=e instanceof Error?e.message:'';throw new AIError(['AI_BUSY','AI_DAILY_LIMIT','AI_RATE_LIMIT','AI_DISABLED'].includes(message)?message:'AI_BUDGET_UNAVAILABLE',message==='AI_BUSY'?409:429);}
  let usage=0;
  try {
   const response=await this.transport.generate(input,outputLimit);
   usage=response.inputTokens+response.outputTokens;
   const result=verify(response.text);
   await this.budget.finish(id,usage,result);
   return {result,cached:false};
  }catch(e){
   await this.budget.finish(id,usage,null).catch(()=>undefined);
   if(e instanceof AIError)throw e;
   throw new AIError('AI_REQUEST_FAILED',503,e);
  }
 }
}
