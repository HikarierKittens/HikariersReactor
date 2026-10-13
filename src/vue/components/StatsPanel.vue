<script setup lang="ts">
import { computed } from 'vue';
import { CONFIG } from '../../data/config';
import type { GameState } from '../../types/state';

const props = defineProps<{ state: GameState; revision: number }>();
const statistics = computed(() => { props.revision; return props.state.statistics; });
const resets = computed(() => { props.revision; return props.state.prestige.softResets + props.state.prestige.nuclearResets + props.state.prestige.escapeResets; });
function number(value: number): string { return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 }); }
function gameDays(value: number): string {
  const days = Math.floor(value);
  return `${number(days)}天（${Math.floor(days / CONFIG.daysPerYear)}年${days % CONFIG.daysPerYear}天）`;
}
</script>

<template>
  <div class="statistics-panel settings">
    <section>
      <h3>威望</h3>
      <dl>
        <div><dt>重置总次数</dt><dd>{{ number(resets) }}</dd></div>
        <div><dt>核爆次数</dt><dd>{{ number(state.prestige.nuclearResets) }}</dd></div>
        <div><dt>逃离重置次数</dt><dd>{{ number(state.prestige.escapeResets) }}</dd></div>
      </dl>
    </section>
    <section>
      <h3>威望资源</h3>
      <dl>
        <div><dt>粒子获取量累计</dt><dd>{{ number(statistics.lifetime.particlesEarned) }}</dd></div>
        <div><dt>卡西米尔获取量累计</dt><dd>{{ number(statistics.lifetime.casimirEarned) }}</dd></div>
        <div><dt>当前卡西米尔</dt><dd>{{ number(state.prestige.casimir) }}</dd></div>
        <div><dt>卡西米尔提供的粒子软上限增量</dt><dd>+{{ number(state.prestige.casimir) }}</dd></div>
      </dl>
    </section>
    <section>
      <h3>历史信息汇总</h3>
      <dl>
        <div><dt>知识消耗</dt><dd>{{ number(statistics.lifetime.knowledgeSpent) }}</dd></div>
        <div><dt>猫猫饿死数</dt><dd>{{ number(statistics.lifetime.starved) }}</dd></div>
        <div><dt>士兵死亡数</dt><dd>{{ number(statistics.lifetime.soldierDeaths) }}</dd></div>
        <div><dt>游戏总天数</dt><dd>{{ gameDays(statistics.lifetime.days) }}</dd></div>
      </dl>
    </section>
    <section>
      <h3>本周目信息汇总</h3>
      <dl>
        <div><dt>知识消耗</dt><dd>{{ number(statistics.run.knowledgeSpent) }}</dd></div>
        <div><dt>市民饿死数</dt><dd>{{ number(statistics.run.starved) }}</dd></div>
        <div><dt>士兵死亡数</dt><dd>{{ number(statistics.run.soldierDeaths) }}</dd></div>
        <div><dt>游戏天数</dt><dd>{{ gameDays(statistics.run.days) }}</dd></div>
      </dl>
    </section>
    <p class="small subtle">每 {{ CONFIG.secondsPerDay }} 秒为游戏 1 天，每年 {{ CONFIG.daysPerYear }} 天。软重置、核爆与逃离重置保留历史统计；硬重置清空全部统计。</p>
    <p class="small subtle">旧存档只能从当前游戏时间恢复天数；无法推断的历史消耗与死亡从 0 开始。旧档粒子累计按当前持有量加已购 CRISPR 的现行价格估算，不代表完整历史。</p>
  </div>
</template>

<style scoped>
.statistics-panel section { margin-bottom: 20px; }
dl { margin: 10px 0; }
dl > div { display: flex; justify-content: space-between; gap: 16px; padding: 8px 0; border-bottom: 1px solid var(--border, #34413a); }
dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
</style>
