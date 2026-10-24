import test from 'node:test';import assert from 'node:assert/strict';
import {evidenceClock} from '../ai/clocks.js';
import {evidencePacket} from '../ai/evidence.js';
import type {ReplayEvent} from '../analytics/statistics.js';
test('the same elapsed time can be regulation or added time depending on the recorded half clock',()=>{
 const event={clock_seconds:5418,period:2,details:{periodClockSeconds:2598}};
 assert.match(evidenceClock(event),/90:18 elapsed \(second half, 43:18 half clock; regulation time\)/);
 assert.match(evidenceClock({...event,details:{periodClockSeconds:2778}}),/46:18 half clock; added time/);
 assert.match(evidenceClock({...event,details:{}}),/half clock unavailable/);
 assert.ok(!evidenceClock({...event,details:{}}).includes('regulation'));
});
test('goal chronology and latest-goal evidence carry the recorded half clock without future events',()=>{
 const goal:ReplayEvent={sequence:1,clock_seconds:5418,period:2,type:'shot',team_id:'h',player_id:null,possession_id:1,outcome:'goal',home_score:1,away_score:0,details:{periodClockSeconds:2598,xg:.2}};
 const match={id:'clock',home_team_id:'h',away_team_id:'a',home_team:'Home',away_team:'Away'};
 const packet=evidencePacket(match,[goal,{...goal,sequence:2,clock_seconds:5598,details:{periodClockSeconds:2778}}],1,'casual');
 for(const id of ['goals','latest-goal']){const fact=packet.facts.find(f=>f.id===id)!;assert.match(fact.text,/43:18 half clock; regulation time/);assert.ok(!fact.text.includes('46:18'));assert.deepEqual(fact.evidenceSequences,[1]);}
});
