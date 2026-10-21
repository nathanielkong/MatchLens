import {config as dotenv} from 'dotenv';
// This file stays outside the public repository and is read only by the server.
dotenv({path:new URL('../../.env.foundry',import.meta.url),quiet:true,override:false});
type Env=Record<string,string|undefined>;
export type FoundryConfig={endpoint:string;deployment:string;apiKey:string;enabled:boolean;maxOutputTokens:number;maxRequests:number;timeoutMs:number};
const required=['AZURE_OPENAI_ENDPOINT','AZURE_OPENAI_DEPLOYMENT','AZURE_OPENAI_API_KEY'] as const;
function bounded(env:Env,name:string,fallback:number,max:number){const raw=env[name];if(!raw?.trim())return fallback;const n=Number(raw);if(!Number.isInteger(n)||n<1||n>max)throw new Error(`${name} must be an integer between 1 and ${max}`);return n;}
export function readFoundryConfig(env:Env=process.env):FoundryConfig{
 const missing=required.filter(key=>!env[key]?.trim());if(missing.length)throw new Error(`Missing ${missing.join(', ')}`);
 let url:URL;try{url=new URL(env.AZURE_OPENAI_ENDPOINT!.trim());}catch{throw new Error('AZURE_OPENAI_ENDPOINT must be a valid Azure model resource URL');}
 if(url.protocol!=='https:'||!(/^[a-z0-9-]+\.(openai|services\.ai)\.azure\.com$/i.test(url.hostname))||url.port||url.username||url.password||url.search||url.hash||!['/','/openai/v1','/openai/v1/'].includes(url.pathname)){
  throw new Error('AZURE_OPENAI_ENDPOINT must be an HTTPS Azure model resource endpoint, optionally ending /openai/v1/');
 }
 const enabled=env.AI_ENABLED?.trim()??'false';if(!['true','false'].includes(enabled))throw new Error('AI_ENABLED must be true or false');
 return {endpoint:`${url.origin}/openai/v1/`,deployment:env.AZURE_OPENAI_DEPLOYMENT!.trim(),apiKey:env.AZURE_OPENAI_API_KEY!.trim(),enabled:enabled==='true',maxOutputTokens:bounded(env,'AI_MAX_OUTPUT_TOKENS',400,1000),maxRequests:bounded(env,'AI_MAX_REQUESTS',10,20),timeoutMs:bounded(env,'AI_TIMEOUT_MS',15000,30000)};
}
export function foundryStatus(env:Env=process.env){
 const missing=required.filter(key=>!env[key]?.trim());
 try{const config=readFoundryConfig(env);return {configured:true,enabled:config.enabled,credentialsVerified:false,missing:[],message:'Configuration valid locally. Live credentials have not been verified.'};}
 catch(error){return {configured:false,enabled:false,credentialsVerified:false,missing,message:error instanceof Error?error.message:'Invalid Foundry configuration'};}
}
// Reuse one instance for the application. The request allowance lasts only for
// this process; it is not an Azure billing cap and resets when the process starts.
export class FoundryClient{
 private requests=0;
 constructor(private config:FoundryConfig,private transport:typeof fetch=fetch){}
 async generate(input:string){
  if(!this.config.enabled)throw new Error('AI requests are disabled. Set AI_ENABLED=true when ready to make model calls.');
  if(!input.trim()||input.length>16000)throw new Error('AI input must contain between 1 and 16000 characters');
  if(this.requests>=this.config.maxRequests)throw new Error('This process has reached its configured AI request allowance');
  this.requests++;
  let response:Response;
  try{response=await this.transport(new URL('responses',this.config.endpoint),{method:'POST',headers:{'Content-Type':'application/json','api-key':this.config.apiKey},redirect:'error',signal:AbortSignal.timeout(this.config.timeoutMs),body:JSON.stringify({model:this.config.deployment,input,max_output_tokens:this.config.maxOutputTokens,store:false})});}
  catch{throw new Error('Foundry request timed out or could not connect. It was not retried.');}
  if(!response.ok)throw new Error(`Foundry request failed (HTTP ${response.status}). Check model deployment, access and quota. It was not retried.`);
  let body:{status?:string;output?:{type?:string;content?:{type?:string;text?:string}[]}[];usage?:{input_tokens?:number;output_tokens?:number}};
  try{body=await response.json();}catch{throw new Error('Foundry returned an invalid response. It was not retried.');}
  const text=(body.output??[]).filter(item=>item.type==='message').flatMap(item=>item.content??[]).filter(item=>item.type==='output_text'&&typeof item.text==='string').map(item=>item.text).join('\n').trim();
  if(body.status!=='completed'||!text)throw new Error('Foundry did not return completed text. Check the model capabilities and output limit.');
  return {text,usage:{inputTokens:body.usage?.input_tokens??null,outputTokens:body.usage?.output_tokens??null}};
 }
}
