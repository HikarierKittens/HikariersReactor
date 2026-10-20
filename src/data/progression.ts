import type { AchievementId, GameState, LogType } from '../types/state';
import type { TechnologyId } from '../types/technologies';
import { hasCompleteShip } from '../simulation/spaceship';

export interface AchievementDefinition {
  name: string;
  icon: string;
  desc: string;
  /** Optional permanent special effect, listed on the 统计-特权 page once earned. */
  perk?: string | ((level: number) => string);
  test: (state: GameState) => boolean;
}
/** Base mastery and each grade step contribute this fraction, highest grade only. */
export const ACHIEVEMENT_MASTERY_PER_GRADE = .0025;
export const ACHIEVEMENTS: Record<AchievementId, AchievementDefinition> = {
  nuclearCuriosity: { name: '好奇害死猫', icon: '', desc: '这是什么？按一下喵～ ——发射核弹毁灭自己', test: s => s.prestige.nuclearResets > 0 },
  escapeRun: { name: '跑路了跑路了', icon: '', desc: '呼呼呼～飞船飞走喽～——乘坐ESS喵星号离开', test: s => s.prestige.escapeResets > 0 },
  artificialCelestial: { name: '人造天体', icon: '', desc: '这飞船可真大！——完成ESS喵星号飞船', test: s => hasCompleteShip(s) },
  swarmEclipse: { name: '遮天蔽日', icon: '', desc: '我看不见太阳了！——拥有4096个蜂群卫星', test: s => s.buildings.swarmSatellite >= 4096 },
  worldExecution: { name: 'world.exection(cat);', icon: '', desc: '我要给她完整的生命 ——建造并启动AI超级核心', test: s => s.stageThree.coreActivated },
  overclockPrince: { name: '超频小王子', icon: '', desc: '液氦耗尽.... ——研究OverClock·13', test: s => s.tech.includes('overclocking13') },
  spaceDestroyer: { name: '空间毁灭者', icon: '', desc: '我说了不行，它会带来灾难的！——引爆黑洞进行黑洞重置', test: s => s.prestige.blackHoleResets > 0 },
};
export const EVENTS: { id: string; name: string; tech: TechnologyId }[] = [];
export const LOG_TYPES: LogType[] = ['queue', 'progress', 'event', 'achievement', 'system'];
