# 技术架构与实现细节

> 本文档记录 HikariersReactor 当前的技术实现细节，供后续开发与排查参考。
>

### 威望收益公式（beta 0.9.45）

统一实现于 `src/simulation/prestige-scaling.ts`，四个家族只在 `government.ts` 里传不同参数：

| 家族 | 人口除数 | 知识除数 | 底数 | 软上限基数 |
|---|---|---|---|---|
| `calculatePrestigeReward`（核爆） | 3 | 1,000,000 | 1.1 | 150 |
| `calculateEscapePrestigeReward` | 3 | 500,000 | 1.015 | 400 |
| `calculateBlackHoleParticleReward` | 2.2 | 400,000 | 1.012 | 800 |
| `calculateDigitalAscensionParticleReward` | 1.15 | 300,000 | 1.008 | 2000 |

**两个必须区分的挑战数值**（都在 `prestige-scaling.ts`）：

- `challengeLevel(state)` = `genes.length`（0–3）→ **只用于软上限** `base × (1 + level/8)`
- `challengeFactor(state)` = `1 + genes.length`（1–4）→ **只用于收益乘数**

合成一个变量会让每个软上限整体偏移 base 的 1/8，且普通周目收益归零。

**为什么这两个函数不在 `challenges.ts`**：`government.ts` 需要它们，而 `challenges.ts` → `prestige.ts` → `government.ts` 已成链。放进 `challenges.ts` 会构成循环导入，症状是 `updateProgression` 静默失效（`prestigeUnlocked` 变成空数组），测试报 `actual: []`。

**知识项**：`log_rate(1 + (rate-1) × run.knowledgeSpent / divisor)`，读 `statistics.run`（本周目）而非 `lifetime`。在 `knowledge = divisor` 处约等于 1，所以除数就是"多少知识值一个奖励单位"。

**溢出软化** `softenAgainstCap(raw, cap)`：未超上限原样返回；超出时 `cap + (raw-cap)/raw × cap`。该式在 cap 处连续、单调递增、恒小于 `2×cap`。旧实现 `cap + (raw-cap)×系数` 是线性外推，长局无界膨胀。

**卡西米尔**：`floor(log2(粒子) × 倍率 × e × challengeFactor)`，粒子 ≤1 给 0。逃离 1、黑洞 2.5、飞升 4。三个函数都接收 `state` 参数读挑战因子。

**暗能量**：`(ln(1 + 40×exotic) + log2(max(1, mass−9)) / 2.5) × challengeFactor`，超 10 的部分只付一成，`max(1, floor(...))`。`max(1, ...)` 是必需的：质量被耗到 9 以下时 `log2(0) = -Infinity`，会污染结果。

**VM 桥接**：`prestige-scaling` 必须登记进 `scripts/generate-legacy-data.cjs` 的 registry，且排在 `black-hole` 与 `government` 之前，否则报 `prestigeSoftCap is not defined`。

### 种族特质（beta 0.9.44）

存档字段 `GameState.speciesTraits = { traits: SpeciesTraitId[] }`，本周目内有效。

- 数据：`src/data/species-traits.ts` 是特质定义、默认特质与上限的**唯一来源**。
- 数值常量与购买逻辑：`src/simulation/species-traits.ts`（`toggleSpeciesTrait` 同时处理买与删）。
- 效果接入点分散在四处，但都只在 simulation 层各改一行，界面不重算：

| 特质 | 接入位置 |
|---|---|
| 聪明 | `building-production.ts` `calculateBuildingOutput`，在基因乘算之后**加算** `.25`/`.5` |
| 创造 | `projects.ts` `calculateProjectCost`，基数 ×0.8 且 `costScale - .005` |
| 可爱 | `morale.ts` `calculateArtistEffect`，加 `.01` |
| 好奇 | `storage-bonuses.ts` 的 `school` 分支，容量 ×(1 + .001 × 人口) |

**注意**：聪明是加算而 advancedScience 基因是乘算，两者叠加后不再是简单倍率关系。验证基因倍率的测试必须先把 `speciesTraits` 清空，否则会被这 0.25 干扰。

**存档兼容**：`speciesTraits` 是新增字段。`validate-save.ts` 的字段集合校验里有 `backfilledFields` 白名单（目前是 `achievementLevels`、`speciesTraits`），名单内的字段允许在旧存档中缺失，由各自的校验器回填默认值。新增可选字段时把 id 加进这个集合，并在 `state/validate-*.ts` 里实现「缺失给默认、存在则严格校验」的双分支。

### 特殊资源的储量加成（beta 0.9.43）

`calculateStorageTotals` 用两个通用循环发放粒子 / 卡西米尔 / 暗能量加成，循环里 `continue` 掉 `crafted` 和 `special` 资源。所以任何 `special: true` 的资源（`energy`、`bytes`、`encryptedData`）都**不会**自动获得加成。

字节是例外：它在 `calculateStorageDetails` 里有独立分支（容量来自量子存储器与记忆核心，不是 `baseStorage`），现在该分支自己算出三项加成，`calculateStorageTotals` 也在末尾用 `byteBase * (1 + crispr) * (1 + darkBonus)` 重算一遍。

改这类资源时注意三点：

1. **两条路径必须逐分对齐**。详情行是给人看的，批量总量是真正裁剪用的；`tests/bytes-storage-bonus.test.ts` 有专门断言。
2. **加法与乘法的顺序**与普通资源一致：两个 CRISPR 加成作用在同一个加总前基数上，暗能量再乘后体。
3. 如果再加别的 `special` 资源进来，记得 `tests/crispr.test.ts` 里那条「special 资源上限不变」的普适断言要同步豁免。
> **维护要求：每次更新游戏后，必须检查本文档内容是否仍然准确；如果实现细节发生变化（新增结算链、缓存策略、存档规则、测试方式等），必须同步更新本文档对应章节。** 文档失真会直接导致后续改动基于错误假设。
>
> 配套文档：`docs/update-log.md`（每次更新的改动记录）、`docs/glossary.md`（游戏内特殊名词的玩家视角解释）。

## 界面开发硬性规范：禁止emoji

- 游戏所有界面、按钮、标题、提示、资源/建筑/工程/成就、时代名称及日志均不得使用emoji图标；今后新增内容同样禁止添加。
- 唯一经用户明确批准的例外：保留工厂、冶炼厂、基因合成及飞船配置入口的齿轮按钮（U+2699），保持原紧凑尺寸及中文可访问名称。除此之外不得新增emoji、装饰图标或图标占位元素。数学符号、单位及必要文字标点可保留。
- 图标数据字段暂保留空字符串以兼容类型及旧桥接，UI不得渲染空图标容器。新日志与当前有效存档导入日志通过`shared/plain-text.ts`统一清理emoji，不改变原日志类型和时间。
- `tests/markdown.test.ts`扫描全部`src`、HTML入口、发布更新日志及CSS，检测emoji即失败；不要通过Unicode转义或HTML实体绕过此规范。

## 1. 项目概览

当前版本为 beta 0.7.3（2026/10/19），在 beta 0.6 分支基础上扩展第四阶段数字内容、戴森球与量子平衡，并把电力改为固定供给预算。schema 31 保持兼容；下文玩法机制沿用基线，旧版本兼容行为只在历史记录中保留。

- 运行目录：`D:\XMaker\HikariersReactor`（Git 仓库）。
- 技术栈：Vue 3 + TypeScript + Vite；测试使用 Node.js 内置 `node:test`，浏览器验收使用无头 Edge 驱动真实挂载。
- 包管理：npm；生成式桥接脚本见 `scripts/generate-legacy-data.cjs`。

### 固定电力（beta 0.7.0）

- 电力不再是库存资源：`RESOURCES.energy.cap = 0`，`storage` 对电力恒返回空明细与总量0，`validate-economy` 在载入时校验旧值后归零。发电与耗电都在每次结算内完成，剩余供给不累积。
- `settlePowerPlants` 先把调用方池的 `energy` 清0，再按 `输出×dt` 写入临时预算；`settleQuantumCores` 与数字世界、空间、月面、Asriel、仓库、研究等消费者沿用既有优先级从该预算扣费，非电力燃料仍按 `dt` 结算。
- 回放 `replaySettledPool` 只重放台账已支付的发电量与各消费者扣费，不重新推导单位；`finalizeProduction` 令持久 `pool.energy = 0`，并令 `rates.energy = available`。`calculateProduction` 返回 `power = { generated, used, available }`（均为瓦特原值，不随 dt 变化）；`SupportPreview.power` 是研究/观测预留前的边界余额。
- UI 以 `production.power` 显示“剩余 / 总值”；建筑提示中的电力数字不带 `/s`（其他资源保留）。旧储能站已从注册表、分组与类型移除，历史已研究的 `energyStorage`/`batteryConcentrationRing` 保留 ID 但不可再研究且无效果；旧档中的电池建筑/停用/工人/队列定向清理，其他进度不变。
- 建造、科技与工程的一次性电力费用由 `one-time-cost` 过滤掉（报价、支付、队列与注资共用），每秒运行消耗不变。

#### 电力的三个“可用”数字（易混淆，勿混用）

固定电力下有三个名字相近但含义不同的数值，**三者仅在全部已开启负载都获得供电时相等**：

| 数值 | 定义 | 是否可为负 | 用途 |
|---|---|---|---|
| `PowerGrid.available` | `generated - requested`（余量） | 是 | 公开的 `ProductionResult.power.available` 与 `rates.energy`；UI 显示“剩余” |
| `PowerBudget.available` | 结算后未用预算，钳制 `>= 0`；`used` 由它反推 | 否 | 仅 `power.ts` 内部 |
| `ResourceBreakdown.net` | `income + expense`，即 `generated - used`（实际流量） | 否（电力行） | 悬浮详情的收支明细 |

`requested` 统计**所有已开启**建筑的用电需求，与实际是否供上电无关；`used` 只统计实际获得供电的部分。因此当需求超过发电时，`available` 为负而 `net` 仍为该次实际净流量。模拟层不得把 `available` 当作可支配电量使用。

