<script setup lang="ts">
import { computed } from 'vue';
import type { GameState } from '../../types/state';
import type { ResourceId } from '../../types/economy';
import { RESOURCES } from '../../data/resources';
import { CONFIG } from '../../data/config';
import { calculateContainerUnitCapacity, calculateContainerRecipe, calculateAlloyContainerUnitCapacity } from '../../simulation/containers';
import { fmt } from '../format';

const props = defineProps<{ state: GameState; revision: number }>();

const unitCapacity = computed(() => { props.revision; return calculateContainerUnitCapacity(props.state); });
const alloyUnitCapacity = computed(() => { props.revision; return calculateAlloyContainerUnitCapacity(props.state); });
const recipeText = computed(() => {
  props.revision;
  return Object.entries(calculateContainerRecipe(props.state))
    .map(([resource, amount]) => `${RESOURCES[resource as ResourceId].name} ${fmt(amount)}`)
    .join(' + ');
});
</script>

<template>
  <div class="settings">
    <section>
      <h3>集装箱</h3>
      <p>每个集装箱当前提供 {{ fmt(unitCapacity) }} 储量，制造消耗 {{ recipeText }}。钢集装箱科技会立即升级所有已有集装箱，包括已分配的集装箱；不改变可分配资源种类。</p>
      <p>超级集装箱科技解锁合金集装箱，在普通集装箱列表右侧独立制造与分配，每个消耗10合金，提供普通集装箱4倍储量（当前 {{ fmt(alloyUnitCapacity) }}）。已有普通集装箱不转换，也不占用合金集装箱名额。科技完成后，每座集装仓库提供25个普通名额与10个合金名额；每座格纳库保留30个普通名额，另提供15个合金名额。</p>
      <p>两类集装箱的可分配资源与批量快捷键相同。撤回只解除分配，不销毁集装箱；撤回后超过新储量上限的资源会立即丢失。</p>
    </section>

    <section>
      <h3>悬停价格提示</h3>
      <p>鼠标悬停到建筑或者科技时，如果某项资源的储量上限低于所需价格，直接显示红色字，无需先存满；上限足够但当前数量不足时显示棕色字；资源充足时显示与主题文字相同的颜色。</p>
    </section>

    <section>
      <h3>威望资源计算</h3>
      <p>核爆获得粒子基础值＝当前人口数量÷4＋士兵数量÷2＋10。单次收益软上限为150：超过150的部分按四分之一计算，即150＋（基础值−150）÷4；最终向下取整。</p>
      <p>粒子产量加成按连续曲线换算为有效粒子数：{{ CONFIG.particleProductionSoftCap }}粒子以内轻微递减，超过后递减加速，新增粒子始终有收益，不按数量分段取整。每个有效粒子提供普通资源0.5%产量加成，锻造物为0.125%，同时适用于工匠和手动锻造；电力不受加成。完成空间推理后，储量加成仍按实际粒子数量线性计算，不受产量软上限影响。铸造工具升级后，每座铸造厂还使锻造产出增加3%；锻造不应用幸福度与社区加成。</p>
    </section>

    <section>
      <h3>快捷键</h3>
      <p>按住修饰键并点击建筑按钮或岗位 ＋ / −，可批量操作。</p>
      <ul>
        <li>Ctrl：×10</li>
        <li>Shift：×25</li>
        <li>Alt：×100</li>
      </ul>
      <p>同时按住多个键时，倍率相乘：Ctrl + Shift 为 ×250，Ctrl + Alt 为 ×1000，Shift + Alt 为 ×2500，三个键同时按住为 ×25000。</p>
      <p>批量建造按每次递增后的价格逐个购买，资源不足时停止，剩余数量不会加入队列。普通点击仍按原规则：资源不足则加入队列。</p>
      <p>岗位增减不会超过可用猫口、岗位容量或已分配数量；建筑仍受建造上限及已有预约限制。</p>
      <p>快捷键对手动收集资源无效。工作猫、工匠、生产线、集装箱分配，以及集装箱制造与手动锻造数量按钮支持批量倍率；锻造“最大”始终使用可负担最大数量。ARPA工程的队列按钮支持批量倍率；百分比建造/核弹填充按钮、科技、取消队列及设置操作不使用批量倍率。</p>
    </section>

    <section>
      <h3>📖 文明手册</h3>
      <p class="subtle small">点击猫爪 → 基础生存 → 农场 → 工具 → 木材、石头 → 文字与学校 → 农业 → 工业 → 能源 → 太空。合理分配猫猫、多建学校可加快研究。农场只由农民产出；伐木工人与石工不需要建筑，伐木场和采石场只提供产量与储量加成。学校与实验室需分配教授/科学家才产知识，其他生产建筑保留基础产出。高级工厂消耗原料，原料不足时自动减产。</p>
      <p class="subtle small">幸福度基准100%，每猫−0.5%；最终幸福度/100即全局产量倍率。默认上限100%，每座剧场/广播塔/观光空间站/纪念碑提高2%/3%/3%/2%上限；纪念碑不直接提供士气。剧场提供艺术家岗位；广播塔和观光空间站固定消耗2/5喵能每 1 s、提供3%/3%士气，供能不足按比例减效。文化设施优先供电；上限和空间站猫口容量为被动效果，不依赖供能。成就、饥饿和旧事件不再改变幸福度。随机事件每 {{ CONFIG.eventMin }}–{{ CONFIG.eventMax }} s发生。切换到其他标签页或最小化时游戏不会暂停，回到页面会按真实经过时间继续结算。储量上限由建筑与集装箱提升；达到上限后多余产出会被浪费，记得及时投入建设。设计节奏：前 5 min建立家园，约 30 min进入太空，约 1–2 h登月；实际进度取决于建设策略。</p>
    </section>
  </div>
</template>
