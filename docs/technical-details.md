# 技术架构与实现细节

> 本文档记录 HikariersReactor 当前的技术实现细节，供后续开发与排查参考。
>
> **维护要求：每次更新游戏后，必须检查本文档内容是否仍然准确；如果实现细节发生变化（新增结算链、缓存策略、存档规则、测试方式等），必须同步更新本文档对应章节。** 文档失真会直接导致后续改动基于错误假设。
>
> 配套文档：`docs/update-log.md`（每次更新的改动记录）、`docs/glossary.md`（游戏内特殊名词的玩家视角解释）。

## 1. 项目概览

- 运行目录：`D:\XMaker\HikariersReactor`（Git 仓库）。
- 技术栈：Vue 3 + TypeScript + Vite；测试使用 Node.js 内置 `node:test`，浏览器验收使用无头 Edge 驱动真实挂载。
- 包管理：npm；生成式桥接脚本见 `scripts/generate-legacy-data.cjs`。

### beta 0.5.6 审计修复约束

- 广播塔/观光空间站幸福度使用结算回放得到的付费运行单位，不能用拥有量替代；太空驻军区分拥有容量（旧档与现有士兵保留）和运行训练容量（受维护/停机影响）。
- 建造与科研仍是独立队列；ARPA遵守有序建造队列前置，所有建造项目复用同一容量规则。重复建筑的乱序结算仍优先低序号，报价递增无需改变。
- `lastSaved`只作元数据，未来时间钳制至当前时间，写盘失败回滚；迁移只补缺失的新字段，不覆盖显式有效进度。过时的Asriel排队布尔标志不再阻止任务，实际队列为准。
- 保留按钮统一主题文字色，用背景/边框区分禁用、危险与选中态；可用性不能只靠颜色表达。日志列表使用仅UI层稳定对象键，不扩展存档格式。
- `BUILDING_CASH_COSTS`/`BUILDING_COST_SCALES`从建筑主数据派生，避免新建筑漏入兼容表；成本按每建筑每资源系数计算，无全局备用系数。

### 日志分类与核心副标题

- `LogType` 新增 `queue`，建筑/科研/ARPA队列完成日志使用该类型。普通事件继续使用 `event`，里程碑、AI启动、黑洞进展与飞船部件完成使用 `progress`，成就使用 `achievement`，存档等诊断保留 `system`。旧存档的「队列中 … 已完成」事件日志在读取时转为queue。
- 日志正文14px、行高1.6，时间12px；队列灰蓝、普通事件暖黄、进度浅蓝、成就浅绿、系统浅红，筛选同步这些类别。
- `TooltipPanel.vue` 的AI超级核心描述首行增加 `world.exection(cat);`，保留原分段进度和维护信息。

### 队列悬停递增价格

- `TooltipPanel.vue` 根据悬停元素的稳定 `queueUid` 从 `describeQueuedPurchases(state)` 读取建筑预测价格，与队列时间预估共用顺序累计结果；普通建筑按已建数量+前序同类数量计算成本蠕变，不受其他建筑插队影响。
- 每次revision重新计算，因此取消中间项目后后续同类价格自动前移；显示序号仍使用当前队列下标+1，uid只作身份标识而不当作序号。分段项目保持剩余分段总需求展示，并用单段价格判断储量是否不足。

### 七项替换成就与不补发兼容

- 成就字典替换为核爆、ESS逃逸、飞船完成、4096蜂群卫星、实际启动AI核心、OC-13研究和黑洞重置七项；描述包含破折号后的条件，`AchievementsPanel.vue` 默认全部，可切换未完成/已完成，选中边框为绿色。
- 周目 `achievementTracking` 记录四项状态条件上次布尔值，只在false→true时授予（飞船完成、卫星数量、核心启动、科技）。旧存档缺失字段时取当前条件作基线，不补发；飞船基线通过完整部件验证计算，以兼容由资源进度推导完成标志的旧档。明确的旧成就ID在载入时清除，未知ID仍拒绝，版本仍为29。
- `updateProgression` 返回新增状态成就，由runtime/App统一记录成就日志；核爆/逃逸/黑洞成就在成功重置的next状态直接授予并记录，不变更源状态。逃逸在清空周目前捕获尚未扫描的飞船等成就，避免立即发射丢失完成成就。
- 普通重置保留已获成就，追踪基线随新周目重新置false，硬重置全部清空。历史重置次数不触发新事件成就。

