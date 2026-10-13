import type { AchievementId, GameState, LogType } from '../types/state';
import type { TechnologyId } from '../types/technologies';

export interface AchievementDefinition {
  name: string;
  icon: string;
  desc: string;
  test: (state: GameState) => boolean;
}
export const ACHIEVEMENTS: Record<AchievementId, AchievementDefinition> = {
  first: { name: '第一只猫', icon: '🐱', desc: '与第一只猫相遇。', test: s => s.population >= 1 },
  hundred: { name: '百猫之王', icon: '👑', desc: '猫口达到 100。', test: s => s.population >= 100 },
  food: { name: '千粮富翁', icon: '🍥', desc: '持有 1,000 猫粮。', test: s => s.resources.food >= 1000 },
  pioneer: { name: '科技先锋', icon: '🎓', desc: '完成 5 项科技研究。', test: s => s.tech.length >= 5 },
  builder: { name: '屋檐下的宇宙', icon: '🏘️', desc: '拥有 30 座建筑。', test: s => Object.values(s.buildings).reduce((a, b) => a + b, 0) >= 30 },
  space: { name: '进入太空', icon: '🌙', desc: '建成第一座火箭发射平台，为太空探索做好准备。', test: s => (s.arpaBuildings?.rocketPlatform || 0) > 0 },
};
export const EVENTS: { id: string; name: string; tech: TechnologyId }[] = [];
export const ERAS = ['🌱 生存时代', '🌾 农业时代', '🏭 工业时代', '⚡ 能源时代', '🚀 太空时代'];
export const LOG_TYPES: LogType[] = ['progress', 'event', 'achievement', 'system'];
