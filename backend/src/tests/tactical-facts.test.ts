import test from 'node:test';import assert from 'node:assert/strict';
import {evidencePacket} from '../ai/evidence.js';import type {ReplayEvent} from '../analytics/statistics.js';
const match={id:'fixture',home_team_id:'h',away_team_id:'a',home_team:'Home',away_team:'Away'},players=[{id:'old',teamId:'h',name:'Old Striker',shirt:9,starter:true,position:'FW'},{id:'new',teamId:'h',name:'New Striker',shirt:18,starter:false,position:'FW'},{id:'away',teamId:'a',name:'Away Striker',shirt:9,starter:true,position:'FW'}];
const e=(sequence:number,clock_seconds:number,type:string,extra:Partial<ReplayEvent>={}):ReplayEvent=>({sequence,clock_seconds,period:clock_seconds<2800?1:2,type,player_id:null,team_id:'h',possession_id:1,outcome:null,home_score:1,away_score:0,details:{periodClockSeconds:clock_seconds<2800?clock_seconds:clock_seconds-2800},...extra});
const events=[e(1,0,'kickoff',{home_score:0}),e(2,100,'shot',{player_id:'old',outcome:'goal',details:{xg:.3,periodClockSeconds:100}}),e(3,2800,'halftime',{period:1,details:{periodClockSeconds:2800}}),e(4,2800,'kickoff'),e(5,3800,'tactic_change',{details:{tactic:'protect_lead',reason:'score_and_time',periodClockSeconds:1000}}),e(6,3900,'substitution',{player_id:'old',details:{inPlayerId:'new',outPlayerId:'old',reason:'fresh_legs',periodClockSeconds:1100}}),e(7,3950,'pass',{player_id:'new',outcome:'complete'}),e(8,4000,'shot',{team_id:'a',player_id:'away',outcome:'goal',away_score:1,details:{xg:.4,periodClockSeconds:1200}}),e(9,4050,'shot',{player_id:'new',outcome:'saved',away_score:1,details:{xg:.2,periodClockSeconds:1250}}),e(10,5600,'fulltime',{away_score:1})];
const packet=(cutoff:number,question?:string,focusPlayerIds?:string[])=>evidencePacket(match,events,cutoff,'analyst',{players,question,focusPlayerIds});
test('tactical explanations combine score/reason, actual simulator rules and only observed following events',()=>{
 assert.ok(!packet(4).facts.some(f=>f.id==='tactical-context'));
 const at=packet(5).facts.find(f=>f.id==='tactical-context')!;assert.match(at.text,/Home 1–0 Away/);assert.match(at.text,/deeper intended targets and less-direct passing/);assert.match(at.text,/0:00 after.*incomplete/);assert.ok(!at.text.includes('0.400'));assert.ok(at.evidenceSequences.every(n=>n<=5));
 const later=packet(9).facts.find(f=>f.id==='tactical-context')!;assert.match(later.text,/synthetic xG 0.000 before\/0.400 after/);assert.match(later.text,/unequal observed duration/);assert.match(later.text,/do not demonstrate.*caused/);assert.deepEqual(packet(9),evidencePacket(match,events.slice(0,9),9,'analyst',{players}));
 const complete=packet(10).facts.find(f=>f.id==='tactical-context')!;assert.match(complete.text,/5:00 before, 5:00 after\. The windows have equal observed duration/);assert.ok(!complete.text.includes('unequal'));
});
test('substitution evidence distinguishes actual contribution and observed exposure from causal impact',()=>{
 const at=packet(6).facts.find(f=>f.id==='substitution-impact')!;assert.match(at.text,/New Striker \(FW\) replaced Old Striker \(FW\)/);assert.match(at.text,/observed playing time 0:00/);assert.match(at.text,/0 shots, 0\/0 completed passes/);
 const after=packet(9,'What did New Striker contribute?').facts.find(f=>f.id==='substitution-impact')!;assert.match(after.text,/observed playing time 2:30/);assert.match(after.text,/1 shots, 1\/1 completed passes/);assert.match(after.text,/game-changing causal impact was not measured/);assert.ok(after.evidenceSequences.every(n=>n<=9));
});
test('follow-up focus retrieves the referenced player while an explicit new name takes priority',()=>{
 const followup=packet(9,'How did he play?',['new']).facts.find(f=>f.id==='player-details')!;assert.match(followup.text,/New Striker/);assert.ok(!followup.text.includes('Away Striker'));
 const explicit=packet(9,'How did Away Striker play?',['new']).facts.find(f=>f.id==='player-details')!;assert.match(explicit.text,/Away Striker/);assert.ok(!explicit.text.includes('New Striker'));
});
test('same-window follow-ups retain the observed interval, never extending it into later play',()=>{
 const p=evidencePacket(match,events,9,'analyst',{players,question:'What about passing in that window?',inheritedWindow:{from:3900,to:4000}}),f=p.facts.find(f=>f.id==='time-window')!;assert.match(f.text,/65:00–66:40/);assert.match(f.text,/Home: 0 goals, 0 shots/);assert.ok(!f.text.includes('0.200'));
});