### 工作自动分配

- 周目字段 `autoWorkers` 保存总开关、岗位优先级和各岗位开关/人数上限（-1不限）。默认全部关闭，旧存档缺失时创建默认配置，版本仍为29；周目重置清空设置。
- `simulation/auto-workers.ts` 使用规范有限岗位列表，复用 `calculateWorkerCapacity`，按优先级仅填充空闲人口，受实际岗位容量及自动人数上限共同限制；无限岗位不参与，不撤回或挪用已有工作猫。手动分配不受自动人数上限约束。
- tick开始、生产结算前自动补员，tick末尾再处理新增人口与新建岗位。暂停游戏时不执行tick分配。UI修改配置后立即尝试补员，总开关关闭时停止并隐藏设置。
- `CatsPanel.vue` 在原手动按钮右侧以竖线分隔自动开关与上限，右侧优先级列表支持HTML拖拽：本地 `dragPriority` 实时预览顺序，`TransitionGroup` 提供160ms位移动画；松手一次性提交完整优先级，取消拖拽恢复原序，不在悬停中触发补员。自动按钮固定显示「自动分配」，开启边框与设置页一致为 `#63b875`；尊重减少动态效果偏好。`App.vue` 通过模拟层命令更新配置。

### 基因修饰布局与新增基因

- `GeneModificationPanel.vue` 每个碱基分组使用独立的4列 `.gene-grid`，不同类型不共享一行。面板宽度低于520px时通过容器查询降为2列（依据面板自身宽度，而非视口）。
- 成熟加速（C，1%/级）乘入 `calculateGrowthMultiplier`。超频锻造（G）主加成2%/级经 `calculateOverclockCraftMultiplier` 乘入 `calculateCraftingMultiplier`（手动锻造与工匠共享）；`GeneDefinition.extra` 的1%/级只乘入工匠产出倍率，不改原料倍率。资源详情列出「超频锻造」与「超频锻造（工匠）」两行。

### 超级集装箱与合金集装箱

- `superContainers`：T8，51400知识，前置 `automatedStorage`。研究后 `calculateBuildingContainerCap` 将集装仓库普通上限改为25；`calculateBuildingAlloyContainerCap` 为集装仓库/格纳库分别返回10/15（均需科技），格纳库普通上限仍为30。
- 新增周目字段 `alloyContainers` 与完整资源记录 `alloyContainerAssignments`。旧存档缺失时按0读取，显式非法值、超额数量/分配、不可分配资源均拒绝；存档版本仍为29。
- 合金箱每个10合金，单箱储量=`calculateContainerUnitCapacity ×4`，因此钢/强化/铱合金集装箱升级即时影响所有已分配合金箱。`storage.ts` 的明细与批量上限路径均累加两种箱子，明细独列「合金集装箱」。
- UI在普通列表右侧使用独立同样式列，窄屏横向滚动；制造、分配及撤回沿用普通箱快捷键，撤回立即执行储量截断。软/核爆/逃逸重置通过初始状态清空箱子及分配。

### 原油精炼优化

- 科技 `crudeOilRefiningOptimization`（tier 9，70k知识，`pre: ['chemicalDeposition', 'oilStorage']`）。`calculateRawBuildingOutput('refinery')` 返回 `{ oil: 1.5 }`，`calculateBuildingInput('refinery')` 返回 `{ energy: 2 }`；地面结算按该配方计算缺电开工比例，建筑悬停显示同一配方。

### 基因合成

