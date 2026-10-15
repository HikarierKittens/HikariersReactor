import { BUILDINGS } from '../data/buildings';
import type { GameState, StoryArchive, StoryChapterId } from '../types/state';

export const STORY_CHAPTER_IDS: readonly StoryChapterId[] = ['firstShelter', 'beyondStone', 'sleeplessCity', 'aboveRoof', 'secondHome', 'interplanetaryRoutes', 'strangeElement', 'anotherMind', 'essPlan', 'firstEscape', 'geneRewrite', 'nuclearChoice', 'dysonSwarm', 'coreCalibration', 'anomalyConfirmed', 'twoMaps', 'anomalyResponse', 'controlledField', 'firstSignal', 'firstTransfer', 'anomalyTopology', 'remoteAnchor'];

/** Observe actual milestones only; no prerequisite chapters or timestamps are invented. */
export function collectStoryMilestones(state: GameState): StoryChapterId[] {
  const gates: Record<StoryChapterId, boolean> = {
    coreCalibration: state.stageThree.coreActivated,
    anomalyConfirmed: state.tech.includes('globalObservationCalibration'),
    twoMaps: state.tech.includes('anomalyMapping'),
    anomalyResponse: state.tech.includes('fieldConstraintTheory'),
    controlledField: state.buildings.constraintArray > 0,
    firstSignal: state.buildings.shortRangeRelay > 0,
    firstTransfer: state.buildings.anchorFreightStation > 0,
    anomalyTopology: state.tech.includes('dimensionBeaconDeployment'),
    remoteAnchor: state.buildings.civilianRouteStation > 0,
    firstShelter: state.buildings.nest > 0,
    beyondStone: state.tech.includes('metallurgy'),
    sleeplessCity: state.tech.includes('electricity'),
    aboveRoof: state.tech.includes('spaceflight'),
    secondHome: state.buildings.moonBase > 0,
    interplanetaryRoutes: state.buildings.asrielSpaceport > 0,
    strangeElement: state.resources.e710 > 0 || state.unlockedResources.includes('e710'),
    anotherMind: state.buildings.aiSupercore >= (BUILDINGS.aiSupercore.segmentedRequired || 100),
    essPlan: state.tech.includes('escapePlan') || state.buildings.interstellarDock > 0 || state.prestige.escapeResets > 0,
    firstEscape: state.prestige.escapeResets > 0,
    geneRewrite: state.tech.includes('genetics') || state.crispr.length > 0,
    nuclearChoice: state.tech.includes('nuclearProgram') || state.prestige.nuclearResets > 0,
    dysonSwarm: state.buildings.swarmControlStation > 0 || state.buildings.swarmSatellite > 0,
  };
  return STORY_CHAPTER_IDS.filter(id => gates[id]);
}

/** Sticky archive is independent of log limits and never blocks gameplay. */
export function updateStoryProgress(state: GameState): StoryChapterId[] {
  state.story ??= { unlocked: [], read: [] };
  const added = collectStoryMilestones(state).filter(id => !state.story.unlocked.includes(id));
  state.story.unlocked = STORY_CHAPTER_IDS.filter(id => state.story.unlocked.includes(id) || added.includes(id));
  return added;
}

export function markStoryRead(state: GameState, id: StoryChapterId): boolean {
  if (!state.story?.unlocked.includes(id) || state.story.read.includes(id)) return false;
  state.story.read.push(id);
  return true;
}

/** Preserve earned records, including a milestone reached immediately before reset. */
export function snapshotStoryArchive(state: GameState): StoryArchive {
  const snapshot = { ...state, story: { unlocked: [...(state.story?.unlocked || [])], read: [...(state.story?.read || [])] } };
  updateStoryProgress(snapshot);
  return snapshot.story;
}
