import { BUILDINGS } from '../../src/data/buildings';
import { calculateProduction } from '../../src/simulation/production';
import { createInitialState } from '../../src/state/create-state';
import { CONFIG } from '../../src/data/config';
import { calculateResourceBreakdown } from '../../src/simulation/resource-breakdown';

console.log('e710Container input', JSON.stringify(BUILDINGS.e710Container.input));
console.log('e710MiningShip input', JSON.stringify(BUILDINGS.e710MiningShip.input));
const s = createInitialState(CONFIG.version, 60, 0);
s.tech.push('exoticElementResearch');
s.buildings.e710Container = 2; s.buildings.e710MiningShip = 1; s.buildings.aiSupercore = 0;
s.resources.helium3 = 100; s.resources.e710 = 1;
const p = calculateProduction(s, 1);
console.log('helium rate', p.rates.helium3, 'e710 rate', p.rates.e710);
const bd = calculateResourceBreakdown('helium3', s, p);
console.log('entries', bd.entries.map(e => e.name + '=' + e.value).join(', '));