- 科技 `geneSynthesis`（tier 11，200k知识，`pre: ['genetics']`，`arpaPre: 'geneSequencing'`）。`isGeneSynthesisUnlocked` 另需基因修饰已解锁（基因剪切+本周目基因测序）。
- 速率存于 `geneModification.synthesis`（每碱基0–100整数百分比，互相独立，随周目重置）。旧存档缺省为0；DNA数量放宽为非负有限数以容纳小数产出。
- `settleGeneSynthesis` 在 `calculateProduction` 中位于全部产出之后、质量喷射之前，按供电生物实验室数（`biologyUnits`）扣除知识：每座每1%为2000知识/s→0.01碱基/s；知识不足时所有碱基按同一比例缩减。`applyGeneSynthesis` 在tick中把产出计入DNA并记入知识消耗统计。知识详情显示「基因合成消耗」行。
- UI：`BuildingsPanel.vue` 的生物科学实验室齿轮按钮打开 `GeneSynthesisModal.vue`，滑块交互同税率。

### 统计-特权页

- `src/simulation/perks.ts` 的 `listActivePerks` 只读汇总已拥有的CRISPR升级与带 `perk` 字段的已达成成就。材料与空间推理两条覆盖链只显示最高已购级，并附当前实际数值（成本递增减免、粒子/卡西米尔储量加成）；其余升级显示描述。
- `AchievementDefinition.perk` 为可选文本，现有成就均未定义，因此成就部分暂为空；以后给成就加 `perk` 即自动出现在 `PerksPanel.vue`。

### 电化学熔炼

- `calculateBuildingInput('smelter', state)` 不因电化学熔炼添加电力维护；该科技仅使钢基础产能由0.5/s变为1/s，保留后续冶炼倍率及原料消耗。输入详情与实际结算共享配方。

### 资源显示精度

- `src/shared/format.ts` 的 `formatResourceNumber` 专供资源库存、上限与速率：显示最多2位小数（缩写单位同样适用），去除尾零和负零；使用 `floorWithPrecision` 修正二进制机器尾差而不虚增真实库存。
- `signedRate` 与资源列表/储量明细共享该格式。普通价格、人口计数等仍用原 `formatNumber`，黑洞质量保留8位。
- 显示精度不写回模拟或存档，资源结算保留完整精度，避免小额产出逐tick丢失。

### 政府改革效果预览

- `InternalPanel.vue` 的体制候选按钮使用 `data-tip-kind="government"`，`TooltipPanel.vue` 注册同类型并直接显示 `GOVERNMENTS` 中的名称与描述，支持悬停、聚焦及Escape关闭。

### 电力收支详情布局

- `TooltipPanel.vue` 仅在电力的消耗明细超过15项时启用 `energy-expense-split`，消耗使用CSS双列布局（条目内部不跨列），并加宽tooltip。15项及以下、其他资源维持原布局。

### 资源管理布局

- 集装箱子页解锁条件为 `calculateContainerCapacity(state) > 0 || state.containers > 0`，允许制造首个集装箱。资源管理入口在集装箱或质量喷射任一可用时显示，条件消失回退世界。ARPA建筑子页检查 `tech.includes('arpa')`，未解锁时回退其他可用ARPA子页。

- `ResourceManagementPanel.vue` 的集装箱和质量喷射使用局部 `.management-list` / `.management-row`，代替多行卡片。Flex布局不换行，名称、说明与加减控件居中同行；内容宽度收缩，窄屏由列表横向滚动，按钮不会被隐藏。
- 不修改全局卡片样式，不影响其他页面。

## 2. TypeScript 严格配置

`tsconfig.json` 当前启用：

```jsonc
"strict": true,
"noUncheckedIndexedAccess": true,
"exactOptionalPropertyTypes": true,
"noImplicitReturns": true,
"noFallthroughCasesInSwitch": true,
"isolatedModules": true,
"verbatimModuleSyntax": true
```

- Vue 模板严格检查：`vueCompilerOptions.strictTemplates: true`。
- 合法 `data-*` 属性通过窄类型声明 `src/vue/html-attributes.d.ts` 支持（HTML/SVG），不开放任意未知属性。
- 脚本工具链由 `tsconfig.scripts.json` 覆盖（`types: ["node"]`，`skipLibCheck: false`）。
- **禁止**通过关闭检查、批量 `!`、`as any`、"禁用规则" 压掉诊断；用存在性守卫与类型收窄修复。

## 3. 核心运行时架构