### 工业化与光伏电站（beta 0.7.3）

- `industrialization`（工业化）为 T8 节点科技，42k知识，pre `electricity`/`automation`/`titaniumSmelting`，列于 `KEY_TECHNOLOGIES`（金色边框）。`factory` 的 `tech` 由 `automation` 改为 `industrialization`，工厂与生产线随之改由工业化解锁。
- `solarPower`（太阳能发电）为 T8 科技，50k知识，pre `electronics`，解锁 `solarFarm`。
- `solarFarm`（光伏电站）位于 `energy` 分组：`powerPlant: true`，`output.energy = 4`，无 `input`、无岗位；成本 cash 10000 / copper 1000 / iron 1000 / metal 100，四项蠕变 1.225。作为 `powerPlant` 由 `settlePowerPlants` 直接注入固定电力预算，不经过库存。
- `electronics` 改为 T8（42k知识，pre `industrialization`/`electricity`）；`oilTechnology` 改为 T8（45k知识，pre `industrialization`）；`alloyDrill`/`alloyChainsaw` 的 pre 改为 `industrialization`。
- 存档兼容：`validate-unlocks` 中的 `RETARGETED_PREREQUISITE_TECH` 与 `RETARGETED_BUILDING_TECH` 只为上述改动作历史豁免——缺失的父级仅允许是 `industrialization`（工厂额外允许旧 `automation`），其余不满足的前置仍报错，`isTechnologyUnlocked` 对新研究保持严格。`solarFarm` 加入 `save-compatibility` 的 `ADDITIVE_BUILDING_IDS`。

### 戴森球与量子平衡（beta 0.7.0）

- `dysonSphere` 为 T21 科技（pre `superMetal`/`grapheneProcessing`/`nanoAlloy`，1.75M知识），解锁建造态 `dysonSphereSegments`：100段，每段+5电力/s，固定单段造价（cash 1M、adamantite 5000、graphene 2500、nanoAlloy 5000），位于天元六-alpha（`alphaSector`）；完成后替换为 `dysonSphere`（+500电力/s）。2 级由 T22 `dysonSphereII` 解锁 `dysonSphereL2Segments`（每段+7.5，完成后 `dysonSphereL2` 额外+750，与1级合计1250），需要先拥有完整 1 级。
- 量子基础水平为 `log1p(0.1 × 知识上限 / 250000) / log1p(0.1)`；已供能AI超级核心每个+25%、AGI核心组件每个+50%作用于基础值，最终向下截断两位小数，AI II 前为0。
- 量子蜂群：控制站支持保留 `20+量子水平`；每座蜂群工厂降价 `0.1 + 0.01×量子水平`，多工厂复合，卫星总价最低为原价5%。量子制造仅作用于现有工厂产品：毛皮 `max(0, 1+(量子水平-1)×0.125)`，其余工业品 `max(0, 1+(量子水平-1)×0.5)`。
- 队列倒计时（`src/vue/queue-estimates.ts`）用 `CONFIG.uiStepSeconds`（与实时结算步长一致）的产量预览，避免预览步长与实际步长不同导致倒计时快于现实。

### 数字世界（beta 0.6.8）

- aiCoreCalibration需penroseSphere完整100段，2500000知识；实际购买/队列完成产生准确日志并赠1运行gatewayRouter，载入不发奖。binaryWorld需前者，2500000知识+1000bytes。Buildings metadata bandwidth5/use1/bytesCap10000/downloadBoost.1；四建筑id gatewayRouter/downloadExecutable/quantumStorage/downloadCache。
- digital-world纯分配模块由settlement-ledger在电站后预留路由耗电，每座25/s；供电比例决定带宽5倍，消费者按下载→存储→缓存整单位分配。回放只付一次，其他空间支持不能重复使用该电。
- 在纯本地回放资源池拦截知识正向最终入账，按downloadAllocation0～100分流，后续维护只可使用留存知识与已有库存。1000knowledge/s→10bytes/s，结果只乘精通与(1+.1*activecache)；知识自身产出已有倍率不剥离，字节不额外叠粒子/幸福/基因。
- production.digital与supportPreview.digital为UI及容量共享结果；bytes容量10000+10000*受支持量子存储器，无其他储量全局加成。ResourcePanel、价格/储量/收支明细均用B/KB/MB等1000进制，精确值不变。
- schema31兼容归零缺失四建筑的数量/工人/停用、bytes库存/容器记录及downloadAllocation；显式非法不修复，校准已研究却没路由不回填赠品。数字页和滑块旧存档默认未开放/0分流；软重置按原规则清除本周目数字进度。

### AI数据中心与卡尔维拉维护费（beta 0.9.28）

- **数值单一来源** `simulation/ai-data-center.ts`：`calculateAiDataCenterPower`（`25 + 5 × (已建造 − 1)`）、`calculateAiCementBonusPerCenter` / `calculateAiCementMultiplier`、`calculateAiGrapheneBonusPerCenter` / `calculateAiGrapheneMultiplier`、`calculateAdamantiteProcessorBonus`。`getBuildingPowerDemand`、`calculateBuildingInput`、`quantum.ts`、`space-settlement.ts`、`ground-settlement.ts`、`resource-breakdown.ts`、`building-tooltip-rows.ts` 全部调这里，禁止再出现字面量 `25` / `1.75` / `5`。量子水平的 +5% 直接以 `AI_DATA_CENTER_QUANTUM_BONUS × centers` 写在 `quantum.ts` 的倍率里（只此一处，不再单独导出函数）。
- **单座加成是原子量**：`calculateAiCementBonusPerCenter(quantumLevel) = 量子水平 / 1.75 / 100`，倍率函数是 `1 + 运行座数 × 单座加成`。工具提示显示的就是这个单座值（只显示数值，不加 `/座` 后缀、不加第二行解释，见 `AGENTS.md` 第 9 条），所以「界面显示的数 × 座数」永远等于结算用的倍率，不存在界面再写一遍 `/1.75` 的可能。工具提示的 `percent` 实参是 `formatEffectNumber`（四位小数），不是 `vue/format` 的 `percent`（两位小数）——写显示测试时必须照抄组件传入的函数，否则断言值与真实界面不符。
- **电力加价的计数口径是「已建造总数」**，不是「运行中数量」。加价描述的是「多一座中心让每座更耗电」，与供能无关；若按运行数计，缺电时每座耗电会自己降下来，形成「越缺电越省电」的漏洞。
- **量子水平**：`QuantumSnapshot` 新增 `centers`。`level = floor(base × (1 + .25×cores + .05×centers + agi) × 100)/100`。`centers` 直接取 `countRunningBuildings('aiDataCenter')`——电网的 `powerActivationOrder` 结算会把未获供能的单位写入 `stoppedBuildings`，这个计数因此天然等于「已付清维护」，不需要新增快照字段。
- **维护费入账**：AI数据中心、危险物质库都加入 `HYPERSPACE_CONSUMER_IDS`。`space-settlement` 的消费者循环用 `calculateBuildingInput` 读配方（而不是 `BUILDINGS[id].input`），因为 AI数据中心的单座耗电是动态的。`pool-replay` 的对应位置同样改为读 `calculateBuildingInput`，否则重放与结算会各扣一个数。
- **量子水平只解一次**：`calculateProduction` 先算 `calculateQuantumSnapshot`，再把 `quantumLevel` 传给 `replaySettledPool` → `replaySpaceDebits` → `settleSpaceProduction`，以及 `settleGroundProduction`。`buildSettlementLedger` 也把 `quantumLevel` 传给 `settleSpaceProduction`。**`settleSpaceProduction` 内部绝不调用 `calculateQuantumLevel`**：那会经由 `calculateSupportPreview` 递归回自身。
- **危险物质库容量跟随供能**：`StorageSnapshot` 新增可选 `hazardousStorageUnits`，`support-preview` 从 `space.inputs.hazardousMaterialStorage` 填充，`accumulateStorageRows` 用它替代 `state.buildings[id]`。`withStorageSupportFallback` 里提供懒加载兜底，与 `e710WarehouseUnits` 同一模式。
- **工厂生产线**：`calculateFactoryCapacity` 仍按运行中的 `lines` 求和。`assignNewFactoryLines(state, id, added)` 在 `constructBuildingState` 的 **stop 决策之后**调用——先分配会让「起手就停用」的工厂凭空多出一条线，产生 `lines > capacity` 的非法存档。`changeFactoryAssignment` 的可用量 = 空余容量 + （非合金线时）合金线数量。
- **VM 回归**：`scripts/generate-legacy-data.cjs` 的 `ai-data-center` 必须排在 `quantum` 之前，因为这些桥接脚本是靠全局变量互相引用的，顺序错了会得到 `ReferenceError: AI_DATA_CENTER_QUANTUM_BONUS is not defined`。
- **存档**：`aiDataCenter` 加入 `ADDITIVE_BUILDING_IDS`，`CONFIG.version` 不变（仍是 33）——本次只新增建筑计数，没有结构变化。
- **供电开启顺序只记录负载**：`registerBuiltPowerUnits` 在 `getBuildingPowerDemand(id) <= 0` 时直接 return。发电站与 `alwaysRunning` 建筑（恒星熔炉、发电机等）永远不该出现在 `powerActivationOrder` 里，写入一条永不被消费的记录会让顺序大于已建数，下次载入被 `validatePowerActivationOrder` 拒绝。登记前必须用入参 `beforeCompleted` 推建造前运行数：调用方已经抬高 `buildings`，直接读 `countRunningBuildings(state)` 会把新单位重复计入。写入时用「已有条目合计 + 本次启用」替换该建筑的原条目并保持其优先级位置，不要 `push` 新条目。
- **超限顺序在载入时夹取**：`save-compatibility.ts` 的 `clampActivationOrder` 在 `normalizeSchemaSave` 末尾运行，把每条累计超出运行数的部分裁掉（发电建筑整条丢弃）。它只处理格式完好的 `{id, count}` 正整数条目，其余原样透传，让严格校验照常拒绝——否则会把「玩家手改的坏数据」静默修好，破坏 `explicit malformed activation order is rejected` 这组守卫。`CONFIG.version` 不变：这是修复既有数据，不是结构变化。
- **载入失败诊断**：`validateCurrentSave` 用 `check(阶段名, …)` 包裹每步校验，拒绝时把舞台名追加到原消息；`runtime.load()` 的保护模式分支用 `console.warn` 输出 `[存档载入失败] <原因>`。用 `warn` 而非 `error`，因为验收页把每个 `console.error` 记成失败断言。

