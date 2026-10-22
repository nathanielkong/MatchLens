import assert from 'node:assert/strict';
import {connect} from '../db/connection.js';
import {loadEvidencePacket} from '../ai/service.js';
const db=connect('app');let checks=0,maxBytes=0;
try{
 const matches=(await db.query('SELECT m.id,max(e.sequence)::int AS cutoff FROM replay_matches m JOIN replay_events e ON e.match_id=m.id GROUP BY m.id ORDER BY m.id')).rows;
 for(const match of matches){for(const cutoff of [1,Math.floor(match.cutoff/2),match.cutoff]){
  const {packet}=await loadEvidencePacket(db,match.id,cutoff,'analyst');const text=JSON.stringify(packet);maxBytes=Math.max(maxBytes,Buffer.byteLength(text));
  assert.ok(packet.throughSequence<=cutoff);assert.ok(packet.facts.every(f=>f.prefix.throughSequence<=cutoff&&f.evidenceSequences.every(n=>n<=cutoff)));
  assert.ok(!text.includes('final_home_score')&&!text.includes('trackingCoordinateFrame')&&!text.includes('home_strength'));
  assert.ok(Buffer.byteLength(text)<12000,`Prompt packet too large: ${match.id}`);assert.ok(packet.facts.some(f=>f.id==='formations'));checks++;
 }}
 console.log(JSON.stringify({matches:matches.length,cutoffsChecked:checks,maxPacketBytes:maxBytes,checks:'Expanded SQL evidence stays within cutoff, omits hidden fields and fits the input allowance. No model calls.'}));
}finally{await db.end();}