### 3.1 状态所有权
- `createRuntime()` 持有可变普通对象 `GameState`（见 `src/state/create-state.ts`）。
- Vue 通过 store 的 `shallowRef` + 显式 `revision` 失效机制刷新；模拟本身**不是**响应式的。
- UI 定时器 200ms 一次；运行时按 `performance.now` 计算真实流逝时间，切步上限 1s，追赶封顶 28800s（只用于页面在后台被节流的情况）。载入存档不做离线结算，`lastSaved`只作为存档元数据保留。

### 3.2 生产结算链（`src/simulation/production.ts`）
一次 `calculateProduction(state, dt)` 的顺序（顺序不可乱改，维护费用只扣一次）：

1. `previewMorale`：内部先取一次 `calculateSupportPreview`，并复用其中已算出的 `biologyUnits` / `dataCenterUnits`（2026-10 优化后不再重复调用 `research-power` 辅助函数）；月球维护使用独立池。
2. `settleQuantumCores`：按完整AI核心结算维护，每座电力100/s与氦-3 25/s均需全额支付才运行；未完成分段不扣维护。
3. `settlePowerPlants`：所有发电（含氢气发电站按整单位供水）。
4. `settleSpaceProduction`：月球/Asriel 维护 → 超空间链（阵列 → 太空港 → 中继/货运/民用 → 采冰船 → 小行星基地）。
5. `settleE710WarehousePower` → `settleResearchAndCulture`（生物/数据中心/广播/观光）。
6. 工厂线 → 自动化 → 地面生产 → 自动锻造 → 人口收入 → `finalizeProduction`。

### 3.3 支持与稳定度
- 支持系统按"整单位、全额付费"分配；`StageThreeSupport` 平铺字段（`ports`、`iceShips`、`asteroidBases`、`repeaters`、`hydrogenPlants` 等）见 `src/simulation/stage-three-support.ts`。
- 稳定度/支持系数的**共用来源**是 `src/simulation/building-effects.ts`（`ARRAY_STABILITY=2`、`REPEATER_BONUS_PER_ARRAY=.25`、`SPACEPORT_STABILITY=4`、`SPACEPORT_ASTEROID_SUPPORT=2`、`ASTEROID_BASE_FREIGHT_BONUS=.05` 等），悬停说明由 `getBuildingEffectRows` 渲染；`stage-three-support.ts` 的阵列和信号中继结算复用同一组系数，避免效果与说明不一致。
- 信号中继按 `运行阵列 × 运行中继 × 0.25` 增加稳定度；不放大太空港的 +4。
- 氢气发电站在发电阶段优先耗水，不占小行星支持但**提供**支持。
- 区域数值（已用/总量）统一使用 `src/vue/components/region-balance.ts` 的 `regionBalanceBind` / `regionBalanceText` 渲染。

### 3.4 缓存与只读契约
- `src/vue/preview-cache.ts`：UI 专用缓存，键为 `(state对象身份, revision, dt)`，dt 槽位上限 4，公开 `DeepReadonly` 结果。**只能用于显示，绝不用于授权扣款**。
- 购买、实验等命令路径必须实时重算，不走 UI 缓存。
- `preview-reuse.test.ts` 用旧实现作对照验证等价性，并用 Proxy 拦截证明读取次数下降。

### 3.4a 批量仓储容量与报价上下文（第三批）
- `calculateStorageTotals(state, snapshot)`（`src/simulation/storage.ts`）是**全资源容量的批量来源**：与 `calculateStorageDetails` 共用单遍结算核心（`accumulateStorageRows`），现金与 E-710 按明细语义单独回放；`finalizeProduction` 与 `clampResourcesToCaps` 已改用它。
- CRISPR 双加成语义统一为"两个加成都作用于同一税前小计"（明细与批量一致）。
- `buildPriceContext(state, dt)`（`src/simulation/costs.ts`）为显示端提供报价数据 `{ quantumLevel?, ironMiningShips? }`；`calculateBuildingCost` 可选接收，未传时自算（购买路径语义不变）。`SupportPreview.ironMiningShips` 是铁采矿船付费运行数的权威来源（与生产结算的 inputs 相同，不依赖幸福度）。
- **结算账本（A5 完成态）**：`buildSettlementLedger(state, dt, quantumLevel)`（`src/simulation/support-preview.ts`）一次结算派生全部付费设施运行数（含原始 `plants`/`space` 记录）；`calculateSupportPreview` 是其薄封装。`calculateProduction` 通过 `replaySettledPool`（`src/simulation/pool-replay.ts`）按历史顺序消费账本单位——运行数只决定一次，池轨迹与旧链逐字节一致（oracle：`tests/settlement-ledger.test.ts`、`tests/pool-replay.test.ts`；设计文档：`docs/a5-pool-replay-design.md`）。`previewMorale` 保留历史双池结构，并从结算回放提取文化设施实际付费单位；仅在运行文化设施且拥有超空间来源时，以最多32次、幸福度差小于1e-10的有界迭代处理上游燃料产出反馈。新增氘时代设施拥有“气体云产氘/氦 → 后续设施消费”的同一步资源链，其运行数会受实际幸福度影响，因此拥有这些设施时，仅太空及后续科研段使用实际幸福度重新分配；不能把100%幸福度的支持预览直接用于真实扣款。旧设施路径仍保留账本回放优化。