### 成本与库存格式（beta 0.6.7）

危险物质库cost增加cash2000000/alloy50000，与已有adamantite10000/nanoAlloy10000均使用1.265递增。formatCostNumber用于悬停费用、建筑成本及ARPA工程投入/需求，formatResourceNumber用于库存/储量，两者达到1000就切换下一SI单位；formatRateNumber/formatEffectNumber保持原10000阈值。只影响显示，实际计费与库存精度不变，无存档字段变化且升级兼容逻辑保留。

### 同分支存档兼容政策（beta 0.6.6）

今后默认兼容现有支持分支的旧版本存档，除非用户明确要求不兼容。新注册项必须提供精确升级默认值及上一版JSON载入/导入/往返测试，不得靠调整新状态测试掩盖真实升级问题。schema12～30维持此前明确退役政策。

本次针对schema31缺失的hazardousMaterialStorage建筑/工人/停用计数补0，不覆盖已有值或掩盖畸形数据，不修改原始输入。存档对已研究ripperOverclock不再追溯要求完成撕裂者；新研究仍按100段门槛，旧科技前置链验证保留。保护模式原档可在更新后重载或重新导入恢复，无需硬重置。历史排队中的撕裂者超频允许载入（其他科技前置照常校验）；若未满足新100段门槛，后续按原队列规则取消，不扣资源，完成条件后可重新入队。

### 危险物质库与精金平衡（beta 0.6.5）

hazardousMaterialStorage为T21/pre stellarForge/knowledgeCost1750000+nanoAlloy25000；建筑在卡尔维拉，neutronStar任务完成后可见，cost adamantite10000+nanoAlloy10000，scale1.265，storage e710500/neutron32000。asteroidBase新增helium34000/neutron8000，使用原有实际供电支持份额并享受higherDimensionalStorage双倍。

adamantiteMiningShip基础.25/s，adamantiteProcessor显示名精金精炼站，本地倍率每座实际运行站+.2；保留旧ID。ripperOverclock解锁与存档校验要求spaceRipper100段。format共享公制单位以当前单位超过10000才晋级，顺序k/M/G/T/P/E/Z/Y/R/Q，库存仍截断不虚增，速率和效果按各自精度显示。dimensionCompression说明改用格纳库。

### 成就等级与精通（beta 0.6.4）

- achievementLevels可选稀疏映射，键必须为已完成成就、值为整数0～3。未分级的当前schema31成就按0级计算，未完成成就不产生精通；旧schema12～30仍拒绝，其他必填字段规则不变。
- awardAchievement只保存最高等级，等级取完成时challenge.genes数并封顶3；快照类必须false→true再次完成，重置事件以重置前挑战状态授予。各普通/威望重置保留并结算最后快照，硬重置清空，来源状态不被修改。
- 精通=sum((最高等级+1)*0.0025)，不是每级累加；与粒子等倍率独立相乘。calculateGlobalOutputMultiplier汇合粒子与精通，普通/工厂/太空产出、税收副产物以及手动和工匠锻造均在产出入口应用一次，电力排除，投入成本不变。收支明细单列精通。
- 特权列表始终展示精通总量；成就perk可为字符串或(level)=>string，只使用最高等级一次。本次现有成就没有新设专属特权。

### 幸福度详情（beta 0.6.3）

calculateMorale.raw为max(0,各项幸福度贡献之和)，无上限；happiness仍为max(40,min(cap,raw))，结算使用happiness因此不改变已有生产效果。TooltipPanel采用独立morale-columns：左列有效/实际/上限，右列有符号贡献，广播塔与观光站分开，不含容量来源或供能比例独立行。沿用实际供能预览，窄屏回退单列。

### 幸福度产量倍率（beta 0.7.7）

`calculateHappinessMultiplier(happiness)`（`src/simulation/multipliers.ts`）是幸福度对全局产量的唯一换算点：低于100%时仍为`happiness / 100`（每点−1%），**超出100%的部分每点只提供+0.5%**（150%→×1.25、200%→×1.5），即`1 + (happiness − 100) × .005`。`calculateProductionMultiplier`改用它，因此地面、工厂、太空、文化与数字世界产出自动一致；电力与锻造物不应用该倍率。`resource-breakdown.ts`的「幸福度」因子行、资源明细备注同一函数取值，避免显示与结算漂移。

### 人口基础增长（beta 0.6.2）

CONFIG.populationGrowthRate=1.5，统一calculateGrowthMultiplier返回基础1.5乘原有科技/社区中心/CRISPR/基因倍率，推进与界面ETA使用同一值。抽样目标5–10/10–20及存档进度单位不变，无需迁移；无其他加成时实际等待约3.33–6.67秒/6.67–13.33秒，食物与住房条件不变。

### 保护模式原档导出

- Runtime.exportProtectedSave仅在saveBlocked时可用。载入校验失败缓存原始字符串，不解析、格式化或迁移；原始读取失败时，导出操作可重试读取同一localStorage键。读取仍失败则报错，不能以临时新游戏冒充原档。
- 设置按钮输出至现有文本框供复制备份，普通模式禁用。导出不改变存档、游戏状态或保护标记；硬重置成功后按钮禁用。浏览器验收覆盖旧档逐字保留与重置后的状态。

### 合金工具与硅酸盐水泥（beta 0.6.1）

- alloyDrill/alloyChainsaw为T8，显式knowledgeCost44000避免时代价格初始化覆盖；cost为44000知识+500合金，pre automation且resourceRequired alloy，使用统一资源解锁判断。
- calculateToolMultiplier对quarry/mine/coalMine优先返回合金钻头2倍，对lumber优先返回链锯2倍；覆盖钢铁1.5/铁质1.25，不改变农民倍率。沿用统一基础工具倍率链，实际结算及明细一致。
- silicateCement为T5，pre metallurgy+cement，knowledgeCost5000、stone1000；calculateRawBuildingOutput将水泥工人基础cement乘1.5，input不变，后续基因/工坊/电力搅拌等倍率保持原顺序。schema31不变，无存档迁移。

### 电力储量与电池聚能环

- 电力注册基础容量10000；`batteryConcentrationRing`（T8，电子学前置，42114.514知识）在共享baseStorage中增加90000，明细和批量总量一致。
- `calculateStorageBonuses`：太阳能卫星每座500电力容量；储能站研究前1000、研究后5000（替换而非叠加）。发电产量及现有全局储量倍率不变；当前存档按科技和建筑即时重算。

### 智能银行与中子库储量规则

- `intelligentBankingSystem`（T16）只前置AI II；`neutronVault`（T14）只前置中子建筑材料，复用注册表解锁/购买/存档校验，存档版本为31。
- 银行/芯片工厂贡献=`(原基础+已有固定加成+中子库2000/3000) × 原百分比因子 × 智能银行2`；人口资金贡献独立按智能银行1000、储蓄债券500、股票交易250的最高优先级取一项，再统一参与证券交易所等后续资金倍率。
- 格纳库普通/合金箱容量共享containers模块动态计算，中子库为40/25；合金箱仍受superContainers门槛。总量与建筑tooltip使用相同函数。

### beta 0.5.6 审计修复约束

- 广播塔/观光空间站幸福度使用结算回放得到的付费运行单位，不能用拥有量替代；太空驻军区分拥有容量（现有士兵保留）和运行训练容量（受维护/停机影响）。
- 士兵上限（beta 0.9.6）：`calculateArmyLimit` = 运行军营×2 + 运行太空驻军×2 + 运行世界模拟器×4，只看 `stoppedBuildings`，不看付费；`clampSoldiersToArmyLimit` 在关停军营、每个 tick、载入/导入存档三处削顶并清零训练进度。`calculateOperationalSoldierCapacity` 在上限基础上再按付费单位取更小值，只影响训练增员，绝不用于删兵——否则一次缺油会清空军队。
- 建造与科研仍是独立队列；ARPA遵守有序建造队列前置，所有建造项目复用同一容量规则。重复建筑的乱序结算仍优先低序号，报价递增无需改变。
- `lastSaved`只作元数据，未来时间钳制至当前时间，写盘失败回滚；不执行迁移或缺字段补全。过时的Asriel排队布尔标志不再阻止任务，实际队列为准。
- 保留按钮统一主题文字色，用背景/边框区分禁用、危险与选中态；可用性不能只靠颜色表达。日志列表使用仅UI层稳定对象键，不扩展存档格式。
- `BUILDING_CASH_COSTS`/`BUILDING_COST_SCALES`从建筑主数据派生，避免新建筑漏入兼容表；成本按每建筑每资源系数计算，无全局备用系数。

### 日志分类与核心副标题

- `LogType` 新增 `queue`，建筑/科研/ARPA队列完成日志使用该类型。普通事件继续使用 `event`，里程碑、AI启动、黑洞进展与飞船部件完成使用 `progress`，成就使用 `achievement`，存档等诊断保留 `system`。不再为旧存档转换日志类别。
- 日志正文14px、行高1.6，时间12px；队列灰蓝、普通事件暖黄、进度浅蓝、成就浅绿、系统浅红，筛选同步这些类别。
- `TooltipPanel.vue` 的AI超级核心描述首行增加 `world.exection(cat);`。分段进度与维护行由 `building-tooltip-rows.ts` 从**建造态记录**（`buildings.aiSupercoreSegments`）读取；完成态条目没有 `segmentedRequired`，因此 `TooltipPanel` 不再从完成态条目拼装这些行（否则会渲染出 `NaN /undefined`）。

