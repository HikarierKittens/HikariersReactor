import { performance } from 'node:perf_hooks';
import { createInitialState } from '../src/state/create-state';
import { CONFIG } from '../src/data/config';
import { TECHNOLOGIES } from '../src/data/technologies';
import { BUILDINGS } from '../src/data/buildings';
import { calculateProduction } from '../src/simulation/production';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { advanceGameTick } from '../src/simulation/tick';
import type { GameState } from '../src/types/state';
import type { TechnologyId } from '../src/types/technologies';
import type { BuildingId } from '../src/types/buildings';

// Synthetic deterministic workload, not a player save or a browser FPS benchmark.
function fixture(level: number): GameState {
  const s = createInitialState(CONFIG.version, 1e9, 0);
  s.tech = level === 0 ? ['survival', 'tools', 'writing', 'agriculture'] : Object.keys(TECHNOLOGIES).filter(id => level === 2 || (TECHNOLOGIES[id as TechnologyId].tier ?? Infinity) < 12) as TechnologyId[];
  const ids: BuildingId[] = level === 0 ? ['nest', 'lumber', 'quarry'] : level === 1 ? ['nest','lumber','quarry','generator','factory','moonBase','iridiumMine','asrielSpaceport','asrielResidence','asrielMine'] : Object.keys(BUILDINGS) as BuildingId[];
  for (const id of ids) s.buildings[id] = BUILDINGS[id].segmentedRequired || (level + 1) * 5;
  for (const id of Object.keys(s.resources) as (keyof typeof s.resources)[]) s.resources[id] = 1e6;
  s.population = (level + 1) * 10;
  if (level === 2) for (const key of Object.keys(s.stageThree) as (keyof typeof s.stageThree)[]) s.stageThree[key] = true;
  return s;
}
function measure(fn: () => void, samples = 30) {
  if (!Number.isSafeInteger(samples) || samples <= 0) throw new RangeError('samples must be a positive safe integer');
  for (let i=0;i<5;i++) fn();
  const times:number[]=[];
  for(let i=0;i<samples;i++){const start=performance.now();fn();times.push(performance.now()-start);}
  times.sort((a,b)=>a-b);
  const median = times[Math.floor(times.length / 2)], p95 = times[Math.floor(times.length * .95)];
  if (median === undefined || p95 === undefined) throw new Error('Missing benchmark samples');
  return { medianMs: +median.toFixed(3), p95Ms: +p95.toFixed(3) };
}
interface MetricRow {
  name: string;
  production: ReturnType<typeof measure>;
  support: ReturnType<typeof measure>;
  uiTenRequests: ReturnType<typeof measure>;
  cachedTenRequests?: ReturnType<typeof measure>;
  logicStepWithoutRuntimeHooks?: ReturnType<typeof measure>;
}
async function main(){
  let cached: undefined | ((s:GameState,revision:number)=>void);
  // --cached is wired to the display cache once available; baseline stays reproducible.
  if(process.argv.includes('--cached')) {
    const { createUiPreviewCache } = await import('../src/vue/preview-cache');
    const cache=createUiPreviewCache();
    cached=(s,revision)=>{for(let i=0;i<5;i++)cache.production(s,revision);for(let i=0;i<5;i++)cache.support(s,revision);};
  }
  for(const [level,name] of ['early','middle','late'].entries()){
    const state=fixture(level);let revision=0;
    const raw=()=>{for(let i=0;i<5;i++) calculateProduction(state);for(let i=0;i<5;i++) calculateSupportPreview(state);};
    const row: MetricRow={name, production:measure(()=>{calculateProduction(state);}), support:measure(()=>{calculateSupportPreview(state);}), uiTenRequests:measure(raw)};
    const cachedRun = cached;
    if (cachedRun) row.cachedTenRequests = measure(() => cachedRun(state, ++revision));
    const tickState=structuredClone(state);
    // Isolate simulation cost: no real queue/event/unlock hooks or DOM work.
    row.logicStepWithoutRuntimeHooks=measure(()=>advanceGameTick(tickState,.2,{happiness:()=>1,capacity:()=>1000,event:()=>{},projects:()=>{},purchases:()=>{},unlocks:()=>{}}));
    console.log(JSON.stringify(row));
  }
}
main();
