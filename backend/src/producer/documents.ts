import {z} from 'zod';
const claim=z.object({id:z.string(),text:z.string().min(1).max(650),whyItMatters:z.string().max(220).optional(),sourceText:z.string().min(1),evidenceSequences:z.array(z.number().int().positive()).min(1),prefix:z.object({fromSequence:z.number().int().positive(),throughSequence:z.number().int().positive()})});
export const producerDocument=z.object({matchId:z.string(),throughSequence:z.number().int().positive(),atSeconds:z.number().int().nonnegative(),audience:z.enum(['casual','analyst']),label:z.string(),synthetic:z.literal(true),publicationKind:z.enum(['talking_point','catchup','halftime','fulltime']),claims:z.array(claim).min(1).max(12),verification:z.object({accepted:z.literal(true),version:z.string(),method:z.string(),rewrites:z.number().optional()})});
export type ProducerDocument=z.infer<typeof producerDocument>;
export function parseProducerDocument(body:string):ProducerDocument|null{
 try{const d=producerDocument.parse(JSON.parse(body));if(d.claims.some(c=>c.prefix.throughSequence!==d.throughSequence||c.evidenceSequences.some(n=>n>d.throughSequence)))return null;return d;}catch{return null;}
}
const escape=(s:string)=>s.replace(/[\\`*_{}\[\]<>#]/g,'\\$&');
export function recapMarkdown(document:ProducerDocument){
 const d=producerDocument.parse(document),time=`${Math.floor(d.atSeconds/60)}:${String(d.atSeconds%60).padStart(2,'0')}`;
 return [`# MatchLens — ${d.label}`,`Synthetic match ${escape(d.matchId)} · Evidence through ${time} · Event ${d.throughSequence} · ${d.audience} mode`,
 ...d.claims.flatMap(c=>[`## ${escape(c.id)}`,escape(c.text),c.whyItMatters?escape(c.whyItMatters):'','Source: '+escape(c.sourceText),`Evidence events: ${c.evidenceSequences.join(', ')}. Calculated prefix: ${c.prefix.fromSequence}–${c.prefix.throughSequence}.`]),
 'Model-reviewed draft for producer review. Automated verification can miss errors. Synthetic data and model estimates are not real-football evidence.'].filter(Boolean).join('\n\n')+'\n';
}
