export const VERSION = '1.0.0';
export type Player = { id: string; teamId: string; name: string; position: string; shirt: number };
export const teams = ['Harbour Athletic', 'Valley United', 'Northbridge FC', 'Westhaven Rovers'].map((name, i) => ({ id: `team-${i + 1}`, name }));
const first = ['Alex','Morgan','Taylor','Jordan','Casey','Riley','Jamie','Sam','Charlie','Robin','Avery','Finley','Drew','Quinn','Reese','Blake'];
const last = ['Vale','Brook','Ashford','Marsh'];
export const players: Player[] = teams.flatMap((t, i) => first.map((name, j) => ({
  id: `${t.id}-p${j + 1}`, teamId: t.id, name: `${name} ${last[i]}`, shirt: j + 1,
  position: j === 0 || j === 11 ? 'GK' : j < 5 || j === 12 ? 'DF' : j < 8 || j === 13 ? 'MF' : 'FW',
})));
export function random(seed: number) {
  let state = seed >>> 0;
  return () => { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export type Event = {
  sequence: number; clock: number; period: number; type: string; teamId: string | null; playerId: string | null;
  possession: number; x: number | null; y: number | null; endX: number | null; endY: number | null;
  outcome: string | null; details: Record<string, unknown>; homeScore: number; awayScore: number;
};
export type Scenario = 'balanced' | 'home_pressure' | 'away_pressure' | 'open_game' | 'second_half_shift' | 'red_card';
export const scenarios: Scenario[] = ['balanced','home_pressure','away_pressure','open_game','second_half_shift','red_card'];
export function generate(seed: number, scenario: Scenario, homeIndex = 0, awayIndex = 1) {
  const rng = random(seed);
  const home = teams[homeIndex], away = teams[awayIndex];
  if (!home || !away || home.id === away.id) throw new Error('Two distinct teams required');
  const roster = [home, away].map(t => players.filter(p => p.teamId === t.id));
  const active = roster.map(ps => ps.slice(0,11));
  const events: Event[] = [];
  const strength = [0.85 + rng() * 0.3, 0.85 + rng() * 0.3];
  let score = [0,0], clock = 0, possession = 1, side = 0, x = 50, y = 50;
  let holder = active[side][9];
  let previousPass: {playerId: string; sequence: number} | null = null;
  const pick = <T>(xs: T[]) => xs[Math.floor(rng() * xs.length)];
  const clamp = (v: number) => Math.max(0,Math.min(100,v));
  // Coordinates are normalized to the team in possession: x=100 is its attacking goal.
  const emit = (type: string, outcome: string | null = null, details: Record<string, unknown> = {}, endX: number | null = null, endY: number | null = null, actor: Player | null = holder) => {
    events.push({sequence: events.length+1, clock, period: clock < 2700 || type === 'halftime' ? 1 : 2,
      type, teamId: actor?.teamId ?? null, playerId: actor?.id ?? null, possession,
      x: actor ? x : null, y: actor ? y : null, endX, endY, outcome, details, homeScore: score[0], awayScore: score[1]});
  };
  const turnover = (restart = false) => {
    side = 1-side; possession++; x = restart ? 50 : 100-x; y = restart ? 50 : 100-y;
    holder = pick(active[side].filter(p=>p.position !== 'GK')); previousPass = null;
  };
  emit('kickoff');
  let substituted = false, sentOff = false;
  for (let half = 0; half < 2; half++) {
    if (half === 1) {
      clock = 2700; side = 1; possession++; x=50; y=50; holder=active[side][9]; previousPass=null; emit('kickoff');
    }
    while (true) {
      const next = clock + 6 + Math.floor(rng()*12);
      if (next >= (half+1)*2700) break;
      clock = next;
      if (!substituted && clock >= 3600) {
        for (let s=0;s<2;s++) {
          const outgoing = active[s].find(p=>p.position==='FW')!;
          const incoming = roster[s][14];
          emit('substitution',null,{outPlayerId:outgoing.id,inPlayerId:incoming.id},null,null,outgoing);
          active[s][active[s].indexOf(outgoing)] = incoming;
          if (holder.id===outgoing.id) holder=incoming;
        }
        substituted=true; previousPass=null;
      }
      if (scenario==='red_card' && !sentOff && clock>=3300) {
        const offender = active[1].find(p=>p.position==='DF')!;
        emit('foul','committed',{},null,null,offender);
        emit('red_card','sent_off',{},null,null,offender);
        active[1]=active[1].filter(p=>p.id!==offender.id);
        if (holder.id===offender.id) holder=pick(active[1].filter(p=>p.position!=='GK'));
        sentOff=true; previousPass=null;
      }
      const advantage = strength[side] + (scenario==='home_pressure' && side===0 ? .18 : 0)
        + (scenario==='away_pressure' && side===1 ? .18 : 0)
        + (scenario==='second_half_shift' && half===1 && side===1 ? .3 : 0)
        - (active[side].length<11 ? .22 : 0);
      const pressure = Math.round(rng()*100)/100;
      const action = rng();
      if (x>68 && Math.abs(y-50)<37 && action < .24) {
        const distance = Math.hypot((100-x)*1.05,(y-50)*.68);
        const shotXg = Math.max(.015,Math.min(.65,.50*Math.exp(-distance/18)*(1-.35*pressure)));
        const goal = rng()<shotXg;
        if (goal) score[side]++;
        emit('shot',goal?'goal':rng()<.5?'saved':'off_target',{
          xg:Number(shotXg.toFixed(4)), xgSource:'synthetic-distance-pressure-v1', distanceMetres:Number(distance.toFixed(2)),
          ...(goal && previousPass ? {assistPlayerId:previousPass.playerId,assistEventSequence:previousPass.sequence} : {}),
          pressure, shotSpeedKmh:Math.round(65+rng()*45),
        },100,50);
        turnover(true); if (goal) emit('kickoff');
      } else if (action < .73) {
        const receiver=pick(active[side].filter(p=>p.id!==holder.id && p.position!=='GK'));
        const nx=clamp(x+(rng()-.30)*32*advantage), ny=clamp(y+(rng()-.5)*45);
        const distance=Math.hypot((nx-x)*1.05,(ny-y)*.68);
        const difficulty=Math.min(.95,.12+distance/100+pressure*.25);
        const complete=rng()<Math.min(.97,.97-difficulty*.48+(advantage-1)*.1);
        emit('pass',complete?'complete':'incomplete',{recipientId:receiver.id,pressure,difficulty:Number(difficulty.toFixed(3)),distanceMetres:Number(distance.toFixed(2)),progressiveMetres:Number(((nx-x)*1.05).toFixed(2))},nx,ny);
        if (complete) { previousPass={playerId:holder.id,sequence:events.length}; holder=receiver; x=nx;y=ny; }
        else { x=nx;y=ny; turnover(); emit('interception','won'); }
      } else if (action<.94) {
        const nx=clamp(x+rng()*(scenario==='open_game'?22:13)*advantage), ny=clamp(y+(rng()-.5)*16);
        emit('carry','complete',{pressure,distanceMetres:Number(Math.hypot((nx-x)*1.05,(ny-y)*.68).toFixed(2))},nx,ny);
        x=nx;y=ny;previousPass=null;
        if(rng()<.16) { turnover(); emit('tackle','won'); }
      } else {
        emit('foul','committed'); previousPass=null; turnover();
      }
    }
    clock=(half+1)*2700;
    emit(half===0?'halftime':'fulltime',null,{},null,null,null);
  }
  return { home,away,roster,events,strength,score,seed,scenario };
}