### 队列悬停递增价格

- `TooltipPanel.vue` 根据悬停元素的稳定 `queueUid` 从 `describeQueuedPurchases(state)` 读取建筑预测价格，与队列时间预估共用顺序累计结果；普通建筑按已建数量+前序同类数量计算成本蠕变，不受其他建筑插队影响。
- 每次revision重新计算，因此取消中间项目后后续同类价格自动前移；显示序号仍使用当前队列下标+1，uid只作身份标识而不当作序号。分段项目保持剩余分段总需求展示，并用单段价格判断储量是否不足。

### 七项成就与周目追踪

- 成就字典替换为核爆、ESS逃逸、飞船完成、4096蜂群卫星、实际启动AI核心、OC-13研究和黑洞重置七项；描述包含破折号后的条件，`AchievementsPanel.vue` 默认全部，可切换未完成/已完成，选中边框为绿色。
- 周目 `achievementTracking` 记录四项状态条件上次布尔值，只在false→true时授予（飞船完成、卫星数量、核心启动、科技）。当前 schema 必须提供完整追踪记录；不再推断历史基线、清理旧成就或补发历史成就。未知或退役成就ID拒绝。
- `updateProgression` 返回新增状态成就，由runtime/App统一记录成就日志；核爆/逃逸/黑洞成就在成功重置的next状态直接授予并记录，不变更源状态。逃逸在清空周目前捕获尚未扫描的飞船等成就，避免立即发射丢失完成成就。
- 普通重置保留已获成就，追踪基线随新周目重新置false，硬重置全部清空。历史重置次数不触发新事件成就。

### 自动化脚本（beta 0.9.48）

- 分层：`data/automation.ts` 只放注册表（`AUTOMATION_SECTIONS` / `AUTOMATION_OPTIONS` / `CONDITION_SOURCES` / `TRIGGER_ACTION_OPTIONS`），`state/automation-storage.ts` 管独立持久化，`simulation/automation/*` 管求值与执行，`vue/components/AutomationPanel.vue` 只管界面。新增一个开关只需要改注册表，再在对应模块里读它。
- 配置**不进 `GameState`**，`CONFIG.version` 保持不变。存储键 `meow-civilization-automation-v1`，版本 `AUTOMATION_CONFIG_VERSION = 1`。归一化规则与存档一致：缺失键补默认值，显式非法值整份拒绝（`normalizeAutomationConfig` 返回 `null`），`parseAutomationConfig` 在任何异常下回退默认值并返回 `restored: true`。
- 控件类型：`AutomationOption.kind` 是 `toggle | number | string | select | list` 之一。`select` 必带 `choices`，`list` 必带 `listSource()`（返回 `{id,label}[]`）。**列表的来源必须是真实注册表**（`FACTORY_OPTIONS`、`CRAFT_RECIPES`、`BUILDINGS` 等），写死猜测的 id 会得到一个永远读不到值的下拉项。
- 条件 DSL 用**固定读取器表**代替 `eval`：`readConditionSource(context, source, arg)` 覆盖六十五种来源，未知来源或非法参数返回 `undefined` → 条件判否。运算符十八种：`== != === !== > < >= <=` 比较、`&& || NAND NOR XOR XNOR AND! OR!` 组合、`A?B` 与 `!A?B` 带输出值（`OUTPUT_OPERATORS` 里的两个走"条件成立则输出右值"分支，不参与布尔比较）。导入别人的配置不可能带入可执行内容。
- 参数化来源的校验要看**拆分后**的段：`buildingCost` 的参数是 `building.resource`，拿整串 `nest.wood` 去查注册表永远查不到（真实踩过）。
- 覆盖表：`config.overrides[optionKey]` 自上而下、首个成立的行决定本次运行该选项的取值，`resolveAutomation` 同时返回 `overridden` 集合供界面高亮。**标量覆盖命中即 `break`，列表型覆盖按追加合并**（对齐参考脚本的 XOR 累积语义）。覆盖只改脚本选项，不改游戏状态；类型不符的行被忽略。
- 覆盖表：`config.overrides[optionKey]` 自上而下、首个成立的行决定本次运行该选项的取值，`resolveAutomation` 同时返回 `overridden` 集合供界面高亮。覆盖只改脚本选项，不改游戏状态；类型不符的行被忽略。
- 排序与权重集中在 `simulation/automation/weighting.ts`（`rankBuildTargets` / `rankResearchTargets` / `buildAnchor` / `nextAutomationMission` / `buildWeight`），`planning.ts` 只是它的稳定转出入口。`buildWeight = 基础权重 × 命中的每条权重倍率`，倍率为 0 的目标从候选里直接淘汰。
- 权重规则的目标分类**必须靠试算**：仓库这类建筑的储量上限贡献来自 `storage.ts` 的建筑表，注册表条目本身没有 `*Cap` 字段，按字段判断会让"储量告急"规则对仓库完全无效。`storageGains()` 用"多一座该建筑上限有没有变"来判断，并按 `(建筑, 当前数量)` 缓存——不缓存时单个 tick 要做数百次全量 `calculateStorageTotals`。
- 引擎 `createAutomationEngine({ config, random })`：`tick(state)` 先解析覆盖，再过主开关与 `safeMode` 闸门，然后按 `tickInterval` 计数放行，最后依次执行 `runFrontier → applyAutoWorkers → enqueueAnchor → runTriggers → applyAutoResearch → applyAutoBuild → applyAutoCraft → applyAutoPower`。全程 try，异常记成 `fault` 返回而不抛出；`safeMode` 下带 `fault` 时下一 tick 执行零动作，`clearFault()` 恢复。`options.config()` 本身也在 try 内。
- 接入点：`TickHooks.afterRun?`，在 `advanceGameTick` 的 `hooks.purchases()` / `hooks.unlocks()` 之后调用，因此脚本看到的是整帧结算后的状态，它下的购买单在下一 tick 结算。`runtime.ts` 里通过 `afterRun` 调引擎，`automationReport` 暴露最近一次运行结果给面板显示 `fault`。
- 运行时惰性读取自动化存储：`createRuntime()` 不碰 localStorage（保持"加载存档只读一次"的断言），第一次访问 `runtime.automation` 或第一次 tick 时才读。`createRuntime(initialAutomation?)` 供测试注入。
- 执行只用既有命令函数（`requestPurchaseModule` / `queuePurchase` / `removeQueuedPurchase` / `researchTechnologyNow` / `changeWorkerAssignment` / `changeFactoryAssignment` / `investInProject` / `setBuildingPowerEnabled`），不复制任何结算逻辑。
- 上限与开关必须覆盖**所有**建造路径：`buildingMaxPerType` 只约束 `applyAutoBuild` 时，住房补建（`runFrontier`）能绕过它（实测 nest 从 5 涨到 6）；`autoBuildHousing` 关闭时，住房仍会被 `applyAutoBuild` 顺带选中。两处现在都受约束。
- 长期推进的四道保险（详见 `docs/notes/pitfalls.md` 59–63）：食物安全看**产量方向**而非库存；容量小的岗位走显式 `moveWorkerTo` 调人；`buildAnchor` 用 `isReachable` 跳过超出仓库上限且无正产量的目标；`enqueueAnchor` 在队列满时清掉已拥有建筑的加建单。

### 工作自动分配

- 周目字段 `autoWorkers` 保存总开关、岗位优先级和各岗位开关/人数上限（-1不限）。新游戏默认全部关闭，当前存档须提供完整配置；周目重置清空设置。
- `simulation/auto-workers.ts` 使用规范有限岗位列表，复用 `calculateWorkerCapacity`，按优先级仅填充空闲人口，受实际岗位容量及自动人数上限共同限制；无限岗位不参与，不撤回或挪用已有工作猫。手动分配不受自动人数上限约束。
- tick开始、生产结算前自动补员，tick末尾再处理新增人口与新建岗位。暂停游戏时不执行tick分配。UI修改配置后立即尝试补员，总开关关闭时停止并隐藏设置。
- `CatsPanel.vue` 在原手动按钮右侧以竖线分隔自动开关与上限，右侧优先级列表支持HTML拖拽：本地 `dragPriority` 实时预览顺序，`TransitionGroup` 提供160ms位移动画；松手一次性提交完整优先级，取消拖拽恢复原序，不在悬停中触发补员。自动按钮固定显示「自动分配」，开启边框与设置页一致为 `#63b875`；尊重减少动态效果偏好。`App.vue` 通过模拟层命令更新配置。

### 基因修饰布局与新增基因

- `GeneModificationPanel.vue` 每个碱基分组使用独立的4列 `.gene-grid`，不同类型不共享一行。面板宽度低于520px时通过容器查询降为2列（依据面板自身宽度，而非视口）。
- 成熟加速（C，1%/级）乘入 `calculateGrowthMultiplier`。超频锻造（G）主加成2%/级经 `calculateOverclockCraftMultiplier` 乘入 `calculateCraftingMultiplier`（手动锻造与工匠共享）；`GeneDefinition.extra` 的1%/级只乘入工匠产出倍率，不改原料倍率。资源详情列出「超频锻造」与「超频锻造（工匠）」两行。

### 超级集装箱与合金集装箱

- `superContainers`：T8，51400知识，前置 `automatedStorage`。研究后 `calculateBuildingContainerCap` 将集装仓库普通上限改为25；`calculateBuildingAlloyContainerCap` 为集装仓库/格纳库分别返回10/15（均需科技），格纳库普通上限仍为30。
- 新增周目字段 `alloyContainers` 与完整资源记录 `alloyContainerAssignments`。当前存档必须提供完整记录，缺失字段、非法值、超额数量/分配、不可分配资源均拒绝；存档版本为31。
- 合金箱每个10合金，单箱储量=`calculateContainerUnitCapacity ×4`，因此钢/强化/铱合金集装箱升级即时影响所有已分配合金箱。`storage.ts` 的明细与批量上限路径均累加两种箱子，明细独列「合金集装箱」。
- UI在普通列表右侧使用独立同样式列，窄屏横向滚动；制造、分配及撤回沿用普通箱快捷键，撤回立即执行储量截断。软/核爆/逃逸重置通过初始状态清空箱子及分配。

