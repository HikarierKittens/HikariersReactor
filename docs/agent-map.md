# 代码地图（给 AI agent）

目的：让新会话在 **不改代码就能定位** 的前提下动手，避免靠 grep 猜依赖。修改机制前先查这里的「权威文件表」，收尾时补充新配方。

## 分层（依赖方向单向）

```
src/data/*        静态注册表与数值：建筑、科技、资源、CONFIG（schema 版本、存档键）
src/state/*       存档：创建 → 校验 → 规范化 → 持久化/加密
src/simulation/*  纯逻辑，不 import vue；tick.ts 是唯一时钟入口
src/vue/*         只渲染：读 state、发事件，不算数值
src/app/runtime.ts 状态唯一所有者：tick / save / load / import / reset
```

规则：**界面不重算数值**，一律调用 `simulation` 的函数；显示与结算必须同源（否则预览和实际不符）。

## 权威文件表

| 机制 | 权威文件 | 主要依赖方 | 测试关键字 |
|---|---|---|---|
| 建筑注册表（123 座） | `src/data/buildings.ts` | 几乎所有 simulation | `building-limits modules` |
| 科技树与解锁 | `src/data/technologies.ts`、`simulation/unlocks.ts`、`tech-tree.ts` | 建筑/购买/存档 | `tech-tree` |
| 存档入口与版本 | `state/validate-save.ts`、`data/config.ts`（`CONFIG.version`） | runtime、persistence | `save-compatibility previous-release-save reported-save-recovery` |
| 新增字段默认值 | `state/save-compatibility.ts`（`ADDITIVE_BUILDING_IDS`） | 各 `validate-*.ts` | `save-compatibility` |
| 分模块校验 | `state/validate-*.ts` | `validate-save.ts` | 同上 + `power-save-compatibility` |
| 生产结算 | `simulation/production.ts` → `ground-settlement` / `space-settlement` / `factory-settlement` | tick、预览、收支明细 | `modules settlement-ledger pool-replay` |
| 倍率 | `simulation/multipliers.ts`、`storage-bonuses.ts` | 结算、tooltip | `happiness-production` |
| 收支明细 | `simulation/resource-breakdown.ts` | UI 明细面板 | `rate-display settlement-ledger` |
| 幸福度 | `simulation/morale.ts`（显示与结算共用） | production、tick | `happiness-production` |
| 电力与开关 | `simulation/power-grid.ts`、`building-production.ts`（`hasContinuousEnergyInput`） | 几乎所有运行判定 | `power-grid fixed-power power-order-save` |
| 运行数量 | `simulation/housing.ts`（`countRunningBuildings`） | 容量、幸福度、生产 | `cat-housing` |
| 士兵与军事 | `data/military.ts`（战斗力/防御力/毛皮数值表）、`simulation/government.ts`（上限/压力/战斗力/防御力/毛皮）、`simulation/military.ts`（训练与削顶） | tick、InternalPanel | `soldier-stats barracks-toggle hospital neighbors` |
| 居民与住房 | `simulation/housing.ts`、`population.ts` | tick | `cat-housing starvation` |
| 医院与伤兵 | `simulation/hospital.ts` | tick、InternalPanel | `hospital` |
| 临近势力/掠夺 | `simulation/neighbors.ts`、`neighbor-economy.ts` | tick、政府页 | `neighbors neighbor-military-raid raid-economy raid-loot-log` |
| 科技研究与队列 | `simulation/technology.ts`、`project-queue.ts`、`projects.ts` | tick、TechPanel | `tech-tree segmented-queue queue-estimates` |
| 太空/数字世界/终局 | `simulation/space-settlement.ts`、`digital-world.ts`、`stage-three.ts` | tick、面板 | `outer-space digital-* stage-three*` |
| 界面标签页 | `src/vue/App.vue`（`TABS`） | 各 Panel | `test:browser` |
| 专注布局（隐藏右列） | `src/vue/focus-layout.ts`（`useFocusLayout`，按标签页 id 登记判断函数） | `App.vue`（`.layout` 根节点）、`assets/css/style.css` | `focus-layout` |
| 独立滚动区 | `src/vue/isolated-scroll.ts`（`useIsolatedScroll`、`canScrollIn`） | `App.vue` 的 `.col-left-scroll`（左栏统一滚动区）、`assets/css/style.css` | `isolated-scroll` |
| 左栏统一滚动 | `App.vue` 的 `.col-left-scroll`（资源列表+锻造物+威望资源共用一个容器；文明面板在区外） | `assets/css/style.css`（`.col-left .col-left-scroll{flex:1 1 auto;min-height:0}`） | `isolated-scroll` |
| 左列固定（滚动解耦） | `assets/css/style.css`（`.pinned-column`，`min-width:861px` 内） | `App.vue` 的 `.col-left` | `isolated-scroll` |
| 资源明细弹窗宽度 | `assets/css/style.css`（`.resource-detail` 作用域内的宽度与列宽规则） | `TooltipPanel.vue`（`.resource-columns` 标记） | `resource-tooltip-width` |
| 科技树布局 | `src/vue/tech-tree.ts`（`layoutTechTree`、`TECH_NODES_PER_ROW = 10`） | `TechPanel.vue` | `tech-tree` |
| 科技分类与配色 | `src/vue/tech-categories.ts`（`TECH_CATEGORIES` 全量映射、`TECH_CATEGORY_META`） | `TechPanel.vue`、`TooltipPanel.vue`（悬停副标题）、`assets/css/style.css` | `tech-categories` |
| 已退役科技名单 | `src/data/technologies.ts`（`RETIRED_TECHNOLOGIES`，data 层以便 simulation 复用） | `simulation/unlocks.ts`（永不可研究）、`state/validate-unlocks.ts`（跳前置校验）、`TechPanel.vue`（隐藏） | `tech-categories` `retired` |
| 士兵战斗力/防御力数值 | `src/data/military.ts`（`COMBAT_POWER_TECH_BONUS`、`DEFENSE_TECH_BONUS`） | `simulation/government.ts` | `soldier-stats` |
| 工种工具倍率 | `src/simulation/building-production.ts`（`calculateToolMultiplier`） | 结算与悬停共用 | `t20-technologies` |
| AI数据中心全部数值 | `src/simulation/ai-data-center.ts`（电力 `calculateAiDataCenterPower`、量子 `AI_DATA_CENTER_QUANTUM_BONUS`、水泥/石墨烯/精金加成） | `simulation/quantum.ts`、`space-settlement.ts`、`ground-settlement.ts`、`power-grid.ts`、`building-production.ts`、`resource-breakdown.ts`、`vue/building-tooltip-rows.ts` | `t21-ai-data-center` |
| 工厂生产线默认与抽取 | `src/simulation/factory.ts`（`assignNewFactoryLines`、`countFreeFactoryLines`）、`simulation/commands.ts`（`changeFactoryAssignment`） | `purchases.ts`（建造后调用）、`FactoryModal.vue`（`canGrow` 按钮态） | `factory-default-lines building-limits` |
| 建筑悬浮提示 | `src/vue/building-tooltip-rows.ts` | TooltipPanel | `lab-tooltip description-effects-split` |
| 预览缓存 | `src/vue/preview-cache.ts` | 各面板 | `preview-reuse ui-preview-cache` |