### 3.4b 氘时代超空间设施
- 科技：维度信标投放T17；超空间采矿探查T18（700k知识+1000 E-710）→ 气体云吸积T18（720k知识+1000 E-710）→ 高科技农场平台T18／核聚变发电T19／大型采矿舰T19。
- 710富集区在稳定区域之后显示，设施仅在超空间展示。氘由气体云采矿舰建造解锁，初始容量0；付费运行的太空港提供8000、小行星基地2000容量。
- `hyperspace-output.ts`统一超空间来源判定与逐资源产量倍率：每座运行太空港给普通超空间来源+25%，多个港口加算；包括水、氦-3、氘，排除特殊／合成资源与电力。产量子项在对应来源下展示。
- 多资源产出必须对每一种资源单独应用倍率，`outputs[building]`不能累加每种资源的开工速度；维护费只根据`inputUnits`扣一次。新增设施采用现有的连续原料供应比例减产，不额外占用支持。
- 阵列维护50电力+0.25 E-710/s，太空港和采冰船各新增5氦-3/s；地热基准0.5氦-3/s、铱／铁采矿船2、E-710采矿船3，原有适用的燃料折扣保持。
- 猫猫社区移除直接普通资源+25%，人口增长乘1.10；其他原有幸福度与食物需求规则保持。

- 超空间视图解锁：`isHyperspaceUnlocked`=`tech.includes('anomalyMapping')`，异常区域测绘只需全域观测校准，研究后立即显示世界导航及超空间分组。场约束理论直接前置异常区域测绘；深空干涉阵列、异常区探测任务、异常响应实验科技与深空实验平台移除。整块异常研究面板及信号/转移/远端实验也已移除，双端场耦合、有限孔径稳定、异常拓扑测绘科技与远端锚点工程退役。短程通信节点、锚点货运站、民用航线站直接用场约束理论解锁并参加运行，接入点信标/维度信标投放的前置也改为场约束理论。稳定度仍按设施正常分配、维护与停机；`stageThree`只保留`coreActivated`。旧档移除全部退役科技/工程/队列/标志，保留后续进度，无退款；剧情章节ID保留并按剩余科技与建设里程碑改写。`App.vue`在超空间锁定时仍回落到地面。