### 原油精炼优化

- 科技 `crudeOilRefiningOptimization`（tier 9，70k知识，`pre: ['chemicalDeposition', 'oilStorage']`）。`calculateRawBuildingOutput('refinery')` 返回 `{ oil: 1.5 }`，`calculateBuildingInput('refinery')` 返回 `{ energy: 2 }`；地面结算按该配方计算缺电开工比例，建筑悬停显示同一配方。

### 基因合成

- 科技 `geneSynthesis`（tier 11，200k知识，`pre: ['genetics']`，`arpaPre: 'geneSequencing'`）。`isGeneSynthesisUnlocked` 另需基因修饰已解锁（基因剪切+本周目基因测序）。
- 速率存于 `geneModification.synthesis`（每碱基0–100整数百分比，互相独立，随周目重置）。当前存档必须提供该字段；DNA数量放宽为非负有限数以容纳小数产出。
- `settleGeneSynthesis` 在 `calculateProduction` 中位于全部产出之后、质量喷射之前，按供电生物实验室数（`biologyUnits`）扣除知识：每座每1%为2000知识/s→0.01碱基/s；知识不足时所有碱基按同一比例缩减。`applyGeneSynthesis` 在tick中把产出计入DNA并记入知识消耗统计。知识详情显示「基因合成消耗」行。
- **CRISPR 高级基因合成**（`advancedGeneSynthesis`）把「同一份知识换到的碱基」翻倍，但**知识消耗本身不变**。实现要点：
  - `GeneSynthesisResult.knowledge` 必须在代理的 set 陷阱里累加**真实被分流的知识**（`diverted += gained * share`），**不能**从 DNA 数量 × `DNA_KNOWLEDGE_COST` 反推——DNA 带上翻倍倍率后，反推会把消耗也一起放大，进而污染 `statistics.run.knowledgeSpent` 并虚高威望奖励。
  - 「知识 → 碱基」的换算统一走 `calculateSynthesisedDna(state, knowledgePerSecond, rate)`，结算与 `GeneSynthesisModal.vue` 的预览共用，避免一处记得倍率一处漏掉。
- UI：`BuildingsPanel.vue` 的生物科学实验室齿轮按钮打开 `GeneSynthesisModal.vue`，滑块交互同税率。

### 统计-特权页

- `src/simulation/perks.ts` 的 `listActivePerks` 只读汇总已拥有的CRISPR升级与带 `perk` 字段的已达成成就。材料与空间推理两条覆盖链只显示最高已购级，并附当前实际数值（成本递增减免、粒子/卡西米尔储量加成）；其余升级显示描述。
- `AchievementDefinition.perk` 为可选文本，现有成就均未定义，因此成就部分暂为空；以后给成就加 `perk` 即自动出现在 `PerksPanel.vue`。

### 电化学熔炼

- `calculateBuildingInput('smelter', state)` 不因电化学熔炼添加电力维护；该科技仅使钢基础产能由0.5/s变为1/s，保留后续冶炼倍率及原料消耗。输入详情与实际结算共享配方。

### 资源显示精度

- `src/shared/format.ts` 的 `formatResourceNumber` 专供资源库存与上限：显示最多2位小数（缩写单位同样适用），去除尾零和负零；使用 `floorWithPrecision` 修正二进制机器尾差而不虚增真实库存。
- `signedRate` 改用独立的 `formatRateNumber`：净产量和收支明细统一舍入至两位小数，消除库存相减尾差导致20/19.99跳变；库存及容量仍向下截断。普通价格、人口计数等仍用原 `formatNumber`，黑洞质量保留8位。
- 显示精度不写回模拟或存档，资源结算保留完整精度，避免小额产出逐tick丢失。

### 政府改革效果预览

- `InternalPanel.vue` 的体制候选按钮使用 `data-tip-kind="government"`，`TooltipPanel.vue` 注册同类型并直接显示 `GOVERNMENTS` 中的名称与描述，支持悬停、聚焦及Escape关闭。

### 电力收支详情布局

- `TooltipPanel.vue` 仅在电力的消耗明细超过15项时启用 `energy-expense-split`，消耗使用CSS双列布局（条目内部不跨列），并加宽tooltip。15项及以下、其他资源维持原布局。

### 资源管理布局

- 集装箱子页解锁条件为 `calculateContainerCapacity(state) > 0 || state.containers > 0`，允许制造首个集装箱。资源管理入口在集装箱或质量喷射任一可用时显示，条件消失回退世界。ARPA建筑子页检查 `tech.includes('arpa')`，未解锁时回退其他可用ARPA子页。

### 芯片工厂的基础产量科技（beta 0.9.35）

- 建筑 ID 仍是 `catCafe`（存档字段名，改名会断档），显示名改为「芯片工厂」，`desc` 为 flavor 字段（`BuildingDefinition.desc` 本来就是可选）。
- 两个科技：`masterpieceCat`（多重曝光技术，T10，`pre: ['arpa']`，×1.2）与 `radiationHardenedChip`（抗辐射芯片，T12，`pre: []` + `resourceRequired: 'iridium'`，×1.25）。
- **唯一来源**：`simulation/chip-factory.ts` 的 `chipFactoryOutputMultiplier(state)`。改动前 ×1.2 散落在三处（`ground-settlement.ts` 结算、`resource-breakdown.ts` 的 `sourceValue` 反推、同文件 `pct` 明细行），现在全部改为调用该函数。两个系数**相乘**：同时研究是 1.5，不是 1.45。
- **不在明细里单列**：`calculateResourceFactorRows` 里没有 `pct('多重曝光技术', ...)`，但 `local *= chipFactoryOutputMultiplier(state)` 必须保留——`local` 参与 `expected` 自检，删掉会让明细与结算分叉。
- 新增 `TechnologyId` 必须同时登记 `vue/tech-categories.ts` 的分类表，漏了会直接编译失败（`Record<TechnologyId, TechCategory>`），这是有意的强制约束。

### 新增科技时必须同步的排除列表（beta 0.9.41 起）

多个测试用「把所有科技塞进存档」构造满科技状态，写法是手工排除列表。新科技如果不在列表里，且它有前置关系，这些用例会整批报「科技前置关系无效。（解锁记录）」。新增科技时同步这 8 处：

- TS：`tests/hyperspace-energy.test.ts`、`tests/outer-space.test.ts`、`tests/retired-interstellar.test.ts`、`tests/retired-tianxing.test.ts`、`tests/stage-three.test.ts`（两处）、`tests/hyperspace-services.test.ts`
- 经典 VM（双引号风格）：`tests/test-asriel-core.cjs`、`tests/test-moon.cjs`

### 建筑效果行的两个来源（beta 0.9.40）

改一座建筑的说明前，先判断它属于哪一类：

- **`data/buildings.ts` 的 `effectRows`**：名称与值都是字面量的固定行，连同 `note`（行下方的小字）、`negative`、`effectType`、`requiresTech`。这是 0.9.40 起的默认位置——**想改文案先在这里找**。
- **`vue/building-tooltip-rows.ts`**：需要读取 `state.tech`、快照或调用 `calculate*` 才能得出数值的行。它们是逻辑，**不要**搬进 `data/`，否则数据层会依赖模拟层。

约束与陷阱：

- `effectRows` 的值必须是纯字符串。测试会拒绝含 `${`、`=>`、`return` 的值。
- 迁移行时**必须同步删除 builder 里的旧 `add(...)`**，否则同一行会渲染两次（0.9.40 实际发生过）。测试会用「同名同值的 `add(` 不得出现在 builder 里」来兜底。
- **行顺序没有默认保证**：`addDeclared()` 在 builder 里被显式放在不同位置，因为各建筑的声明行原本夹在派生行中间。调整时如果要改某座建筑的行序，先确认它是否用了特殊位置（函数顶部注释列了 `agiCoreComponent`、`asteroidBase`、`metalRefinery`、`aiSupercore`、`softRouterNode` 五处）。
- 改动后**不要只跑测试**：把 132 座建筑的效果行 dump 成 JSON 对比重构前的输出，逐行 diff 到 0 差异，才能确认顺序没变。

### 质量喷射的质量表与列表（beta 0.9.36）

- 唯一来源是 `simulation/black-hole.ts` 的 `EJECTION_MASSES`（普通物质）与 `EXOTIC_EJECTION_MASSES`（奇异物质），`ejectionMass(id)` 依次查两者。
- 0.9.36 重定了整张表：玩家指定 `e710` 1e-5、`nanoAlloy` 2e-7、`neutron` 4e-5、`adamantite` 1e-5、`aerogel` 1e-7；`deuterium`/`helium3` 保持原值（2e-8 / 3e-8），仍是最轻的两项。其余按原子量/分子量排布，整体较 0.9.35 上调 20%~50%。
- **`nanoAlloy` 2e-7 刻意很轻**（轻于水、铝、木材，列表第 8 位）。这是玩家确认的指定值，写断言时不要假设「奇异物质必然最重」。
- **连带影响**：`stabilizeBlackHole` 里赠送的质量是 `BLACK_HOLE_STABILIZE_NEUTRONS * ejectionMass('neutron')`，即 100000 × 4e-5 = **+4**（此前为 +1）。改中子质量就会连带改这里，不需要额外改代码。
- **列表排序**：`ResourceManagementPanel.vue` 的 `ejectionRows` 按 `mass` 升序，等质量时用 `localeCompare(..., 'zh-Hans-CN')` 二次排序保证稳定。
- **标红**：`<h3 class="management-name" :class="{ exotic: row.exotic }">`，样式取自 `var(--red)`；`row.exotic` 来自 `isExoticResource(id)`，与「每单位奇异质量」文案同一个判断。

### 左右两列的固定与高度（beta 0.9.33）