## 常见改动配方

1. **新增/调整建筑**：`data/buildings.ts` 加条目 → 同文件末尾 `BUILDING_GROUPS` 分组 → 若为新增 ID，加入 `state/save-compatibility.ts` 的 `ADDITIVE_BUILDING_IDS` → 补 `validate-*` 需要的记录 → 跑 `npm test -- save modules`。缺任一环，旧存档会因记录缺失被判非法。
1b. **新增分段建筑**（beta 0.9.7 起是**两条**注册表记录）：建造态 `xxxSegments`（成本、科技、`segmentedRequired`、`completesInto`）+ 完成态 `xxx`（`cost: {}`、`buildable: false`、`max: 1`、效果字段）。**两条记录的 `name` 必须完全相同**（beta 0.9.9 起建造态不再带「（建造中）」后缀；面板靠行内计数区分，`tests/segmented-naming.test.ts` 会校验同名与无后缀）。建造态由 `src/vue/construction-rows.ts` 的 `withConstructionPhases` 按 `completesInto` 决定渲染：**未建成时只返回建造态**（完成态既不能买也没有开关，显示它只会重复同名行——beta 0.9.26 修的「两个戴森球」），**建成后建造态自行退休、只返回完成态**（beta 0.9.10 起分段建筑一次性；两个建筑面板共用该函数）。若旧存档曾用单 ID 存段数，必须在 `save-compatibility.ts` 的 `SEGMENT_SPLITS` 里登记，并更新 `tests/segmented-split-migration.test.ts`；一次性规则的回归在 `tests/segmented-one-off.test.ts`。tooltip 里任何 `building.segmentedRequired` 都只能从**建造态**读取，完成态条目没有该字段。
2. **改建筑开关/运行判定**：`building-production.hasContinuousEnergyInput`（谁能开关）→ `power-grid.setBuildingPowerEnabled`（开关写入）→ `housing.countRunningBuildings`（谁算运行）→ 若影响容量/产能，检查 `morale.ts`、结算与 tooltip。
3. **改产量公式**：`production.ts` 或对应 settlement → 同步 `resource-breakdown.ts`（明细必须同源）→ 跑 `npm test -- settlement rate-display happiness-production`。
4. **改幸福度**：只改 `morale.ts`；显示与结算共用同一函数，`uiPreview.production` 会缓存。
5. **改士兵/军事**：数值（每项装备的 +1、防御力减伤系数、毛皮公式）改 `data/military.ts` → `government.ts`（上限、压力、战斗力/防御力/毛皮、`soldierStatBreakdown`）→ `military.ts`（训练、削顶）→ `tick.ts` 调用点 → `InternalPanel.vue` 文案与容量显示 → 跑 `npm test -- soldier-stats barracks outer-space digital-effects`。新增装备科技时**必须**同时改 `data/military.ts` 的 `COMBAT_POWER_TECH_BONUS`/`DEFENSE_TECH_BONUS`，否则科技有效果文案但没有实际加成；`tests/soldier-stats.test.ts` 会核对注册表与 tooltip 明细。新增 `data/*.ts` 被 simulation 引用时还要登记进 `scripts/generate-legacy-data.cjs` 的 registry（见 `docs/notes/pitfalls.md` 第 14 条）。
6. **改存档字段**：`validate-save.ts` 串的对应 `validate-*.ts` → `save-compatibility.ts` 窄默认值（不得改动输入对象）→ 用 `npm run fixtures:make` 生成旧版本 fixture → 在 `tests/previous-release-save.test.ts` 断言可载入/往返/非法拒绝。
7. **改界面文案**：对应 `Panel.vue` / `building-tooltip-rows.ts`；**界面与文档禁止 emoji**（`tests/markdown.test.ts` 会把关），仅工厂/冶炼厂/基因/飞船条目允许 ⚙ 按钮。新增科技时**必须**在 `src/vue/tech-categories.ts` 的 `TECH_CATEGORIES` 里给它一个类别——`tests/tech-categories.test.ts` 要求全量覆盖，漏掉会直接红。
8. **改日志**：`progression.addLog` + 分类配色（队列/事件/进度/成就/系统）；浏览器验收有日志条数与配色断言。

