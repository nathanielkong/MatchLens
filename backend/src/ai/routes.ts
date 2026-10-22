import {Router} from 'express';
import type {Pool} from 'pg';
import {z} from 'zod';
import {foundryStatus} from './foundry.js';
import {AIError,projectStatus} from './project.js';
import {questionSchema} from './questions.js';
import {insightService} from './service.js';
const request=z.object({throughSequence:z.number().int().min(1).max(100000),audience:z.enum(['casual','analyst']).default('casual')}).strict();
export function aiRoutes(db:Pick<Pool,'query'>){
 const routes=Router(),generate=insightService(db);
 routes.get('/ai/status',async(_req,res)=>{
  const status=process.env.AI_PROVIDER==='foundry-agent'?projectStatus():foundryStatus();
  let limits:unknown=null;try{limits=(await db.query('SELECT ai_usage() AS limits')).rows[0].limits;}catch{/* Readiness must not break replay during migration/outages. */}
  res.json({...status,limits});
 });
 routes.get('/matches/:id/reviews',async(req,res)=>{
  const parsed=z.object({throughSequence:z.coerce.number().int().min(0).max(100000),audience:z.enum(['casual','analyst']).default('casual')}).strict().safeParse(req.query);
  if(!parsed.success){res.status(400).json({error:'Provide a valid cutoff and audience'});return;}
  if(!(await db.query('SELECT 1 FROM replay_matches WHERE id=$1',[req.params.id])).rowCount){res.status(404).json({error:'Match not found'});return;}
  const {throughSequence,audience}=parsed.data;
  const {rows}=await db.query('SELECT * FROM ai_review_history($1,$2,$3)',[req.params.id,throughSequence,audience]);
  res.json({matchId:req.params.id,throughSequence,audience,reviews:rows});
 });
 routes.post(['/matches/:id/insights','/matches/:id/questions','/matches/:id/producer'],async(req,res)=>{
  // Cross-origin pages cannot consume a local user's allowance through a form.
  // Reverse proxies must strip incoming forwarded headers; trust proxy stays off.
  const origin=req.get('origin');
  const allowed=(process.env.AI_ALLOWED_ORIGINS??'http://localhost:5174,http://127.0.0.1:5174,http://localhost:5173,http://127.0.0.1:5173').split(',');
  if(origin&&!allowed.includes(origin)){res.status(403).json({error:'AI_ORIGIN_DENIED'});return;}
  if(!req.is('application/json')){res.status(415).json({error:'Use application/json'});return;}
  const isQuestion=req.path.endsWith('/questions');
  const isProducer=req.path.endsWith('/producer');
  const parsed=(isQuestion?request.extend({question:questionSchema}):isProducer?request.extend({output:z.enum(['talking_point','recap'])}):request).safeParse(req.body);
  if(!parsed.success){res.status(400).json({error:'Provide a throughSequence, casual/analyst audience and a question of 5–300 characters when asking Q&A'});return;}
  const matchId=req.params.id;if(typeof matchId!=='string'){res.status(400).json({error:'Invalid match ID'});return;}
  try {res.json(await generate(matchId,parsed.data.throughSequence,parsed.data.audience,req.ip??'unknown','question' in parsed.data?parsed.data.question as string:undefined,'output' in parsed.data?parsed.data.output as 'talking_point'|'recap':'summary'));}
  catch(e){const error=e instanceof AIError?e:new AIError('AI_UNAVAILABLE');res.status(error.httpStatus).json({error:error.code});}
 });
 return routes;
}