### 3.4c 破维先锋与高维存储
- 科技：高科技工厂T18（800k，前置高科技农场平台）；破维先锋T19（1M，前置超空间采矿探查+气体云吸积）；高维存储T19（1M，前置破维先锋，且`isBuildingFullyBuilt('spaceRipper')`，存档校验同样要求）。
- 分段建筑统一规则：`calculateBuildingCost`对任何`segmentedRequired`建筑直接返回注册表价格，`calculateDynamicCreep`对其返回空列表；`countRunningBuildings`按`floor(段数/segmentedRequired)`计完整单位（替代原AI核心硬编码）。
- 威望资源解锁：`GameState.prestigeUnlocked`（`'particles'|'casimir'`）只增不减，由`updateProgression`→`syncPrestigeUnlocks`记录当前持有>0的资源，软重置、核弹与逃离均经`keepPrestigeUnlocks`继承且不修改源状态；`isPrestigeResourceUnlocked`=记录命中或当前持有>0。缺字段旧档按持有量、CRISPR购买和核弹/逃离次数推断（`validatePrestigeUnlocks`），存档结构版本不变。
- 基因修饰：`GameState.geneModification={dna:{C,G,A,T},levels}`为本周目状态（`createInitialState`新建，所有重置清零），缺字段旧档视为0级；校验拒绝未知键、负数、非整数与超过`MAX_GENE_LEVEL`(50)。解锁条件`isGeneModificationUnlocked`=CRISPR`geneSplicing`+本周目`arpaBuildings.geneSequencing≥1`。`craftDna`每个扣200k知识并计入`knowledgeSpent`；`upgradeGene`扣对应碱基`10×2^level`。CRISPR定义新增可选`casimirCost`，`canAffordCrisprUpgrade`统一判定，`validateStatistics`把已购升级的卡西米尔计入历史获取下限。
- 基因效果接入点：建筑基础产出类基因在`calculateBuildingOutput`中乘到单位产出（地面结算、钛副产物、收支明细同源），资源收支明细不单列基因行，加成直接计入来源的基础值；完美主义乘在`calculateFactoryRecipe.output`（不改input），生产线明细同样直接计入；泰坦之力乘`calculateCombatPower`；猫猫凝聚经`calculatePopulationPressure`与`calculateSoldierPressure`（×(1-bonus/2)）进入`calculateMorale`。
- 空间撕裂者：`powerPlant`+`alwaysRunning`+`output.energy=100`，走普通`settlePowerPlants`路径（无燃料）；知识容量在详情与总量两条路径都于CRISPR之后乘`1+0.2×建成数`，系数在`building-effects.ts`共享。完成第100段时`constructBuildingState`写入事件日志`SPACE_RIPPER_COMPLETED_LOG`（主线完成提示），直接、批量与队列建造共用该入口，因此只触发一次。
- 高科技工厂：`lines:2`、`jobSlots:{cementWorkshop:2}`；在`settleFactoryLines`中排在太空工厂之后按电力与氘连续比例供能，供能生产线=地面+太空+高科技×2，太空工厂秘银加成份额也按生产线计。不进入地面结算与超空间来源循环。
- 超空间太空港付费运行时提供16000氦-3容量（不依赖氘解锁），研究高维存储后与氘一起×2。
- 高维存储：`storage-bonuses.ts`中对民用航线站、小行星基地、太空港基础值×2，太空港追加16000水；货运站倍率由`calculateFreightCapacityMultiplier`给出`1+0.05×基地+1`（加算）。桥接新增`building-effects`模块（80个脚本）。
- 710研究站T19（850k，前置超空间采矿探查+气体云吸积）：`jobSlots:{lab:1}`经`calculateGrantedJobSlots`计入`calculateWorkerCapacity`与地面结算／收支岗位上限（按已建座数）；属于`HYPERSPACE_CONSUMER_IDS`，在超空间来源循环之后按整座扣25电力+1氘，付费座数经`SupportPreview.researchStationUnits`进入储量快照，每座知识+50000（在CRISPR与空间撕裂者加成之前加入）。
- 遥远星际（T20/T21）：
  - 超空间太空港的+25%已移除，`calculateHyperspaceOutputFactor`只保留`calculateProductionMultiplier`。星环加成经`isSpaceResourceSource`覆盖采冰船（水）、五类超空间来源、精金采矿船和石墨烯厂。
  - 设施本地倍率`calculateHyperspaceLocalMultiplier`：精金采矿船为`1+0.1×整座付费运行的精金加工站数`。精金加工站可开关，每座维护电力10/s，按整座全额付费分配；停机或未付费的站不提供加成，不按已建数或小数供能比例计算。结算、回放和收支明细必须复用同一付费运行数与倍率，维护只扣一次；明细里在采矿船下列出「精金加工站」子行。
  - 精金采矿船与石墨烯厂属于`HYPERSPACE_SOURCE_IDS`，按整座供能比例结算。黑洞星际站属于`HYPERSPACE_CONSUMER_IDS`，付费座数经`blackHoleStationUnits`进入储量快照。`calculateRipperKnowledgeBonus`=`0.2+0.01×付费站数`，作用于每座完整撕裂者。
  - 新建筑全部在地面结算的跳过列表里。
  - 彭罗斯球体`segmentEffects:true`：`countRunningBuildings`直接按段数计，`settlePowerPlants`每段+5电力。
  - 引力转化：`calculateRawBuildingOutput`把整座球体的加成`calculateGravityConversionEnergy`平摊到已建段数（每段`5+加成/段数`），结算、回放、明细都走同一路径。