## 大文件导航

- `tests/browser/acceptance.html`（约 1800 行）：单个顺序脚本，夹具快照 → 断言 → `store.runtime.replaceState(snapshot)` 还原。定位靠 grep 中文断言文本；改完必须整份跑一次（脚本是顺序的，早期失败会让后续失去夹具）。**该页按 JS 解析，禁止 TS 语法**。
- `src/data/buildings.ts`（约 1500 行）：前半是条目对象，约 1430 行起是 `BUILDING_GROUPS` 分组表。用 `grep "\"<id>\""` 直接跳。
- `docs/update-log.md` / `updatelog.md`：都在**顶部**按时间倒序追加；前者写给维护者（可含文件路径），后者写给玩家（不写路径）。

## 命令速查

| 场景 | 命令 |
|---|---|
| 只跑相关测试 | `npm test -- save barracks` |
| 全量模块测试 + VM 回归 | `npm test` |
| 快速档（类型 + 模块测试） | `npm run check:fast` |
| 浏览器验收 | `npm run test:browser` |
| 验收失败诊断自检 | `ACCEPTANCE_PAGE=tests/browser/failure-selftest.html node tests/run-browser.cjs` |
| 生成旧版存档 fixture | `npm run fixtures:make -- <git-ref> <name>` |
| 完整收尾 | `npm run check` |

## 性能事实（本机实测，2026-10-20）

| 步骤 | 实测耗时 |
|---|---|
| `npm run typecheck` | 约 9 秒 |
| `npm test`（98 个文件、772 项 + VM 回归） | 约 7 秒 |
| `npm run test:browser` | 约 5 秒 |
| `npm run build` | 约 2 秒 |
| `npm run check`（全部） | 约 25 秒 |

结论与直觉相反：**跑全量本身很便宜，真正的成本是「盲改多轮」**。所以优化方向不是少跑测试，而是让每一次运行都给出可诊断的原因——

- 浏览器失败时先看 `FAIL 异常：` 行（页面自述）与 `browser console` 段，不要另写探针；
- 改模拟层时用 `npm test -- <关键字>` 快速迭代，但收尾一律跑 `npm run check`（25 秒，没有理由跳过）；
- 真正慢的是**我**（agent）的定位过程，不是命令：优先用 `docs/agent-map.md` 的权威文件表命中，而不是全仓 grep。