- 左栏 `.col-left.pinned-column` 与右栏 `.col-right.pinned-column` 用同一套做法：`position:sticky; top:0` + `display:flex; flex-direction:column`，列内滚动区吸收剩余高度。
- **右栏高度不能用 `100vh`**：它在页面上并不从视口顶端开始，上方还有 topbar 与标签栏。写 `100vh` 会让底边超出视口同样的距离（日志区底部余量实测 -28px）。正确写法是 `height:calc(100vh - var(--pinned-top-offset))`。
- 偏移量由 `src/vue/pinned-column-offset.ts` 的 `usePinnedColumnOffset(ref)` 实测写入：读列在文档坐标中的顶部位置（`rect.top + scrollY`），设为元素自身的 `--pinned-top-offset`，并在 `resize` 时用 `requestAnimationFrame` 去抖重算。**不要改回硬编码的 `36px`**——它随视口宽度、topbar 换行和浏览器缩放变化。
- 右栏内部：队列面板保持自然高度，日志面板 `.logs-panel` 是 `flex:1 1 auto; min-height:0`，`.logs` 是 `flex:1 1 auto; height:auto`。滚动仍在 `.logs` 内部（`overflow-y:auto` 未变）。
- 窄屏（`max-width:860px`）不参与这套规则，`.logs{height:250px}` 保持不变。
- 验收：无头浏览器默认视口只有 756px 宽，走窄屏分支，**宽屏规则测不到**。用 `ACCEPTANCE_WINDOW="1440,900" npm run test:browser` 才会覆盖宽屏断言；不设该变量时行为与历史一致。

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
"noUnusedLocals": true,
"noUnusedParameters": true,
"isolatedModules": true,
"verbatimModuleSyntax": true
```

- Vue 模板严格检查：`vueCompilerOptions.strictTemplates: true`。
- 合法 `data-*` 属性通过窄类型声明 `src/vue/html-attributes.d.ts` 支持（HTML/SVG），不开放任意未知属性。
- 脚本工具链由 `tsconfig.scripts.json` 覆盖（`types: ["node"]`，`skipLibCheck: false`）。
- **禁止**通过关闭检查、批量 `!`、`as any`、"禁用规则" 压掉诊断；用存在性守卫与类型收窄修复。
- **未使用检查（beta 0.9.32 起）**：`noUnusedLocals` / `noUnusedParameters` 在清掉全部 49 条历史遗留后开启。签名要求但当前不读的参数一律改名加 `_` 前缀（如 `_waystations`、`_metalCapacity`），不要靠删除参数改动调用方，也不要留着未使用变量。
- **唯一豁免：Vue 模板 ref**。`<script setup>` 里为 `ref="x"` 准备的变量 TypeScript 看不见模板中的使用，会被误报。做法是保留变量、加 `void x;` 显式读取并注释说明（现有唯一一例是 `App.vue` 的 `leftScrollContainer`，它是 `useIsolatedScroll` 接管左栏滚动的挂载点，删了滚动隔离就失效）。

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
5. `settleE710WarehousePower` → `settleResearchAndCulture`（生物/数据中心/实验室/广播/观光）。实验室仅在已研究「电力」后计入固定电力链，每座请求2电力，排在数据中心之后。**供电只是容量升级**：`labUnits` 只统计获得供电的座数，用于把每座知识容量从 1000 提升到 2000（覆盖未供电的基础值）；`inputUnits.lab` 始终为运行中的实验室总数，未供电的实验室照常保留猫猫科学家岗位与产出。`PowerGrid` 中实验室属于 `POWER_DEMAND_ONLY_IDS`：供电不足只写入 `failed`（黄色标记），不会写入有效 `stoppedBuildings`。
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
- 采矿船操作员（beta 0.7.6）：`src/simulation/ship-crew.ts` 以 `SHIP_CREW_SIZE`（铱/铁 1、E-710 2）与 `SHIP_CREW_IDS` 顺序推导配员；`allocateShipCrew(state)` 只读地按「总猫口 − `countUsedWorkers`」分配，返回 `working/operators/required/shortfall`。`space-settlement.ts` 的矿区船循环用 `working` 替代 `buildings − stoppedBuildings`，因此停机船不再扣维护、也不再产出；`support-preview.ts` 同时暴露 `shipCrew` 供界面读取，`pool-replay.ts` 沿用同一 `space.inputs`，无需另行改动。该岗位不写入 `state.workers`（存档字段与 schema31 不变），`countSparePopulation` 用于自动分配避免抢走操作员。
- 猫猫社区移除直接普通资源+25%，人口增长乘1.10；其他原有幸福度与食物需求规则保持。

- 超空间视图解锁：`isHyperspaceUnlocked`=`tech.includes('anomalyMapping')`，异常区域测绘只需全域观测校准，研究后立即显示世界导航及超空间分组。场约束理论直接前置异常区域测绘；深空干涉阵列、异常区探测任务、异常响应实验科技与深空实验平台移除。整块异常研究面板及信号/转移/远端实验也已移除，双端场耦合、有限孔径稳定、异常拓扑测绘科技与远端锚点工程退役。短程通信节点、锚点货运站、民用航线站直接用场约束理论解锁并参加运行，接入点信标/维度信标投放的前置也改为场约束理论。稳定度仍按设施正常分配、维护与停机；`stageThree`只保留`coreActivated`。不再清理旧档退役科技/工程/队列/标志；旧 schema 或退役内容均拒绝；剧情章节ID保留并按剩余科技与建设里程碑改写。`App.vue`在超空间锁定时仍回落到地面。

### 3.4c 破维先锋与高维存储
- 科技：高科技工厂T18（800k，前置高科技农场平台）；破维先锋T19（1M，前置超空间采矿探查+气体云吸积）；高维存储T19（1M，前置破维先锋，且`isBuildingFullyBuilt('spaceRipper')`，存档校验同样要求）。
- 分段建筑统一规则：`calculateBuildingCost`对任何`segmentedRequired`建筑直接返回注册表价格，`calculateDynamicCreep`对其返回空列表。
- **beta 0.9.7 起分段建筑拆为两个注册表条目**（schema 32）：建造态 `*Segments`（`segmentedRequired: 100` + `completesInto` + 成本）；完成态沿用旧 ID（`cost: {}`、`buildable: false`、`max: 1`），`buildings[完成态]` 计座数。`constructBuildingState` 在段数达 100 时 `-= 100` 并 `+1` 完成态，同时 `registerBuiltPowerUnits` 与（AGI 飞升核心）默认停用。`housing.ts`/`power-grid.ts` 不再按段折算完整单位，撤销了 `segmentEffects` 的折算分支（该标记现在只表示"每段提供部分产能"，仅戴森球/彭罗斯球与 2 级戴森球使用）。`normalizeSchemaSave` 负责 31→32 的段数拆分。
- **命名（beta 0.9.9）**：两条注册表记录共用同一个 `name`，建造态不再带「（建造中）」后缀。区分只靠行内计数（建造行 0～100 段、完成行按座）、`buildable: false` 与开关按钮，任何 UI/文案都不得再用后缀区分；`tests/segmented-naming.test.ts` 守住同名、无后缀、无 `NaN/undefined` 三条不变量。
- **一次性工程（beta 0.9.10，schema 33）**：完成态条目一律带 `max: 1`，`isConstructionBlocked(建造态)` 因此在完成态存在时恒为 true，`isPurchaseAllowed`/`buyBuildingNow`/`buyBuildingsInBatch`/`requestPurchaseModule`/`queuePurchase` 全部自动拒绝。面板用 `src/vue/construction-rows.ts` 的 `withConstructionPhases` 统一插入并过滤建造态行（`BuildingsPanel` 与 `DigitalWorldPanel` 共用，后者此前缺少建造态行）。`save-compatibility.ts` 的 `upgradeSchema32To33` 把完成态夹到 1、建造态计数清零、清理 `stoppedBuildings`/`workers` 的建造态记录与指向它的 `queue` 条目，**未建成工程的段数原样保留**；归一化链为 `upgradeSchema31To32 → upgradeSchema32To33 → normalizeAdditiveDefaults`。`tests/segmented-one-off.test.ts` 守住这组不变量。
- **世界统一储量加成改为强化具体建筑（beta 0.9.31）**：删除 `UNIFICATION_STORAGE_BONUS`、`unificationStorageMultiplier`、`storage.ts` 的 `pushUnificationRow`（detail 与 batched 两条路径都删）。原「所有普通资源 +25%」是整条资源的乘数，免费抬高每种上限，让建存储建筑失去意义。新规则落在 `simulation/unification-storage.ts`（**唯一来源**）：`unificationContainerSlots`、`unificationAlloyContainerSlots`、`unificationStorageMultiplierFor(id, state)`、`unificationFuelMultiplier`、`unificationCashMultiplier`。之所以单独成模块，是因为这些规则横跨两个采集点——`containers.ts` 算集装箱槽位、`storage-bonuses.ts` 算每建筑容量，分散写必然两边分叉。槽位在 `calculateBuildingContainerCap` 里于 `超级集装箱`/`中子库` 调整后的值上 `+10`，合金在 `calculateBuildingAlloyContainerCap` 的 `超级集装箱` 分支内 `+5`（没有该科技时合金集装箱本就不存在）。容量侧：`格纳库`/`仓库`/`高级存储枢纽` 整份贡献 `×2`（与 `warehouseUpgrade`、`iridiumAlloyWarehouse`、`intelligentStorage` 叠乘）；`燃料库`/`轨道燃料库`/`星系燃料库` 的 石油/氦-3/铀 `×1.5`（用户所说的「推进剂库」在数据中不存在，确认指 `orbitalFuelDepot`）；`银行`/`芯片工厂` 的 cash `×1.25`（在 vault 加算与 `intelligentBankingSystem` 之后）。**未点名的资源现在完全没有统一储量加成**，这是用户明确选择。**legacy VM 回归的硬性要求**：`scripts/generate-legacy-data.cjs` 必须注册 `['unification-storage', 'simulation/unification-storage']`，且排在 `neighbors` 之后、`storage-bonuses`/`containers` 之前；漏了会让 VM 报 `unificationFuelMultiplier is not defined`，核心回归静默失败 24 项。无新增存档字段，`CONFIG.version` 仍为 33。
- **外星定居与世界统一（beta 0.9.11）**：`alienSettlement`（T12，200k，`buildingRequired: 'asrielSpaceport'`）成为 `spaceControlTower`/`alienCasting`/`spaceIndustrialization`/`starRingStation` 的新前置，后两者同时升到 tier 13。这四项是历史可合法研究的科技，`validate-unlocks.ts` 用 `ALIEN_SETTLEMENT_RETARGETED` 只容忍缺失的前置恰为 `alienSettlement`（研究门槛仍由 `isTechnologyUnlocked` 对新研究强制执行）。`TechnologyDefinition.occupiedNeighborsRequired` 让 `isTechnologyUnlocked` 在占领数不足时返回 false。统一效果由 `neighbors.ts` 的 `isWorldUnified` 驱动：`activeOccupations` 在统一后恒为空，`occupationOutputMultiplier`/`occupationTaxRate`/`garrisonedSoldiers` 因此全部失效；`applyWorldUnification` 在 `applyResearchSideEffects` 里调用（**只以占领列表为幂等条件**——研究时科技已先入列表，若以 `isWorldUnified` 守卫会直接跳过清空）。`calculateGlobalOutputMultiplier` 乘 `unificationOutputMultiplier`，`storage.ts` 的 `pushUnificationRow` + `calculateStorageTotals` 乘 `unificationStorageMultiplier`，两条路径同源；普通资源指 `!special && !crafted`。`tests/world-unification.test.ts` 守住这组不变量。
- **敌对行动削减敌方军事（beta 0.9.29，0.9.30 起限扫荡）**：数值在 `data/neighbors.ts`（`NEIGHBOR_MILITARY_RAID_CAP = .1`、`NEIGHBOR_MILITARY_FLOOR_SHARE = .25`、`MILITARY_RAID_TIER: RaidTier = 2`），公式在 `simulation/neighbors.ts`（`raidMilitaryDamage` / `neighborMilitaryFloor` / `calculateRaidMilitaryLoss(id, state, ratio, tier)`）。**比例复用 `previewRaid` 已有的 `ratio`**（我方战力 ÷ 本次行动所需战力）：`damage = cap × min(1, ratio/2)`，即刚好过门槛 5%、翻倍 10% 封顶；不要再引一条独立的兵力公式，否则界面与结算会分叉。下限按 `NEIGHBORS[id].military.max × .25` 而不是当前值——按当前值算的话，每次突袭都会把下限同时压低，正是下限要防的滚雪球。`executeRaid` 在掠夺之后、占领判定之前应用，取 `preview.militaryLoss`（突袭前算定），这样削弱不会抬高本回合的 `ratio` 而自我放大。**`Infinity` 是真实取值**（`required === 0` 时），`raidMilitaryDamage` 不能用 `!Number.isFinite(ratio)` 一刀切成 0，必须让它落到上限。已占领势力被 `executeRaid` 的 `occupied` 提前返回拦下，故「占领后不再削减」无需额外分支。`RaidPreview` 增加 `militaryLoss`/`militaryLossShare`，`RaidOutcome` 增加 `militaryLoss`；无新增存档字段，`CONFIG.version` 仍为 33。
- **只有扫荡削减军事（beta 0.9.30）**：`calculateRaidMilitaryLoss` 收 `tier` 参数，非 `MILITARY_RAID_TIER` 直接返回 0。档位判定收敛到数据层单一常量，不在结算里硬编码 `2`；偷袭/抢劫打商队、占领本身结束战斗，只有扫荡正面消耗对方兵力。`RAID_ACTIONS[2].desc` 补了一句「扫荡城市可以削减敌方兵力。」（用户原话）。`militaryLossShare` 改为 `militaryLoss > 0 ? raidMilitaryDamage(ratio) : 0`——原来只算比例不看档位，会让偷袭预览也报出 5%–10% 的份额，与实际不削减自相矛盾。**削减不再写日志**：删除 `executeRaid` 里的 `军事 -N` 行，`RaidOutcome.militaryLoss` 字段保留供界面与测试读取。界面侧 `militaryLoss(id) >= 1` 才显示「敌方军事 −N」，因此偷袭/抢劫的预览行不会出现这一项。
- **临近势力面板只留一行预估（beta 0.9.29）**：`InternalPanel.vue` 删除 `data-neighbor-loot` 整行，预览压缩为「战力 a/b · 伤亡 ≈c · 敌方军事 −d」。因为界面不再显示掠夺量，`preview()` 不再传 `raidEconomy`，`buildRaidEconomy` 从该组件移除，每次按键少算一次掠夺预估；`previewRaid` 的 `loot` 字段本身保留，`raid-economy.test.ts` 与真实结算仍读它。
- **单兵战斗力与防御力（beta 0.9.12）**：`src/data/military.ts` 是唯一数值来源——`SOLDIER_BASE_COMBAT_POWER = 1`、`SOLDIER_BASE_DEFENSE = 0`、`COMBAT_POWER_TECH_BONUS`（铁制装备/新型单兵装备/高级热武器/磁轨炮各 +1）、`DEFENSE_TECH_BONUS`（铁制装备/新型单兵装备/凯夫拉纤维/磁轨炮各 +1）、`DEFENSE_CASUALTY_REDUCTION = .1`。`calculateCombatPower` 改为「固定加算 × 军政 × 泰坦之力」（旧实现是 `ironEquipment ? 2 : 1` 的倍率，铁制装备的等效战力仍是 2，只是换成加算以便后续叠加）；`calculateSoldierDefense` 纯由 `state.tech` 推导。`defenseCasualtyMultiplier = 1/(1+防御力×0.1)` 只乘在 `previewRaid.expectedLosses` 与 `retaliate` 的损失上，**绝不进入 `raidStrength`**，否则防御科技会顺带变成进攻科技。`soldierStatBreakdown` 供 `TooltipPanel` 的 `soldier` 提示类型使用，明细与两个计算函数读同一批注册表。无新增存档字段，`CONFIG.version` 仍为 33。
- **士兵毛皮（beta 0.9.12）**：`soldierFurPerSoldier = SOLDIER_FUR_BASE(.2) × 战斗力^SOLDIER_FUR_POWER_EXPONENT(.5)`，`soldierFurRate = soldiers × 该值`。`production-finalize.ts` 用它替换旧的 `soldiers × .2 × calculateFurMultiplier`，**`calculateFurMultiplier` 已删除**（铁制装备的毛皮 +20% 一并移除，其价值全部转入战斗力）。开方是有意设计：裸装 √1 = 1 保持开局 0.2/s 不变，满装 √5 = 2.236 → 0.447/s，且百分比加成对毛皮的效果减半（+100% 战斗力 → +41% 毛皮）；工厂毛皮按乘算增长，量级始终压过它。`resource-breakdown.ts` 的 `soldierFur` 行改为「基础 `soldiers × 0.2` + `单兵战斗力` 百分比子行」，tooltip 不再出现铁制装备行。`scripts/generate-legacy-data.cjs` 的 registry 必须包含 `['military-data', 'data/military']` 且排在 `government` **之前**，否则 VM 回归会抛 `SOLDIER_FUR_BASE is not defined`。
- 威望资源解锁：`GameState.prestigeUnlocked`（`'particles'|'casimir'`）只增不减，由`updateProgression`→`syncPrestigeUnlocks`记录当前持有>0的资源，软重置、核弹与逃离均经`keepPrestigeUnlocks`继承且不修改源状态；`isPrestigeResourceUnlocked`=记录命中或当前持有>0。当前存档须提供完整解锁记录，不从历史持有量或重置次数补全。
- **占领 / 世界统一进入收支明细（beta 0.9.14）**：玩家报告占领后「税收 −10%」与「产量 +5%」在资金/资源明细左列完全看不到——两者**实际都已生效**，只是 `calculateResourceFactorRows` 从未把它们列出来。修法是在 `resource-breakdown.ts` 里新增 `addGlobalOutputRows()`，在资源行末尾调用：`pct('占领 ×N', occupationOutputMultiplier(state))` 与 `pct('世界统一', unificationOutputMultiplier(state))`，与 `幸福度` 同处「整条资源被放大」的位置；**`energy` 提前 return**，因为电力是固定供给预算、结算从不乘全局倍率。资金分支的 `catTax` 行额外列出 `占领 ×N 税收惩罚 −X%` 与 `实际税率 Y%`，且 `catTax` 被排除出「`value !== 0`」过滤——三个占领国把实际税率压到 0 时，正是最需要这条解释的时刻，行不能消失。`tests/world-unification.test.ts` 新增一项覆盖无占领/1 国/3 国/统一/电力五种情况。
- 基因修饰：`GameState.geneModification={dna:{C,G,A,T},levels}`为本周目状态（`createInitialState`新建，所有重置清零），当前存档须提供完整记录；校验拒绝未知键、负数、非整数与超过`MAX_GENE_LEVEL`(50)。解锁条件`isGeneModificationUnlocked`=CRISPR`geneSplicing`+本周目`arpaBuildings.geneSequencing≥1`。`craftDna`每个扣200k知识并计入`knowledgeSpent`；`upgradeGene`扣对应碱基`10×2^level`。CRISPR定义新增可选`casimirCost`，`canAffordCrisprUpgrade`统一判定，`validateStatistics`把已购升级的卡西米尔计入历史获取下限。
- 基因效果接入点：建筑基础产出类基因在`calculateBuildingOutput`中乘到单位产出（地面结算、钛副产物、收支明细同源），资源收支明细不单列基因行，加成直接计入来源的基础值；完美主义乘在`calculateFactoryRecipe.output`（不改input），生产线明细同样直接计入；泰坦之力乘`calculateCombatPower`（乘在装备科技的固定加算之后）；猫猫凝聚经`calculatePopulationPressure`与`calculateSoldierPressure`（×(1-bonus/2)）进入`calculateMorale`。
- 空间撕裂者：`powerPlant`+`alwaysRunning`+`output.energy=100`，走普通`settlePowerPlants`路径（无燃料）；知识容量在详情与总量两条路径都于CRISPR之后乘`1+0.2×建成数`，系数在`building-effects.ts`共享。自beta0.6.9起，完成第100段不再写入主线完成提示；直接、批量与队列建造均保持正常完成与效果，存档内已有历史日志不改写。
- 高科技工厂：`lines:2`、`jobSlots:{cementWorkshop:2}`；在`settleFactoryLines`中排在太空工厂之后按电力与氘连续比例供能，供能生产线=地面+太空+高科技×2，太空工厂秘银加成份额也按生产线计。不进入地面结算与超空间来源循环。
- 超空间太空港付费运行时提供16000氦-3容量（不依赖氘解锁），研究高维存储后与氘一起×2。
- 高维存储：`storage-bonuses.ts`中对民用航线站、小行星基地、太空港基础值×2，太空港追加16000水；货运站倍率由`calculateFreightCapacityMultiplier`给出`1+0.05×基地+1`（加算）。桥接新增`building-effects`模块（80个脚本）。
- 710研究站T19（850k，前置超空间采矿探查+气体云吸积）：`jobSlots:{lab:1}`经`calculateGrantedJobSlots`计入`calculateWorkerCapacity`与地面结算／收支岗位上限（按已建座数）；属于`HYPERSPACE_CONSUMER_IDS`，在超空间来源循环之后按整座扣25电力+1氘，付费座数经`SupportPreview.researchStationUnits`进入储量快照，每座知识+50000（在CRISPR与空间撕裂者加成之前加入）。
- 遥远星际（T20/T21）：
  - 超空间太空港的+25%已移除，`calculateHyperspaceOutputFactor`只保留`calculateProductionMultiplier`。星环加成经`isSpaceResourceSource`覆盖采冰船（水）、五类超空间来源、精金采矿船和石墨烯厂。
  - 星环系数收敛在`asriel.ts`：`STAR_RING_RESIDENT_BONUS = .0025`（每名Asriel居民0.25%）、`STAR_RING_LAB_STEP = .0001`（研究星环优化后每座受支持外星材料实验室+0.01%），由`calculateStarRingCoefficient`统一计算，结算与悬停共用；星环优化不再提升基础值。
  - 设施本地倍率`calculateHyperspaceLocalMultiplier`：精金采矿船为`1+0.1×整座付费运行的精金加工站数`。精金加工站可开关，每座维护电力10/s，按整座全额付费分配；停机或未付费的站不提供加成，不按已建数或小数供能比例计算。结算、回放和收支明细必须复用同一付费运行数与倍率，维护只扣一次；明细里在采矿船下列出「精金加工站」子行。
  - 精金采矿船与石墨烯厂属于`HYPERSPACE_SOURCE_IDS`，按整座供能比例结算。黑洞星际站属于`HYPERSPACE_CONSUMER_IDS`，付费座数经`blackHoleStationUnits`进入储量快照。`calculateRipperKnowledgeBonus`=`0.2+0.01×付费站数`，作用于每座完整撕裂者。
  - 新建筑全部在地面结算的跳过列表里。
  - 彭罗斯球体`segmentEffects:true`：`countRunningBuildings`直接按段数计，`settlePowerPlants`每段+5电力。
  - 引力转化：`calculateRawBuildingOutput`把整座球体的加成`calculateGravityConversionEnergy`平摊到已建段数（每段`5+加成/段数`），结算、回放、明细都走同一路径。
- 质量喷射（`src/simulation/black-hole.ts`）：
  - 状态`state.blackHole={mass,exoticMass,unstable,ejection}`随周目重置。当前存档须提供完整记录，schema 为31。`validate-black-hole.ts`在建筑校验后检查分配不超过已建容量。
  - 质量喷射器加入`HYPERSPACE_CONSUMER_IDS`，按整座付费供能。`calculateProduction`在所有产出（含人口收入）之后、封顶之前调用`settleMassEjection`，按`min(1, 1000×付费座数/总分配)`等比缩放，并且不超过库存；结果放在`result.ejected`，收支明细显示「质量喷射消耗」。
  - `advanceGameTick`把`ejected`换算成质量（`applyMassEjection`）。奇异质量首次跨过0.025时置`unstable`并写事件日志。
  - 解锁：`isTechnologyUnlocked`要求质量喷射器科技有完整彭罗斯球体；两项特殊科技要求`unstable`。稳定黑洞在`applyResearchSideEffects`中结算后从`state.tech`移除，因此可以再次研究。
  - 奇异失控带`prestigeReset:true`，`isPurchaseAllowed`拒绝直接购买和入队；UI打开确认框，由`launchBlackHolePrestige`校验解锁和费用后生成新周目。
- 黑洞重置：`prestige.blackHoleResets`、`prestige.darkEnergy`、`lifetime.darkEnergyEarned`。重置次数计入`prestigeResetsRequired`；不作旧档威望解锁推断。暗能量储量加成在CRISPR粒子/卡西米尔步骤之后乘`1+0.01×暗能量`（详情行「暗能量加成」，总表同步）。
- 旧版VM桥：`generate-legacy-data.cjs`注册`black-hole`与`validate-black-hole`模块。
  - 区域：`spaceMissionRequired`新增`neutronStar`和`blackHole`两个任务，状态位分别为`neutronStarMissionCompleted`和`blackHoleMissionCompleted`。建筑解锁和存档校验都走通用路径。
- 冶炼厂工位：
  - `GameState.smelterIdle`记录空闲工位数。容量`calculateSmelterSlotCapacity`=冶炼厂+2×恒星熔炉。运行工位`calculateRunningSmelterSlots`=（运行中的冶炼厂+2×熔炉）−min(空闲, 容量)。
  - 地面结算按运行工位套用原`calculateBuildingInput/Output('smelter')`配方，因此`inputUnits.smelter`=付费工位，钛副产物同源。
  - 新游戏空闲工位为0；当前存档缺字段、超过容量或非整数时拒绝。`changeSmelterAssignment`供⚙弹窗（`SmelterModal.vue`）调用。
- 恒星熔炉：新增电力产出25/s，进入发电结算；原有冶炼厂工位+2/座、工匠可用数与`calculateWorkerCapacity('foundry')`各+2/座保持。`calculateStellarForgeCraftMultiplier`=`1+0.1×座数`乘入锻造倍率，收支明细列为「恒星熔炉」行。
- VR中心：Asriel支持优先级排在末位，`allocations.vrCenter`经`vrCenterUnits`进入`calculateMorale`（每座+2.5，仍受上限）。虚拟训练：`calculateTrainingBoost`=8（原5）。
- 新资源：
  - `graphene`、`nanoAlloy`、`adamantite`：基础容量0，可分配集装箱。锚点货运站解锁后每种+32000。
  - `aerogel`：锻造物，当前存档必须包含`craftWorkers.aerogel`。工厂新增`nanoAlloy`生产线。
  - 存档结构版本为31，当前字段必须完整提供，不再按附加键补全旧档。

### 3.5 量子计算
- `calculateQuantumSnapshot` 在无快照时按基线迭代至多 16 轮支持预览以打破"量子↔储能↔知识容量"循环。
- `calculateSwarmSupportCapacity` 惰性求值：未研究 `quantumSwarm` 时不读取库存、不触发求解（显式传入 level 仍有效）。

## 4. 存档断代与写入保护

- `CONFIG.version = 31`；页面版本 beta 0.6.0。localStorage 键仍为 `meow-civilization-v12`，用于发现已有旧数据，不通过换键静默开新档。
- `src/state/validate-save.ts` 仅接受完整、合法的 schema 31 存档。schema 12–30 全部拒绝，包含已放弃的 0.6 原型；其他不支持版本、缺失字段与非法内容同样拒绝。
- 已移除历史迁移、缺字段回填、退役内容剥离、旧进度豁免（grandfather）等兼容 helper。不能仅改版本号来升级旧档。
- runtime 读取失败、无效或不兼容时记录「设置→硬重置」指引，保留原始存储内容，进入 `saveBlocked`；自动保存、手动保存与软重置不得覆盖原档。
- 硬重置重新创建完整初始状态，清空全部周目进度、累计进度、成就、传统威望资源与永久升级，并向原键写入 schema 31 新档。只有存储写入成功才退出保护；序列化或存储写入失败仍受保护，不报告保存成功。
- 合法的当前同 schema 存档仍可导入，需先完整校验；不把当前档导入支持称为旧档兼容，也不得用失败导入覆盖已有数据。
- 本版验证待统一执行；下方命令是验收方式，并非本轮通过声明。
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
- 星际先遣/信号/货箱支线整体退休（3任务+2科技+2ARPA+5剧情），当时采用旧档不退款、幂等清理；该历史兼容路径已于 beta 0.6.0 移除。
- 导航灯塔通过 `calculateBuildingName` 动态显示为"广播信标"（研究太空广播后），内部 ID 与存档不变。
- 采冰船基础产量 1 → 1.25（破冰计划），只在建筑产出函数一处计算。
- 第一批共用优化：幸福度预览复用支持预览的科研运行数；戴森支持未启用量子时跳过求解；区域数值显示统一。

---

## 更新检查清单（每次更新游戏后执行）

1. `npm run check`（或至少 typecheck + test + test:browser）全绿后再收尾。
2. 检查本文档：结算链顺序、缓存策略、存档严格校验/保护规则、测试命令是否有变化 → 有则更新对应章节与"历史决策记录"。
3. 检查 `docs/update-log.md`：本次改动是否已按格式补一条记录（含验证结果）。
4. 检查 `docs/glossary.md`：新增机制/术语或数值变化 → 同步对应词条。
5. 若新增了建筑/科技/区域/资源：确认当前 schema 完整字段校验、区域数值显示组件、悬停说明来源三处是否已按现有模式接入。