- 质量喷射（`src/simulation/black-hole.ts`）：
  - 状态`state.blackHole={mass,exoticMass,unstable,ejection}`随周目重置。旧档缺失时取默认值，存档版本不变（29）。`validate-black-hole.ts`在建筑校验后检查分配不超过已建容量。
  - 质量喷射器加入`HYPERSPACE_CONSUMER_IDS`，按整座付费供能。`calculateProduction`在所有产出（含人口收入）之后、封顶之前调用`settleMassEjection`，按`min(1, 1000×付费座数/总分配)`等比缩放，并且不超过库存；结果放在`result.ejected`，收支明细显示「质量喷射消耗」。
  - `advanceGameTick`把`ejected`换算成质量（`applyMassEjection`）。奇异质量首次跨过0.025时置`unstable`并写事件日志。
  - 解锁：`isTechnologyUnlocked`要求质量喷射器科技有完整彭罗斯球体；两项特殊科技要求`unstable`。稳定黑洞在`applyResearchSideEffects`中结算后从`state.tech`移除，因此可以再次研究。
  - 奇异失控带`prestigeReset:true`，`isPurchaseAllowed`拒绝直接购买和入队；UI打开确认框，由`launchBlackHolePrestige`校验解锁和费用后生成新周目。
- 黑洞重置：`prestige.blackHoleResets`、`prestige.darkEnergy`、`lifetime.darkEnergyEarned`。重置次数计入`prestigeResetsRequired`和威望资源解锁推断。暗能量储量加成在CRISPR粒子/卡西米尔步骤之后乘`1+0.01×暗能量`（详情行「暗能量加成」，总表同步）。
- 旧版VM桥：`generate-legacy-data.cjs`注册`black-hole`与`validate-black-hole`模块。
  - 区域：`spaceMissionRequired`新增`neutronStar`和`blackHole`两个任务，状态位分别为`neutronStarMissionCompleted`和`blackHoleMissionCompleted`。建筑解锁和存档校验都走通用路径。
- 冶炼厂工位：
  - `GameState.smelterIdle`记录空闲工位数。容量`calculateSmelterSlotCapacity`=冶炼厂+2×恒星熔炉。运行工位`calculateRunningSmelterSlots`=（运行中的冶炼厂+2×熔炉）−min(空闲, 容量)。
  - 地面结算按运行工位套用原`calculateBuildingInput/Output('smelter')`配方，因此`inputUnits.smelter`=付费工位，钛副产物同源。
  - 缺字段旧档按0读取，即全部工位炼钢；超过容量或非整数时拒绝。`changeSmelterAssignment`供⚙弹窗（`SmelterModal.vue`）调用。
- 恒星熔炉：新增电力产出25/s，进入发电结算；原有冶炼厂工位+2/座、工匠可用数与`calculateWorkerCapacity('foundry')`各+2/座保持。`calculateStellarForgeCraftMultiplier`=`1+0.1×座数`乘入锻造倍率，收支明细列为「恒星熔炉」行。
- VR中心：Asriel支持优先级排在末位，`allocations.vrCenter`经`vrCenterUnits`进入`calculateMorale`（每座+2.5，仍受上限）。虚拟训练：`calculateTrainingBoost`=8（原5）。
- 新资源：
  - `graphene`、`nanoAlloy`、`adamantite`：基础容量0，可分配集装箱。锚点货运站解锁后每种+32000。
  - `aerogel`：锻造物，缺失的`craftWorkers.aerogel`按0读取。工厂新增`nanoAlloy`生产线。
  - 存档结构版本仍为29，所有新键都是附加键。

### 3.5 量子计算
- `calculateQuantumSnapshot` 在无快照时按基线迭代至多 16 轮支持预览以打破"量子↔储能↔知识容量"循环。
- `calculateSwarmSupportCapacity` 惰性求值：未研究 `quantumSwarm` 时不读取库存、不触发求解（显式传入 level 仍有效）。

## 4. 存档与迁移

- 存档版本 `CONFIG.version = 29`，localStorage 键 `meow-civilization-v12`。
- 校验入口 `src/state/validate-save.ts`：先做**只读副本**上的退休内容清理（天星、星际先遣等），再逐字段严格校验。
- 旧档兼容原则：
  - **缺失的增量字段默认 0**（建筑、工人、停用记录、新资源等，统一来源见 `src/state/save-defaults.ts` 的三份名单：`OPTIONAL_BUILDING_KEYS` / `NEW_BUILDING_STOPPED` / `DEFAULT_ZERO_RESOURCES`）；
  - **显式给出的非法值一律拒绝**（小数、负数、超安全整数、null、未知 ID）；
  - 退休内容只清理已知 ID，队列清理按 kind 匹配；畸形容器不静默修复；
  - 退休进度**不退款**。

## 5. 构建与测试管线

| 命令 | 内容 |
|---|---|
| `npm run typecheck` | `vue-tsc --noEmit` + `tsc -p tsconfig.scripts.json --noEmit` |
| `npm test` | 先 `pretest` 重新生成桥接脚本（当前79个），再跑全部 TS 测试 + `tests/run.cjs` 保留回归 |
| `npm run test:browser` | 无头 Edge 驱动真实 Vue 单次挂载（`tests/run-browser.cjs`，端口默认 4399） |
| `npm run build` | `vite build` 生产构建 |
| `npm run check` | 上述四项串联的统一验收命令 |
| `npm run benchmark:ui` | UI 预览性能基准（仅合成数据，不代表 FPS） |

- 浏览器验收 `tests/browser/acceptance.html`：一次挂载内完成全流程断言，包括**全部注册建筑（当前90种）在 242px/180px 双宽度下的悬停布局检查**（名称不挤压、数值不溢出、备注独立成行）。
- 测试存档夹具：`tests/fixtures/milestones.ts` 按"地面/月球/太空/远端/信标/信标后"阶段显式构建（含 `extraTech`/`withoutTech`/`stageThreeFlags` 等选项），新测试优先使用它，不再写"全科技减黑名单"。
- PowerShell 注意：内嵌 JS 双引号可能被吞，复杂脚本用 here-string 管道给 node。

## 6. 桥接脚本生成

- `scripts/generate-legacy-data.cjs` 剥离 import/export 后生成桥接脚本（当前79个）到 `assets/generated/`。
- **不要手改生成文件**；新增运行时导出若被旧回归引用需确认桥接可达。新增纯类型 import 安全。

## 7. 历史决策记录（摘选）

- 超空间实验曾去除稳定度/维护储备门槛；现已整体退役，改为场约束理论直接衔接设施与后续科技。
- 星际先遣/信号/货箱支线整体退休（3任务+2科技+2ARPA+5剧情），旧档不退款、幂等清理。
- 导航灯塔通过 `calculateBuildingName` 动态显示为"广播信标"（研究太空广播后），内部 ID 与存档不变。
- 采冰船基础产量 1 → 1.25（破冰计划），只在建筑产出函数一处计算。
- 第一批共用优化：幸福度预览复用支持预览的科研运行数；戴森支持未启用量子时跳过求解；区域数值显示统一。

---

## 更新检查清单（每次更新游戏后执行）

1. `npm run check`（或至少 typecheck + test + test:browser）全绿后再收尾。
2. 检查本文档：结算链顺序、缓存策略、存档默认/退休规则、测试命令是否有变化 → 有则更新对应章节与"历史决策记录"。
3. 检查 `docs/update-log.md`：本次改动是否已按格式补一条记录（含验证结果）。
4. 检查 `docs/glossary.md`：新增机制/术语或数值变化 → 同步对应词条。
5. 若新增了建筑/科技/区域/资源：确认旧档默认值规则、区域数值显示组件、悬停说明来源三处是否已按现有模式接入。
