# 游戏更新记录

> 本文档按时间倒序记录每次游戏更新的改动。
>
> 如无额外说明，每次游戏更新都要将游戏版本号的最小一位+1 例如beta 0.5.1 → beta 0.5.2，除非指定，否则不更改大版本，只更改最小一位
> 更新内容需要使用简洁的格式(参考目标文件已有内容），写入根目录下的updatelog.md文件，并且标注版本号与日期
> 
> **维护要求：每次更新游戏后，必须检查本文档并为本次改动补一条记录（若本次无玩法/界面/数值变化可注明"无玩法变更"）；记录必须包含验证结果。** 未写入记录的更新视为未完成收尾。
>
> 配套文档：`docs/technical-details.md`（技术细节，更新后同样需要检查同步）、`docs/glossary.md`（游戏名词表，新增机制或数值变化时同步）。

## 记录格式

```
## YYYY-MM-DD 简短标题
- 改动：要点列表（玩法/数值/界面/技术）
- 兼容：旧档影响、退休内容、迁移说明
- 验证：测试数量、浏览器验收、类型检查、构建
```

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

## 2026/10/22 beta 0.9.32 性能与代码质量整理

- **临近势力预览只算一次**：`InternalPanel.vue` 原先在模板一行里调用 `preview(id)` 5 次、`militaryLoss(id)` 2 次，而 `militaryLoss` 内部又调一次 `preview`，合计每行每次渲染跑 7 次完整 `previewRaid`（战力、门槛、期望伤亡、掠夺、军事削减全套）。`preview()` 是普通函数不是 computed，`props.revision;` 只是声明依赖、没有任何缓存，所以每次输入都会重算三行。改为 `raidPreviews` / `neighborStrengths` 两个 computed，按 revision 与当前草稿士兵数失效，模板只读结果。
- **成就精通系数去硬编码**：`AchievementsPanel.vue` 模板里写死 `(entry.level + 1) * 0.25`，改为 `percent((entry.level + 1) * ACHIEVEMENT_MASTERY_PER_GRADE * 100)`。**数值行为不变**（`ACHIEVEMENT_MASTERY_PER_GRADE = .0025` 恰好就是 0.25%），改的是「系数改了界面不会静默不同步」。注意 `src/vue/format.ts` 的 `percent(n)` 只是把 n 保留 2 位小数并去尾零、**不再乘 100**，所以传进去的必须是百分数值。
- **清除死代码并开启编译期检查**：`tsconfig.json` 增加 `noUnusedLocals` 与 `noUnusedParameters`。开启前先清掉全部 49 条（源码 23 条、测试 26 条），包括 `commands.ts` 未使用的 `calculateFactoryCapacity`/`countAssignedLines`、`production-finalize.ts` 未使用的 `calculateStorageDetails`、`story.ts` 与 `validate-stage-three.ts` 未使用的 `BUILDINGS`、`storage.ts` 从未被引用的 `StorageRowContext` 类型，以及删掉 `BuildingsPanel.vue` 的 `quantumLevel`/`quantumText` 后级联失效的两个 import。
- **有意保留的参数**：`multipliers.ts` 的 `calculateCommunityMultiplier(_id, _state)` 是存档兼容钩子（communityCenter 已不再加成产量）；`asriel.ts` 的 `_waystations`、`building-effects.ts` 的 `_state`、`costs.ts` 的 `_resource`、`events.ts` 的 `_metalCapacity`、`pool-replay.test.ts` 的 `_ledger` 属于既有签名，用下划线标注而非删除。`regionBalanceBind` 的 `source` 参数则是真无用，已移除并同步 5 处调用点。
- **Vue 模板 ref 的工具链误报**：`App.vue` 的 `leftScrollContainer` 只被模板 `ref="leftScrollContainer"` 使用，TypeScript 看不见模板引用，会被 `noUnusedLocals` 误报。保留变量并加 `void leftScrollContainer;` 显式读取，附注释说明原因——**不要删这个变量**，它是 `useIsolatedScroll` 接管左栏滚动的唯一挂载点。
- **测试文件按主题拆分**：`tests/modules.test.ts`（1277 行、74 个测试、58 条 import 散落在全文各处）拆成 `logs-queue`、`achievements-workers`、`building-economy`、`space-support`、`containers-cafe-smelting`、`projects-genetics`、`persistence-validation`、`simulation-core`、`format-display` 九个文件。**测试体逐字未改**，只把 import 提升到各文件头部并按实际使用裁剪。拆分后 74 个测试一个不少，总数仍为 780。运行器本就自动发现 `tests/**/*.test.ts`，无需登记。
- **兼容**：无存档结构变化，`CONFIG.version` 仍为 33；无新增字段。
- **验证**：`npm run check` 通过：780 项模块测试、经典 VM 回归（失败 0）、Edge 浏览器验收 601 项、类型检查与生产构建。

## 2026/10/22 beta 0.9.31 世界统一效果重做：储量加成改为强化具体建筑

- **废弃一刀切**：删除 `UNIFICATION_STORAGE_BONUS`、`unificationStorageMultiplier`、`storage.ts` 的 `pushUnificationRow`（detail 与 batched 两条路径都删）。原先「所有普通资源储量 +25%」会让每种资源免费涨上限，建存储建筑变得没意义；改成强化存储建筑本身，多出来的空间来自「拥有这些建筑」。
- **新增单一来源模块** `simulation/unification-storage.ts`：导出 `unificationContainerSlots`、`unificationAlloyContainerSlots`、`unificationStorageMultiplierFor(id, state)`、`unificationFuelMultiplier`、`unificationCashMultiplier`。因为规则横跨两个采集点——`containers.ts` 管集装箱槽位、`storage-bonuses.ts` 管每建筑容量——放一处才不会两边各写一份。
- **数值**（`data/neighbors.ts`）：`UNIFICATION_CONTAINER_SLOTS = 10`、`UNIFICATION_ALLOY_CONTAINER_SLOTS = 5`、`UNIFICATION_HANGAR_STORAGE_MULTIPLIER = 2`、`UNIFICATION_FUEL_DEPOT_BONUS = .5`、`UNIFICATION_BANK_BONUS = .25`、`UNIFICATION_WAREHOUSE_MULTIPLIER = 2`。
- **集装箱槽位**：`calculateBuildingContainerCap` 在 `超级集装箱`/`中子库` 调整后的值上再加 +10；`calculateBuildingAlloyContainerCap` 在 `超级集装箱` 分支内 +5（合金集装箱没有该科技时本来就不存在，所以不额外放开）。
- **每建筑容量**：`格纳库`、`仓库`、`高级存储枢纽` 的整份贡献乘 2（含 `warehouseUpgrade` / `iridiumAlloyWarehouse` / `intelligentStorage` 等既有倍率，叠乘而非替换）；三个燃料库的 石油/氦-3/铀 乘 1.5；银行/猫咖的 cash 乘 1.25（在 vault 加算与 `intelligentBankingSystem` 之后）。
- **`推进剂库`**：游戏数据里没有这个建筑，按用户确认按 `轨道燃料库(orbitalFuelDepot)` 处理。
- **未被点名的资源**（知识、食物、字节等）现在完全没有统一储量加成——这是用户明确选择的「移除普通资源+25%，只保留新加成」。
- **描述文案**：`worldUnification.effects[2]` 改为「全局产量+25%，资源储量大幅提升」；`InternalPanel.vue` 的 `data-unification-bonus` 同步；`applyWorldUnification` 的日志同步。
- **legacy VM 回归**：`scripts/generate-legacy-data.cjs` 注册表必须新增 `['unification-storage', 'simulation/unification-storage']`，且排在 `neighbors` 之后、`storage-bonuses` 与 `containers` 之前，否则 VM 里 `unificationFuelMultiplier is not defined`，整个核心回归失败 24 项。
- **测试**：新增 `tests/unification-storage.test.ts`（7 项：两条集装箱规则、格纳库翻倍、三个燃料库 +50%、银行/猫咖 +25%、仓库/枢纽翻倍、未点名建筑不受影响）。`tests/world-unification.test.ts` 里「raises every ordinary resource cap by 25%」改写为「boosts the named storage buildings」+ 新增「no longer multiplies every ordinary cap」。浏览器验收的面板文案断言同步（601 项不变）。
- **验证**：`npm run check` 通过：780 项模块测试、经典 VM 回归（失败 0）、Edge 浏览器验收 601 项、类型检查与生产构建。

## 2026/10/22 beta 0.9.30 扫荡专属削弱与界面整理

- **只有扫荡削减军事**：`data/neighbors.ts` 新增 `MILITARY_RAID_TIER: RaidTier = 2`（扫荡）。`calculateRaidMilitaryLoss` 多一个 `tier` 参数，非该档位直接返回 0，把「哪个行动能削」收敛到数据层单一常量，不在结算里硬编码 `2`。语义理由：偷袭/抢劫打的是商队与补给线，占领本身就是结束战斗，只有扫荡是成建制洗劫据点、正面消耗对方兵力。
- **说明文案**：`RAID_ACTIONS[2].desc` 追加「扫荡城市可以削减敌方兵力。」——这是用户要求的原话，按 `AGENTS.md` 第 9 条之外唯一允许的界面补充，因为它是需求本身。
- **`militaryLossShare` 跟随实际情况**：改为 `militaryLoss > 0 ? raidMilitaryDamage(ratio) : 0`。原来只算比例不看档位，会让偷袭的预览也报 5%–10% 的份额，与实际不削减矛盾。
- **削减不再写日志**：删除 `executeRaid` 里的 `军事 -N` 日志行；`RaidOutcome.militaryLoss` 字段保留供界面与测试读取。
- **测试**：`tests/neighbor-military-raid.test.ts` 重写为 9 项，核心新增两项守卫——「only 扫荡 reduces the defender military」（另外三档逐档断言预览与结算都不削减）与「扫荡 never writes a log line about the military reduction」。既有用例的档位从偷袭改为扫荡。浏览器验收把「偷袭削减军事」改为「偷袭不削减」+ 独立扫荡段验证削减与不写日志，并新增扫荡说明文案断言（597→601）。
- **验证**：`npm run check` 通过：772 项模块测试、经典 VM 回归、Edge 浏览器验收 601 项、类型检查与生产构建。

## 2026/10/22 beta 0.9.29 削弱敌方军事与临近势力界面精简

- **军事削弱**：`data/neighbors.ts` 新增 `NEIGHBOR_MILITARY_RAID_CAP = .1` 与 `NEIGHBOR_MILITARY_FLOOR_SHARE = .25`；`simulation/neighbors.ts` 新增 `raidMilitaryDamage(ratio)`、`neighborMilitaryFloor(id)`、`calculateRaidMilitaryLoss(id, state, ratio)`。`ratio` 沿用 `previewRaid` 已有的「我方战力 ÷ 本次行动所需战力」，因此优势越大削得越多（`ratio` 1 → 5%，2 → 10%，之后封顶），无需再引一条新的战力公式。
- **只削不灭**：下限按**初始上限** `NEIGHBORS[id].military.max × .25` 计算，不按当前值。按当前值算会让每次突袭都顺手把下限压低，正是这个下限要防的滚雪球。`advanceNeighbors` 的日常增长不变，所以削弱是「压制」而非「永久删除」。
- **应用位置**：`executeRaid` 在掠夺之后、占领判定之前结算，用 `preview.militaryLoss`（基于突袭前兵力算出），避免削弱自身抬高 `ratio` 而放大本回合的收益。`RaidOutcome` 与 `RaidPreview` 各新增 `militaryLoss` 字段（`RaidPreview` 另有 `militaryLossShare` 供界面显示百分比），并追加一条 `军事 -N` 日志。
- **撤离游戏不削减**：已占领势力本来就被 `executeRaid` 的 `occupied` 提前返回拦下，因此「占领后不再削减」不需要额外分支。
- **界面精简**：`InternalPanel.vue` 删除 `data-neighbor-loot` 整行；预览行由三行长句压缩为一行「战力 a/b · 伤亡 ≈c · 敌方军事 −d」。因为界面不再展示掠夺量，`preview()` 也不再传 `raidEconomy`，顺带减少了每次按键的重算；`previewRaid` 的 `loot` 仍保留（`raid-economy.test.ts` 与结算读它）。
- **测试**：新增 `tests/neighbor-military-raid.test.ts`（8 项：比例换算、下限口径、10% 上限、预览与结算一致、反复突袭收敛到下限、削弱后确实更好打、被拒绝的行动不削、档位越高同样兵力削得越少）。浏览器验收把 2 条旧文案断言改为新写法，并新增「不再显示可掠夺预估」「预览显示可削减军事」「突袭后敌方军事下降」等断言（591→597）。
- **验证**：`npm run check` 通过：771 项模块测试、经典 VM 回归、Edge 浏览器验收 597 项、类型检查与生产构建。

## 2026/10/22 beta 0.9.28 AI数据中心与卡尔维拉平衡

- **危险物质库加维护费**：`buildings.ts` 增加 `input: { energy: 10, deuterium: .25 }`、`toggleable: true`、`settledByOtherSystem: true`，并从 `存储` 语义改为 `HYPERSPACE_CONSUMER_IDS` 成员。容量因此跟随**已付清维护费的整座数量**：`StorageSnapshot` 新增 `hazardousStorageUnits`，由 `support-preview` 的 `space.inputs.hazardousMaterialStorage` 提供；`accumulateStorageRows` 用它替代 `state.buildings[id]`。副作用是关闭或断电后 E-710 / 中子容量立即失效——这是维护费应有的语义，已向用户确认。
- **精金精炼站 20%→10%、耗电 10→5**：数值全部收敛到新文件 `simulation/ai-data-center.ts`（`ADAMANTITE_PROCESSOR_BONUS = .1`）。`space-settlement`、`pool-replay`、`resource-breakdown` 不再硬编码 `10`，一律读 `calculateBuildingInput('adamantiteProcessor', …).energy`，避免三处各写一个数字。
- **新建工厂默认合金线**：新增 `assignNewFactoryLines(state, id, added)`（`simulation/factory.ts`），在 `purchases.ts` 的 `constructBuildingState` 末尾调用。**必须在 stop 决策之后调用**：起手就停用的工厂不产生生产线容量，先分配会造出 `lines > capacity` 的非法存档（`validateFactoryAssignments` 会拒载）。
- **生产线抽取**：`changeFactoryAssignment` 改为「先用空余容量，不足部分从合金线扣除」，合金线自身只能收缩、不能自借。`FactoryModal` 的 `»` 按钮禁用条件同步改为 `canGrow()`：原来 `used >= cap` 会让玩家永远点不动抽取。这个按钮状态是新机制最容易漏改的地方。
- **AI数据中心（T21 科技 + 卡尔维拉建筑）**：科技 `aiDataCenter` 前置 `['nanoAlloy', 'energyShield']` + `spaceMissionRequired: 'neutronStar'`，价格 200 万知识 + 15000 纳米合金 + 20000 石墨烯；建筑 `cost` 为 200k 知识（1.15）与秘银 / 纳米合金 / 石墨烯 / 精金（1.20）。
  - **电力**：`calculateAiDataCenterPower` = `25 + 5 × (已建造总数 − 1)`，`getBuildingPowerDemand` 与 `calculateBuildingInput` 共用。注意这里是**已建造总数**而非已供能数量：加价为「单建筑的电力消耗」，与供能与否无关。
  - **量子水平**：`calculateQuantumSnapshot` 把 `+5% × 运行中中心数` 加进基础倍率，与 AI超级核心的 `+25%` 同一层级（用户确认过按加算实现）。中心的运行数直接取 `countRunningBuildings('aiDataCenter')`——电网会把缺电单位写进 `stoppedBuildings`，因此这个数天然等于「已付清维护」的数量，不需要额外的快照字段。
  - **维护费入账**：AI数据中心加入 `HYPERSPACE_CONSUMER_IDS`，由 `space-settlement` 的消费者循环按 `calculateBuildingInput` 扣电力。**这一条曾经漏掉**：电网把它算作 `requested`，但没有任何结算路径真正扣电，导致 `power.used` 偏高、`rates.energy` 却不下降。
- **三个后续科技**：`aiCementWorkshop`（175 万）、`advancedAdamantiteProcessing`（180 万）、`advancedGrapheneProcessing`（190 万），前置均为 `['aiDataCenter']`，档位 T21。三者各自的倍率函数都在 `ai-data-center.ts` 内，水泥 / 石墨烯 / 精金三条结算路径与 `resource-breakdown` 的因子行读同一函数。
- **量子水平只解一次**：`production.ts` 把 `calculateQuantumSnapshot` 提到 `replaySettledPool` 之前，并把 `quantumLevel` 一路传给 `settleSpaceProduction` / `settleGroundProduction` / `replaySettledPool` / `replaySpaceDebits`。石墨烯加成同时影响池子重放与支持预览，若各自再解一次量子会与工具提示不一致。`settleSpaceProduction` **不能**自己调 `calculateQuantumLevel`：它会穿过 `support-preview` 回到自己，形成无限递归。
- **工具提示**：`building-tooltip-rows.ts` 里 AI数据中心的 `tip.description` 追加「当前量子水平：X.XX」，后续科技效果只在该科技已研究时列出。危险物质库的维护费由通用的「消耗行」自动生成，无需额外文字。
- **后续科技数值按单座显示**（收尾调整）：三个后续科技的加成行只写**单座中心**的数值，不写「单座 × 座数」的总量，也**不加 `/座` 后缀、不附带第二行解释**（玩家界面从简，用户明确要求不要擅自加小字说明，已写入 `AGENTS.md` 第 9 条）。为此在 `ai-data-center.ts` 抽出 `calculateAiCementBonusPerCenter` / `calculateAiGrapheneBonusPerCenter`，倍率函数改为 `1 + 运行座数 × 单座加成`，界面与结算共用同一个单座公式（避免界面再手写一次 `/1.75`；量子水平的 `+5%` 也改读 `AI_DATA_CENTER_QUANTUM_BONUS`）。注意工具提示的 `percent` 实参是 `formatEffectNumber`（四位小数）而不是 `vue/format` 的 `percent`（两位小数）——测试必须照抄组件实际传入的格式化函数，否则断言值与界面不符。
- **文档同步**：`docs/glossary.md`（量子水平来源、危险物质库维护费、加成按单座显示）、`docs/technical-details.md`（结算顺序与量子传递）、`docs/agent-map.md`（`ai-data-center.ts` 进权威表、测试计数）、`README.md` 与 `App.vue` 版本号。
- **存档载入失败的诊断**：`validateCurrentSave` 给每一步校验加了阶段标签（`check('供电顺序', …)`），拒绝时把阶段追加到原有消息后面（如「供电开启顺序无效。（供电顺序）」）；`runtime.load()` 在保护模式下用 `console.warn` 打出 `[存档载入失败] <原因>`。**玩家界面文案完全没变**，多出的信息只进控制台，用于把「存档坏了」从猜测变成一条明确的报错。注意这里必须是 `console.warn` 而不是 `console.error`：验收页把所有 `console.error` 记成失败断言（那是未捕获异常的安全网），而拒绝一份旧存档是被处理过的预期结果。
- **测试**：新增 `tests/t21-ai-data-center.test.ts`（10 项，含一项驱动真实 `addBuildingEffectRows` 的单座显示断言：数值为单座、且**不带** `/座` 后缀与说明文字）与 `tests/factory-default-lines.test.ts`（9 项）。更新 6 个既有文件：`distant-stars`（精金 10%/5 电力的新期望值）、`hazardous-storage`（供能才给容量）、`settlement-ledger`（新增 `hazardousStorageUnits` 字段）、`save-compatibility`（增量列表补 `aiDataCenter`）、`scripts/generate-legacy-data.cjs`（`ai-data-center` 必须早于 `quantum` 注入，否则 VM 回归里是 `ReferenceError`）、以及 7 个 fixture 的科技排除列表（新科技带 `spaceMissionRequired`，与危险物质库同理会被 `validateUnlockRecords` 拒绝）。浏览器验收新增 5 项：单座水泥、单座石墨烯、精金 +2%、量子水平非零的前置断言，以及「效果行没有额外小字或 `/座` 后缀」。
- **玩家存档无法载入的回归（严重）**：`registerBuiltPowerUnits` 在建造后无条件把 `enabled` 写进 `powerActivationOrder`，而 `demand === 0` 的建筑（发电站、`alwaysRunning` 建筑，如恒星熔炉）本来就不该出现在供电顺序里。每建一座就多一条永不被消费的记录，`order > 已建数` 后下一次载入被 `validatePowerActivationOrder` 判为「供电开启顺序数量无效」，整档拒绝，玩家直接卡在保护模式。修复：`demand <= 0` 直接 return；登记前用**建造前**运行数推 `newlyEnabled`（原实现读改动后的 `countRunningBuildings`，会把自己重复计一次）；写入时用「已运行 + 本次启用」的合计数替换该建筑原有条目，保留其原有优先级位置。**排查过程值得记**：`stellarForge` 是 `powerPlant: true, alwaysRunning: true`，所以「把 `stoppedBuildings` 加一以隐藏新单位」的技巧对它完全无效——`alwaysRunning` 让 `countRunningBuildings` 忽略 `stoppedBuildings`。
- **已被写坏的存档在载入时自愈**：`save-compatibility.ts` 新增 `clampActivationOrder`，把超出运行数的条目裁到运行数（发电建筑整条丢弃）。**只处理这一种情况**：条目必须恰好是 `{id, count}` 且为正整数，其余（多余键、类型错误、条数超过 10000）一律原样透传交给严格校验拒绝——第一版实现重建了 `{id, count}` 对象，结果把 `extra: true` 和超长数组都「修复」成了合法档，被 `tests/power-order-save.test.ts` 抓到。此处按 AGENTS.md 第 1 条征询过用户：原本「数量超限必须拒绝」的测试改为「数量超限夹取、格式非法仍拒绝」，因为载入时无法区分「玩家手改」与「本版本 bug 写坏」，而后者不修会让受影响玩家永久卡死。
- **耗电加价行**：AI数据中心的效果行末尾新增「AI数据中心耗电 +5」，位于维护消耗「电力」之后（即所有效果行的最下面），值取自 `AI_DATA_CENTER_POWER_STEP`，不写死。它是对「电力」那个数值的加价说明，因此用 `negative` 标记与维护行同色。按 AGENTS.md 第 9 条只写「名称 + 数值」，不加 `/座` 后缀、不加第二行解释；机制解释在 `docs/glossary.md`。
- **验证**：`npm run check` 通过：763 项模块测试、经典 VM 回归、Edge 浏览器验收 593 项、类型检查与生产构建。
- **验证**：`npm run check` 全绿——757 项模块测试（原 738 + 19）、VM 回归、浏览器验收 591 项 RESULT: PASS、类型检查与生产构建。

## 2026/10/21 beta 0.9.27 科技调整：高级混凝土升 T16、戴森球升级技术隐藏

- **高级混凝土降到 T16**：`tier: 26 → 16`。造价（46万知识 + 1000铱 + 2500合金 + 5万纳米管）与效果（水泥工人 +30%，不增加原料消耗）**均未改动**。前置仍是「硅酸盐水泥 + 碳纳米管」，两者分别是 T5 与 T14，低于 T16，所以科技树里它不会画在依赖项上方。实测渲染后档位标签止于 `25`（T26 已不存在），该节点落在 T16 标签行上。
- **戴森球升级技术转为退役**：加入 `RETIRED_TECHNOLOGIES`（`src/data/technologies.ts`）。两个科技界面都不显示、`isTechnologyUnlocked` 恒返回 false 所以永远无法再研究。
  - **为什么不直接删**：它同时是 2级戴森球分段体与完成体的唯一解锁条件（`buildings.ts:105,108` 的 `tech: 'dysonSphereII'`）。直接删会让含该科技的旧存档被 `validateSaveIds` 判为「存档项目无效」而整档拒载，并且已建成的 2级戴森球会失去科技依据。
  - **旧存档不受损**：建筑解锁看的是 `state.tech.includes(building.tech)`，与「科技能否再研究」是两件事。已验证研究过它的存档 `isBuildingUnlocked('dysonSphereL2Segments') === true`，2级戴森球照常建造与开关；而新玩家 `isTechnologyUnlocked` 返回 false，永远碰不到。
  - 退役科技在 `validateUnlocks` 里跳过前置校验（beta 0.9.24 已有机制），所以旧档不会因为前置被改动而拒载。
- **实测**（headless，已研究科技视图）：渲染 201 个节点，`dysonSphereII` / `agriculturalMachinery` / `energyStorage` 均缺席，`dysonSphere` 与 `advancedConcrete` 正常显示。`201 = 206 − 4(退役) − 1(本次夹具排除的 prestigeReset 科技)`，数字吻合。
- **测试**：`tests/t20-technologies.test.ts` 新增 2 项——「高级混凝土是 T16 且前置不高于 T16」、​「戴森球升级技术已退役但保留已有进度」。另更新 2 处旧断言（T26 → T16、退役列表追加 `dysonSphereII`）与 1 条浏览器档位断言。
- **验证**：`npm run check` 全绿——738 项模块测试（原 736 + 2）、VM 回归、浏览器验收 628 项 RESULT: PASS、类型检查与生产构建。

## 2026/10/21 beta 0.9.26 修复：分段工程与完成体同名导致「两个戴森球」

玩家反馈：解锁戴森球后建筑页同时出现两个「戴森球」。

- **根因**：`withConstructionPhases`（`src/vue/construction-rows.ts`）会把分段建造行插在完成体**前面**，而未建成的项目两行同时显示。注册表里分段体与完成体**共用同一个 `name`**：`dysonSphereSegments.name === dysonSphere.name === '戴森球'`。于是「已解锁、未建成」阶段玩家看到两行完全一样的条目。
- **影响面**：不是戴森球独有——7 个分段工程全部同名：戴森球、2级戴森球、空间撕裂者、彭罗斯球体、AI超级核心、AGI核心组件、AGI飞升核心。
- **为什么以前没暴露**：`isConstructionBlocked` 让**已建成**项目的分段行消失，只剩完成体；同名只在「已解锁但未建成」这个窗口期可见。而 `tests/segmented-naming.test.ts` 只断言两条**注册表记录**同名，没有断言**面板行**的唯一性，所以测试全绿但界面是坏的。
- **修法**：`withConstructionPhases` 改为**未建成时只返回建造行**，完成体在建成后才出现。
  ```ts
  const phases = (SEGMENT_PHASES[id] || []).filter(phase => !isConstructionBlocked(state, phase));
  if (phases.length) return phases;   // 未建成：只显示建造行
  return [id];                        // 已建成：显示完成体
  ```
  理由：完成体在未建成时既不能购买也没有开关，只是一行只能看的信息。
- **没有采用「改名」方案**：最初我给分段行加「（分段）」后缀，虽然能区分，但与 `docs/agent-map.md` 的既定设计（「两条记录的 `name` 必须完全相同」，由 `tests/segmented-naming.test.ts` 把关）冲突，用户选择改结构而非改名。改名方案还踩过一个坑：把后缀加进 `calculateBuildingName` 会让收支明细的戴森球发电行变成「戴森球（分段）+500/s」，语义错误——那张函数描述的是**建筑本身**，不是**面板行**。
- **测试**：新增 `tests/segmented-row-names.test.ts`（7 项）——未开工只渲染建造行、在建中（1/50/99 段）同样只渲染建造行、建成后完成体出现且建造行退休、非分段建筑只渲染一次、面板无同名重复、`calculateBuildingName` 不带后缀、面板不私自改名。已验证**回退修复后核心断言变红**。
- **浏览器验收联动**：4 条既有断言依赖「两行并存」，按新语义更新——AI 核心未完成时只显示分段行、空间撕裂者未完成时只显示建造行、戴森球未完成时不渲染完成形态、彭罗斯球体改断言分段行。另新增 2 条：全页面无同名重复行、未完成的 AI 核心只显示分段行。
- **验证**：`npm run check` 全绿——736 项模块测试（原 729 + 7）、VM 回归、浏览器验收 628 项 RESULT: PASS、类型检查与生产构建。

## 2026/10/21 beta 0.9.25 左栏统一滚动：资源列表 + 锻造物 + 威望资源

玩家反馈：资源列表单独滚动很难用，希望它和锻造物、威望资源一起作为一个整体滚动，且资源列表始终完整展开。

### 结构改动

`App.vue` 的左栏从「文明面板 + 资源面板 + 锻造面板 + 威望面板」四个平级子元素，改成：

```
.col-left.pinned-column
  ├─ CivilizationPanel            ← 留在滚动区外，始终可见
  └─ .col-left-scroll             ← 唯一滚动容器（isolated-scroll）
       ├─ ResourcePanel
       ├─ CraftingPanel
       └─ #prestigeResources
```

- **滚动原语没有重写**：`useIsolatedScroll` 从 `ResourcePanel.vue` 上移到 `App.vue`，挂在 `.col-left-scroll` 上。行为完全不变（滚轮到边界不带动页面），只是挂载点上移——这正是当初把它抽成通用原语的收益：换容器不需要动行为代码。
- **资源列表不再是滚动容器**：`ResourcePanel.vue` 退回普通 `<section class="panel">`，删掉 `ref="scrollContainer"`、`:class="ISOLATED_SCROLL_CLASS"`、`data-isolated-scroll` 与 `data-overflowing`（后者在 CSS 里早已无人引用）。
- **CSS**：`.col-left .col-left-scroll{flex:1 1 auto;min-height:0}` 吸收列内剩余高度。这里 `flex:1 1 auto` 是**对的**（与 v0.9.21 的教训不冲突）：v0.9.21 那次的 bug 是把 `flex:1` 加在**不可滚动**的面板上，内容少时多出来的空间变成可见空白；而可滚动容器内部的剩余空间不会显示成空白，它只是容器的可用高度。`min-height:0` 是 flex 子元素能够真正收缩并滚动的前提，缺了它容器会被内容撑开而不产生滚动条。

### 为什么这样拆分

文明面板（纪元、人口等）是玩家随时要看的上下文，跟着滚走会很难受，所以留在区外。资源/锻造物/威望资源都是「随时会长的列表」，性质相同，合在一起滚动才不会出现「一个能滚一个不能滚」的割裂感。

### 实测（headless，1600×900，中列注入 2400px 填充）

`scroll clientH=650 scrollH=1256 overflows=true`；滚动容器 300px 后 `moved=300,300,300`（三块位移完全一致）；资源面板 `overflowY=visible, clientH=923 = scrollH=923, clipped=false`；页面滚动 500px 时 `colTop 36→0`（固定）且 `leftScrollTop=0`。

### 测试

- `tests/isolated-scroll.test.ts` 重写为 7 项，其中 2 项专门锁新结构：三块内容都在同一容器内且顺序正确、资源面板**不得**再带 `useIsolatedScroll`/`ISOLATED_SCROLL_CLASS`/`data-isolated-scroll`、文明面板必须在滚动区外。另加反向断言：旧的 `.col-left .resource-panel.isolated-scroll` 规则不得残留。
- 浏览器验收把整块滚动用例重写为 9 条：共用容器、左列固定、左栏产生滚动条、资源列表完整展开（`scrollHeight === clientHeight`）、三块一起滚动且位移相同、左栏滚动不带动页面、页面滚动不带动左栏、文明面板在区外、两条滚动条并存。
- 另两条旧布局断言随结构更新（「锻造物紧邻资源面板」「威望资源在左栏最下方」→ 改为断言它们位于同一滚动区内）。
- **验证**：`npm run check` 全绿——729 项模块测试、VM 回归、浏览器验收 626 项 RESULT: PASS、类型检查与生产构建。

## 2026/10/21 beta 0.9.24 三个 T20/T26 科技与农业机械退役

### 新增科技

| 科技 | 档位 | 造价 | 前置 | 效果 |
|---|---|---|---|---|
| 纳米装甲技术 | T20 | 1.6M 知识 + 2500 石墨烯 + 2500 精金 + 1000 纳米合金 | `nanoAlloy` | 单兵战斗力 +2、防御力 +1 |
| 纳米机械骨骼 | T20 | 1.6M 知识 + 1500 石墨烯 + 1000 精金 + 750 纳米合金 | `nanoAlloy` | 伐木工/石工/矿工/煤矿工基础产能 +150%（覆盖合金工具） |
| 高级混凝土 | T26 | 460k 知识 + 1000 铱 + 2500 合金 + 50k 纳米管 | `silicateCement` + `carbonNanotubes` | 水泥工人基础产量 +30%，不加原料消耗 |

- **纳米装甲技术**：`COMBAT_POWER_TECH_BONUS.nanoArmor = 2`（唯一的非 1 值）、`DEFENSE_TECH_BONUS.nanoArmor = 1`。两个注册表仍是士兵属性的唯一来源，所以悬停明细自动带上它。防御力上限随之从 4 提到 5，伤亡倍率 1/(1+0.5) ≈ ×0.667。
- **纳米机械骨骼**：`calculateToolMultiplier` 里**先**判断它，命中四个工种直接返回 `2.5`——这就是「覆盖」语义，不会与合金工具的 `2` 相乘。农民（`forage`）刻意不包含（用户确认），继续吃钢铁工具的 ×1.5。
- **高级混凝土**：`cementWorkshop` 的输出倍率改为 `(硅酸盐水泥 ? 1.5 : 1) × (高级混凝土 ? 1.3 : 1)`，两者相乘为 ×1.95（用户确认的叠加方式）。只改 `cement` 产量，不加任何原料。

### 农业机械退役

用户要求「移除农业机械及其效果」。直接删注册表会让含该科技的旧存档被 `validateSaveIds` 判为「存档项目无效」而整档拒载，所以按 `energyStorage`/`batteryConcentrationRing` 的先例**退役**：

- `RETIRED_TECHNOLOGIES` 追加 `agriculturalMachinery`，两个科技界面都不显示；`isTechnologyUnlocked` 恒返回 false，永不再可研究。
- 效果全部删除，共 4 个作用点：`ground-settlement.ts`（forage ×2）、`TooltipPanel.vue`（悬停倍率 ×2）、`resource-breakdown.ts` 两处（notes 与 pct 行）。
- `validate-unlocks.ts` 对退役科技**跳过前置校验**：它们已无效果，前置图失去意义，而且农业机械的前置（automation/electricity）本身可能在更老的存档里被重新定义过。这是本次唯一触及存档校验的改动，专门为「已合法获得的进度不得失效」这一硬要求服务。

### 架构调整：`RETIRED_TECHNOLOGIES` 下沉到 data 层

原先它定义在 `src/vue/tech-categories.ts`，但 `simulation/unlocks.ts` 也要用它（同一份退役名单），而项目禁止 `simulation → vue` 反向依赖。改为在 `src/data/technologies.ts` 定义并由 `vue/tech-categories.ts` `export { ... } from` 转出，保持单一真相且依赖方向不变。

### 测试

- 新增 `tests/t20-technologies.test.ts`（9 项）：档位/造价/前置、+2/+1 战斗力与防御、四工种 ×2.5 且**覆盖**合金工具、农民不受影响、水泥 1.5/1.3/1.95 三个精确倍率、结算与明细一致、农业机械退役后输出不变、旧存档往返、解锁门槛。
- 夹具修复：8 个「部分科技」测试文件（`hyperspace-energy`、`hyperspace-services`、`outer-space`、`retired-tianxing`、`retired-interstellar`、`stage-three`、`test-asriel-core.cjs`、`test-moon.cjs`）原先排除 `nanoAlloy`，导致新科技的前置缺失、存档校验失败；在排除列表里同步加入三个新 ID。
- 浏览器验收新增 4 条：农业机械界面隐藏但注册表保留、三个新科技已注册、档位 T20/T20/T26、已研究树不含退役项。
- **验证**：`npm run check` 全绿——729 项模块测试（原 720 + 9）、VM 回归、浏览器验收 624 项 RESULT: PASS、类型检查与生产构建。

## 2026/10/21 beta 0.9.23 修复：资源明细弹窗右侧空白

玩家第二次反馈同一处：折行修好后，弹窗右侧出现一大块空白。

- **根因**：上一版写了 `min-width:400px` 作为「短内容保底」。实测真实弹窗内容只有 **175px**（左列 95 + 间距 10 + 右列 70），而弹窗被 `min-width` 撑到 400px，于是右侧空出 **225px**。玩家截图里的「坏掉」正是这块空白，不是折行。
- **另一个放大因素**：`.resource-columns` 是 `display:flex`，容器宽度随弹窗拉伸到 378px，而两个 `flex:0 0 auto` 列只占 250px，剩余空间留在容器末尾——即使去掉 `min-width`，只要容器不收缩，空白仍会出现在列内。加 `width:max-content` 让容器自身收缩到内容宽度。
- **最终策略**：`width:max-content`（宽度 = 两列内容之和）+ `max-width:calc(100vw - 16px)`，**不设 min-width**。内容少时弹窗就窄，内容多时自动变宽，长数值始终单行。
- **实测**（真实组件 + 真实存档状态，headless 1600x900）：
  - 短内容：`TIP w=197`，两列 175px，无空白。
  - 截图场景（左列 9 行 + 右列 1 行长数值）：`TIP w=272`，`trailingGap=1`（修复前 129）。
  - 超长内容：`267 → 447` 变宽，数值 `h=21`（单行），`right=447 <= viewport 756`。
- **测试**：`tests/resource-tooltip-width.test.ts` 新增两条关键断言——弹窗不得含 `min-width`、两列容器必须 `width:max-content`。浏览器验收改为断言**真实空白量**：`tipW - padding - columnsW <= 2`（实测 slack=2），比断言固定宽度更能锁住「不留空白」这个不变量。
- **教训（记入 pitfalls 第 24 条）**：第一次修复只用手工拼的 DOM 探针验证，没覆盖真实组件，所以没发现 `min-width` 造成的空白；第二次改为测量真实悬停弹窗才定位到。**布局 bug 必须用真实组件测量，手工 DOM 会漏掉父级约束。**
- **验证**：`npm run check` 全绿——720 项模块测试、VM 回归、浏览器验收 620 项 RESULT: PASS、类型检查与生产构建。

## 2026/10/21 beta 0.9.22 资源明细弹窗按内容变宽

玩家反馈：知识收支弹窗右列「消耗」里的 `−9430.05/s` 放不下，被强行折成两行。

- **根因一（宽度）**：`.building-tooltip.resource-detail` 写死 `width:400px`。容器宽度先定死，长数值只能折行。改成 `width:max-content; min-width:400px; max-width:calc(100vw - 16px)`——按内容变宽，短内容仍有 400px 保底，且不超出视口。
- **根因二（列宽）**：`.resource-columns` 用 `grid-template-columns:minmax(0,1.4fr) minmax(0,1fr)`，右列只有约 150px；数值列还被 `fit-content(45%)` 限制到约 67px。改成 flex + `flex:0 0 auto`，每列按自身内容取宽，弹窗才能算出正确的总宽。
- **根因三（特异性陷阱）**：只加 `white-space:nowrap` 不生效。`.resource-factor-value{white-space:nowrap}` 的特异性是 0,1,0，而兄弟规则 `.resource-factor>span{white-space:normal}` 是 0,1,1，后者更高，静默覆盖了前者。必须写成 `.resource-detail .resource-factor>span.resource-factor-value`（0,3,1）。
- **作用域限定（重要回归）**：`.resource-factor` 同时被**建筑弹窗**使用，而建筑弹窗是固定 242px 宽、靠换行容纳长文本。第一版直接改基础规则，导致验收里「全部131种建筑效果列不挤压、不重叠、不溢出」大面积失败。所有新规则必须加 `.resource-detail` 前缀，基础规则保持 `minmax(0,1fr)` + `white-space:normal` + `overflow-wrap:anywhere`。
- **实测**（headless，构造等价标记）：短内容 `width=400`；塞入超长名称与数值后 `400 → 447`，数值 `whiteSpace=nowrap, h=21, lineH=20.8`（单行），`right=447 <= viewport 756`。
- **测试**：新增 `tests/resource-tooltip-width.test.ts`（4 项）。其中第 4 项专门锁「不污染建筑弹窗」——断言基础 `.resource-factor` 不含 `max-content`、基础名称列仍 `white-space:normal`。已验证改前 4/4 红、改后 4/4 绿。浏览器验收新增 4 条真实渲染断言。
- **验证**：`npm run check` 全绿——720 项模块测试、VM 回归、浏览器验收 569 项 RESULT: PASS、类型检查与生产构建。

## 2026/10/21 beta 0.9.21 修复：资源少时左列空白

玩家截图反馈：资源列表最后一行（「特殊资源II」的 DNA 行）与「锻造物」之间空出一大块。

- **根因**：上一版给资源面板写的是 `flex:1 1 auto`。`flex-grow:1` 会**无条件**把面板拉伸填满左列的剩余高度，与内容多少无关。资源少时面板被拉到 650px 高、内容只有 145px，中间就空出 500px。`data-overflowing` 属性本来可以用来条件化，但那会造成「测量依赖布局、布局依赖测量」的循环。
- **修法**：改成 `flex:0 1 auto` —— `flex-basis:auto` 取内容高度，`flex-shrink:1` 只在列放不下时才收缩，`min-height:120px` 保底。这样资源少时面板高度等于内容高度，资源多时仍会收缩并内部滚动。
- **实测**（1600×900，中列注入 2400px 填充）：资源少 `panelH=145 / contentH=145 / gap=0`；解锁全部资源后 `panelH=413 / contentH=923`，内部滚动、左列不溢出视口。
- **测试**：`tests/isolated-scroll.test.ts` 的相关用例改为断言 `flex:0 1 auto`，并显式断言不能出现 `flex:1 1 auto`（防止回归）。浏览器验收新增 2 条：iframe 内渲染 3 行资源时断言 `panelH - contentH <= 2`（无空白），以及内容多时面板收缩且内部滚动。
- **验证**：`npm run check` 全绿——716 项模块测试、VM 回归、浏览器验收 565 项 RESULT: PASS、类型检查与生产构建。

## 2026/10/21 beta 0.9.20 左列固定：页面与资源列表滚动解耦

上一版只做了「列表内部滚动」，但页面滚动时左列仍随页面移动。玩家反馈科技树等长页面下滚动等同于滚整页，要求两条滚动完全独立。

- **左列固定（pinned column）**：`App.vue` 给 `.col-left` 加 `pinned-column` 类；CSS 在 `@media(min-width:861px)` 内让它 `position:sticky; top:0`。
- **两个必要条件**，缺一不可：
  1. `align-self:stretch` —— `position:sticky` 的移动范围等于「网格行高 − 自身高度」。`.layout` 是 `align-items:start`，列会被压成自身高度，行高等于列高，sticky **完全没有移动距离，等于没写**。必须让该列在行内拉伸，行高才等于整页高度。
  2. `height:100vh` —— 只写 `max-height` 时列高仍由内容决定，`flex:1` 没有可分配空间，资源面板不会被压缩。显式锁成视口高度后，列内剩余空间才能分配给资源面板。
- **资源面板吸收剩余高度**：`.col-left .resource-panel.isolated-scroll{flex:1 1 auto;min-height:120px;max-height:none}`。宽屏下取消上一版的固定 `max-height`（会与 flex 分配打架），窄屏保留 `60vh`。
- **窄屏不应用**：≤860px 是单列布局，固定列会盖住下面的内容，所以整组规则都在 `min-width:861px` 里。
- **实测**（`--window-size=1600,900`，中列注入 2400px 填充模拟长页面）：`layout h=3184`、`colLeft h=761`、`resPanel 413/923`；页面滚动 300px 后 `colTop 36→0`（固定住）；列表滚动 200px 后 `pageTop 300→300`（页面不动）。
- **测试**：`tests/isolated-scroll.test.ts` 新增 2 项（左列固定与 breakpoint、资源面板不被固定高度锁死）。浏览器验收新增 5 条：其中 4 条用独立 iframe 在 1500px 宽下验证布局本身（资源列表独立滚动容器、左列固定且高度锁在视口内、页面滚动不带动左列与列表、两条滚动条并存），1 条在主页面验证滚轮边界 `defaultPrevented`。
- **踩坑（记入 pitfalls 第 20 条）**：验收浏览器视口只有 756px，落在窄屏断点内，宽屏规则根本不生效，必须用 iframe 指定宽度验证；且 iframe 内**不执行脚本**，合成 `WheelEvent` 不会触发监听器，`defaultPrevented` 恒为 false——滚轮断言只能放在主页面。
- **验证**：`npm run check` 全绿——716 项模块测试、VM 回归、浏览器验收 563 项 RESULT: PASS、类型检查与生产构建。

## 2026/10/21 beta 0.9.19 独立滚动区（isolated scroll）

- **新增 `src/vue/isolated-scroll.ts`**（通用原语，不与资源面板绑定）：`useIsolatedScroll({ attribute })` 返回 `container`（模板 ref）与 `overflowing`（内容是否超出）。`canScrollIn(element, deltaY)` 是纯粹的边界判定函数，可单独测试。
- **解决的问题**：浏览器本身会在元素还能滚动时把滚轮留给元素，问题出在**边界**——列表滚到顶/底后滚轮会链式传给页面，玩家本想继续浏览列表却丢了位置。CSS 的 `overscroll-behavior: contain` 覆盖大部分场景；composable 补上 CSS 表达不了的部分：只在**该方向真的还能滚动**时才接管，短列表不劫持滚轮。
- **实现要点**：`wheel` 监听必须 `{ passive: false }`，否则无法 `preventDefault`，而链式滚动发生在默认动作里。用 `watch(container, ..., { flush: 'post' })` 而非 `onMounted`，因为 `v-if` 切换会让模板 ref 指向新节点。用 `ResizeObserver` + `MutationObserver` 让 `overflowing` 随内容变化更新（资源解锁会改变行数）。
- **CSS 分工**：`.isolated-scroll{overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}` 负责布局与浏览器原生行为；`.resource-panel.isolated-scroll{max-height:calc(100vh - 200px)}` 给它一个上限，窄屏单独 `60vh`。composable 只管行为，不管高度。
- **测试**：新增 `tests/isolated-scroll.test.ts`（5 项：边界判定、水平滚轮不误伤、composable 暴露的 ref/flag、CSS 两半都在、资源面板确实复用而非自己写监听）。浏览器验收新增 6 条真实 DOM 断言（独立滚动容器、短列表不劫持、压缩容器制造溢出、列表内滚轮页面不动、到底 `defaultPrevented=true`、到顶同理）。
- **踩坑**：滚动断言块最初放在脚本靠前位置，导致后续用例失败——`WheelEvent` 与 `scrollTop` 操作改变了页面滚动位置，而后续用例依赖页面在顶部。定位方式是用 `git stash` 分别回退功能代码与测试块，确认「只有测试块存在时失败」，最终把该块移到脚本末尾（`mounted.app.unmount()` 之前）。记入 `docs/notes/pitfalls.md` 第 19 条。
- **验证**：`npm run check` 全绿——714 项模块测试、VM 回归、浏览器验收 562 项 RESULT: PASS、类型检查与生产构建。

## 2026/10/21 beta 0.9.18 重写 AGENTS.md：补充协作与工程约束

用户要求把几条长期有效的注意事项写进 `AGENTS.md`，并接受了我建议的三条补充。全文改为中文（此前为英文），结构从两节扩展为五节。

- **一、协作原则**（用户提出的 5 条 + 建议的 3 条）：
  1. 顺手发现的 bug 按**影响面**分流：只影响显示/文案/样式/日志 → 直接修；涉及存档兼容、数值平衡、数据删除、机制语义、跨模块行为 → 先问。判断不清按先问处理。
  2. 认为任务不妥、缺信息或有更优解时**大胆指出并提问**，不为顺从执行有问题的方案。提问要具体可决策。
  3. 与特定模块无关的技术抽成可复用模块（正例：`focus-layout.ts`、`construction-rows.ts`、`military.ts`）。
  4. **反过度抽象**（建议补充）：复用必须基于 ≥2 个真实调用点，不为想象中的需求提前设计；判断标准是「删掉这层抽象代码是否明显更短更清晰」。
  5. 可维护性：单向依赖 `data → simulation → vue`、显示与结算同源、单一真相、改动收敛（优先加文件而非改十个文件）、不留死代码。
  6. **改前先定位权威文件**（建议补充）：先查 `docs/agent-map.md`，全仓 grep 是最后手段。
  7. **测试必须真的能失败**（建议补充）：断言写具体值与不变量，修 bug 先写复现测试确认变红。
  8. 测试分级：文档改动不跑测试，模块显示逻辑跑关键字测试，模拟层跑全量，界面改动加浏览器验收，收尾一律 `npm run check`。
- **二、存档兼容**：原有内容保留，措辞统一为中文。
- **三、Agent 工作流**：原有内容保留（文本工具、`tmp/`、验证顺序、存档夹具、浏览器验收、提交回滚、模型路由与并行），补充「并行写代码时先登记写入范围」。
- **四、文档同步纪律**（新增）：7 条必做清单——`updatelog.md`、`docs/update-log.md`、`glossary.md`、`technical-details.md`、`agent-map.md`、版本号（区分展示版本与 `CONFIG.version`）、`pitfalls.md`。
- **五、参考资料**：指向四份配套文档。
- **验证**：`npm run check` 全绿——709 项模块测试、VM 回归、浏览器验收 556 项 RESULT: PASS、类型检查与生产构建；`tests/markdown.test.ts` 确认新文档无 emoji 且标题结构合法。

## 2026/10/21 beta 0.9.17 专注布局与科技树换行

- **新增 `src/vue/focus-layout.ts`**（可复用的「专注布局」原语）：`useFocusLayout({ activePanel, requests })`，`requests` 是「标签页 id → 判断函数」的表。面板只声明**什么时候**需要整幅宽度，不碰 DOM、不改布局。返回 `active` / `isFocused` / `layoutAttributes`（`data-focus-layout`、`data-focus-panel`）/ `release()`。
- **为什么用 `computed` 而不是 `watch`**：第一版用 `watch([activePanel, ...sources])` + 手写依赖数组，谓词里读的 ref 忘了列就**静默不更新**，测试直接抓到。改成 `computed` 后 Vue 自动追踪谓词内读到的一切，调用方不需要维护依赖列表。这条写进了 `tests/focus-layout.test.ts` 的「a predicate that reads reactive state re-evaluates without an explicit dependency list」。
- **键必须与 `activePanel` 的值同源**：最初 `requests` 用面板名 `techTree` 作键，而 `activePanel` 存的是标签页 id `tech`，谓词永远查不到、布局永不生效且不报错。改为按标签页 id 作键，并补「a mismatched predicate key is ignored instead of silently never firing」守住这个不变量。
- **清理用 `onScopeDispose`**：`onUnmounted` 只在组件实例内触发，裸 `effectScope` 里不跑，测试无法覆盖「销毁后不残留」。`onScopeDispose` 两者都覆盖。
- **CSS**：`.layout[data-focus-layout]>.col-right{display:none}` 无条件生效；列宽改写 `minmax(0,1fr) minmax(0,3fr)` **限定在 `min-width:861px`**。原因：≤860px 时布局本来就是单列，改写列宽会把中间列从满宽压成 3/4 宽——浏览器验收在 756px 视口下测出 `721 → 526`，正是这个 bug。
- **科技树换行**：`tech-tree.ts` 新增 `TECH_NODES_PER_ROW = 10`；`layoutTechTree` 改为累积 `cursorY`（每层占 `(rows-1)×46 + 110`），节点带 `row` 字段，`levels[].rows` 记录行数，`height` 用 `cursorY` 而非 `levels.length × 110`。T8/T9/T10/T12/T13 各为两行，树宽不再随最大层级增长。
- **测试**：新增 `tests/focus-layout.test.ts`（7 项：派生而非锁存、未登记面板不能抢占、`release()`、销毁清理、自动依赖追踪、键不匹配、App 接线与 CSS 断言）。`tests/tech-tree.test.ts` 改写原有「同层同一行」断言为「每行 ≤10 且行数正确、行内 x 等距 200」，并新增换行专项测试。浏览器验收新增 8 条（右列显隐与恢复、宽度变化在宽屏/窄屏两种预期、真实 DOM 每行 ≤10、全量科技树换行分布）。
- **验证**：`npm run check` 全绿——709 项模块测试、VM 回归、浏览器验收 556 项 RESULT: PASS、类型检查与生产构建。

## 2026/10/21 beta 0.9.16 科技悬停分类副标题

- **不需要新增数据字段**：`TechnologyDefinition.desc` 早就存在（flavor 文本，`TooltipPanel` 一直在渲染），本次要的是「只写类型」的一行，所以直接从上一版的 `TECH_CATEGORIES` / `TECH_CATEGORY_META` 派生，不新增 203 条手写字符串。
- **实现**：`TipContent` 新增 `subtitle` 与 `subtitleCategory`；`TooltipPanel.vue` 的 `tech` 分支用 `techCategory(id)` 查类别、再 `TECH_CATEGORY_META.find(...)` 取名，写入两个字段。模板在 `<h3>` 之后、`tip-desc` 之前插入 `<p class="tip-subtitle" :data-tech-category="...">`。
- **样式陷阱**：`assets/css/style.css` 有一条 `body button *,body .building-tooltip,body .building-tooltip *{color:var(--text)!important}` 会把 tooltip 内所有后代文字强制成主题色。副标题规则必须写成 `body .building-tooltip .tip-subtitle{...!important}` 才压得住，否则文字正确但颜色永远是 `rgb(223, 211, 171)`——浏览器验收直接断言了 `rgb(224, 182, 74)` 才抓到这一点。
- **同源保证**：副标题颜色复用科技树边框的七个 CSS 变量值，`tests/tech-categories.test.ts` 断言七类的 `.tip-subtitle[data-tech-category="X"]` 都使用 `TECH_CATEGORY_META` 里声明的色值，并且副标题渲染位置在 `<h3>` 之后、`tip-desc` 之前。
- **测试**：模块测试新增 1 项（副标题来源、渲染顺序、七色复用、名称不含数字）。浏览器验收新增 5 条（副标题文本与 category、位于名字下方、金色精确匹配、不含数字、切换科技后文本与颜色同步变化）。
- **验证**：`npm run check` 全绿——701 项模块测试、VM 回归、浏览器验收 548 项 RESULT: PASS、类型检查与生产构建。

## 2026/10/21 beta 0.9.15 科技分类配色与退役科技隐藏

- **新增 `src/vue/tech-categories.ts`**：`TechCategory`（7 类）、`TECH_CATEGORY_META`（名称 + 边框色）、`TECH_CATEGORIES`（`TechnologyId → 类别` 全量映射）、`techCategory(id)` 查询函数、`RETIRED_TECHNOLOGIES` 列表。分类只按科技内容判断，不按它解锁的建筑在哪个页面：**普通发电设施统一归「生产与工业」**，只有戴森球/彭罗斯球体这类巨构与探索定居设施留在「太空与异星」。
- **配色**：里程碑 `#e0b64a`（沿用旧 `is-key-tech` 金色）、生产 `#9fae4e`、民生 `#4fa695`、军事 `#cf5a52`、太空 `#5b96dd`、数字 `#a97ad4`、特殊 `#c4bfae`。全部在按钮背景 `#292824` 上达到 ≥3.6:1 对比度（`tests/tech-categories.test.ts` 用 WCAG 相对亮度直接断言 ≥3，并断言被替换的默认边框 `#393631` 只有 <1.5）。
- **双重线索**：颜色写在 `data-tech-category` 上、经 CSS 变量落到 `border-color`；同时 `::before` 在按钮左上角画一个同色 5px 圆点。红绿色盲模拟下「生产/军事」的色差会从 66 降到 25，只靠颜色不可分，圆点是必要的兜底。里程碑额外保留原有内发光，其余类别不发光（否则整页都在亮）。
- **退役科技隐藏**：`TechPanel.vue` 用 `visible = all.filter(id => !RETIRED_TECHNOLOGIES.includes(id))` 同时供「可研究」与「已研究」两栏使用，`energyStorage`/`batteryConcentrationRing` 因此彻底不显示。它们**仍留在 `TECHNOLOGIES` 注册表**里，所以旧档 `validateSaveIds` 照常通过、已获得记录不丢；`isTechnologyUnlocked` 本来就已经拒绝它们，不可能被重新研究。
- **测试**：新增 `tests/tech-categories.test.ts`（7 项：全量覆盖 + 无未知 ID、七类非空且无单类过半、里程碑沿用旧金色与 `KEY_TECHNOLOGIES`、发电归生产、退役科技仍合法且面板过滤、两个按钮视图都带属性且 CSS 定义全部七色、对比度达标）。浏览器验收新增 4 条（类别标记、三色边框互异且色值精确、圆点同色、退役科技在两栏都消失）。
- **验证**：`npm run check` 全绿——700 项模块测试、VM 回归、浏览器验收 542 项 RESULT: PASS、类型检查与生产构建。

## 2026/10/21 beta 0.9.14 修复占领加成未显示在收支明细

玩家报告：占满敌对国家后，资金收支明细左列看不到「税收 −10%」，也没有「产量 +5%」。排查确认两项加成**一直正常生效**（wood ×1.05/×1.15、taxBase 100→50→0），只是 `calculateResourceFactorRows` 从未为它们生成行——所以数字对不上，玩家无从确认。

- **产量加成行**：`resource-breakdown.ts` 新增 `addGlobalOutputRows()`，在资源行末尾调用 `pct('占领 ×N', occupationOutputMultiplier(state))` 与 `pct('世界统一', unificationOutputMultiplier(state))`。位置与 `幸福度` 一致（都是「整条资源被放大」），顺序在最后。**`energy` 提前返回**：电力是固定供给预算，`settlePowerPlants` 从不乘 `calculateGlobalOutputMultiplier`，给它加行反而会撒谎。
- **税收惩罚行**：`catTax` 分支新增 `占领 ×N 税收惩罚 −X%` 与 `实际税率 Y%` 两个子行，数值来自 `occupationTaxRate`（与 `calculateTaxBase` 同源）。同时把 `catTax` 从「`value !== 0`」过滤里豁免：三个占领国把实际税率压到 0 时，正是最需要这条解释的时刻，整行消失会让玩家只看到「资金 +0」。
- **世界统一**：统一后 `activeOccupations` 恒为空，`occupationOutputMultiplier` 自动回到 1，所以占领行自然消失、只留「世界统一 +25%」——不需要额外分支。
- **测试**：`tests/world-unification.test.ts` 新增「the resource detail lists the occupation output bonus and the tax penalty」，覆盖无占领 / 1 国 / 3 国（税率为 0）/ 世界统一 / 电力五种情况，并断言统一后占领行消失。浏览器验收新增 2 条（资源明细左列出现「占领 ×1 +5%」、资金明细出现「占领 ×1 税收惩罚 −10%」与「实际税率 10%」）。
- **验证**：`npm run check` 全绿——693 项模块测试、VM 回归、浏览器验收 538 项 RESULT: PASS、类型检查与生产构建。

## 2026/10/21 beta 0.9.13 士兵毛皮改由战斗力决定

- **平衡性调整**：`ironEquipment` 的 `effects` 去掉「士兵毛皮产量+20%」；`government.ts` 的 `calculateFurMultiplier` **整个删除**（它只服务于那一条加成），调用点全部改为新函数。
- **新公式**：`data/military.ts` 新增 `SOLDIER_FUR_BASE = .2` 与 `SOLDIER_FUR_POWER_EXPONENT = .5`；`government.ts` 新增 `soldierFurPerSoldier = .2 × 战斗力^0.5` 与 `soldierFurRate = soldiers × 该值`。`production-finalize.ts` 用它替换 `soldiers × .2 × calculateFurMultiplier`。
- **为什么开方**：裸装 √1 = 1 精确复现旧的 0.2/s，旧档手感不变；满装 √5 = 2.236 → 0.447/s。平方根让「百分比加成」（军政 +20%、泰坦之力 +5%/级）对毛皮的效果减半，同时保证整条来源次线性——工厂毛皮按乘算增长（生产线 × 量子制造 × 幸福度 × 全局倍率），量级必然压过士兵采集，符合「毛皮主力是工厂、士兵只补贴早期」的设计目标，且不需要任何硬性断点。
- **明细同源**：`resource-breakdown.ts` 的 `soldierFur` 行改为「基础 `soldiers × 0.2`」+「`单兵战斗力` 百分比子行」（系数 = `soldierFurPerSoldier / 0.2`），删掉旧的「铁质装备」行；`InternalPanel.vue` 新增「士兵毛皮采集」行（`data-soldier-fur` 总速 / `data-soldier-fur-per` 单人速）。
- **构建桥接**：`scripts/generate-legacy-data.cjs` 的 registry 新增 `['military-data', 'data/military']`，且必须排在 `government` 之前——`government.ts` 现在在模块顶层读 `SOLDIER_FUR_BASE` 等常量，漏登记会让所有 VM 回归抛 `SOLDIER_FUR_BASE is not defined`。
- **兼容**：无新增存档字段，`CONFIG.version` 保持 33。旧档载入后毛皮速度按已研究科技重新推导，裸装档与旧版数值完全一致。
- **测试**：`tests/soldier-stats.test.ts` 新增 3 项（公式与裸装 0.2/s、结算与 tooltip 同源、工厂毛皮量级压过士兵毛皮），并改写 `test-factory-upgrades.cjs` 的毛皮用例（原本断言铁质装备 ×1.2，现在断言 ×√2 与满装 ×√5）。浏览器验收新增 2 条（军事页面板显示 0.447、毛皮明细出现「单兵战斗力 +123.61%」且不再提铁制装备）。
- **验证**：`npm run check` 全绿——692 项模块测试、VM 回归、浏览器验收 536 项 RESULT: PASS、类型检查与生产构建。

## 2026/10/21 beta 0.9.12 单兵战斗力/防御力与四项装备科技

- **平衡性调整**：`calculateCombatPower` 不再用 `ironEquipment ? 2 : 1` 作为倍率，改为「固定加算 × 百分比」。`src/data/military.ts` 新增 `SOLDIER_BASE_COMBAT_POWER = 1`、`SOLDIER_BASE_DEFENSE = 0`、`COMBAT_POWER_TECH_BONUS`（铁制装备/新型单兵装备/高级热武器/磁轨炮各 +1）、`DEFENSE_TECH_BONUS`（铁制装备/新型单兵装备/凯夫拉纤维/磁轨炮各 +1）、`DEFENSE_CASUALTY_REDUCTION = .1`。铁制装备的旧档等效战力不变（同为 2），只是从倍率变成加算，因此后续装备能继续叠加。
- **新增机制 防御力**：`calculateSoldierDefense` 纯由 `state.tech` 推导，`defenseCasualtyMultiplier = 1 / (1 + 防御力 × 0.1)`，乘在 `previewRaid` 的 `expectedLosses` 与 `retaliate` 的损失上。**它不进入 `raidStrength`**，所以防御科技不会顺带变成进攻科技；`tests/soldier-stats.test.ts` 直接断言 `strength`/`required` 完全相同。
- **四项新科技**（`data/technologies.ts`）：`newInfantryEquipment`（T7，30000 知识，`pre: ['recruitTraining']`）、`advancedThermalWeapons`（T9，70000 知识 + 2500 石油，`pre: ['oilTechnology']`）、`kevlarFiber`（T11，120000 知识 + 1000 聚合物，`resourceRequired: 'polymer'`）、`railgun`（T12，180000 知识 + 1000 铱，`resourceRequired: 'iridium'`，`desc: '电磁发射步枪，这个好喵'`）。四者均为显式 `tier` + `knowledgeCost`，`initializeTechnologyCosts` 不会覆盖显式价格。
- **界面**：`InternalPanel.vue` 的单兵战斗力/防御力数字改为可聚焦的 `[data-soldier-combat]`/`[data-soldier-defense]` span；`TooltipPanel.vue` 新增 `soldier` 提示类型与 `soldierStatBreakdown()` 分支，逐行列出基础值、每项装备科技、军政与泰坦之力的百分比、当前合计与伤亡倍率。明细与 `calculateCombatPower`/`calculateSoldierDefense` 读同一批注册表，不会与显示数字不一致。
- **兼容**：没有新增存档字段，`CONFIG.version` 保持 33。战斗力/防御力在载入后按已研究科技重新推导，旧档战力不下降；`validate-unlocks.ts` 未新增白名单（新科技只是加在树末端，没有收紧任何已有前置）。
- **测试**：新增 `tests/soldier-stats.test.ts`（10 项：四项科技 tier/价格/前置/资源门槛、铁制装备改为 +1、四点防御上限、百分比放大固定值、防御力递减且不影响战力、预测伤亡与实际突袭一致、tooltip 明细与计算同源、逐项解锁门槛、存档往返、旧档战力不变）。浏览器验收新增 5 条（无装备 1/0、五项装备 5/4、战斗力来源明细、防御力来源与伤亡倍率、军政百分比行）。
- **验证**：`npm run check` 全绿——689 项模块测试、VM 回归、浏览器验收 534 项 RESULT: PASS、类型检查与生产构建。

## 2026/10/20 beta 0.9.11 外星定居、统一计划与世界统一

- **新增 T12 外星定居**（`alienSettlement`，200k 知识，`pre: ['planetaryExploration']`、`buildingRequired: 'asrielSpaceport'`）。`spaceControlTower`、`alienCasting`、`spaceIndustrialization`、`starRingStation` 的 `pre` 由 `planetaryExploration` 改为 `alienSettlement`，`spaceIndustrialization`/`starRingStation` 同时升到 tier 13。
- **旧存档兼容**：这四项是历史可合法研究的科技，收紧前置后不能让老档报「科技前置关系无效」。`validate-unlocks.ts` 新增 `ALIEN_SETTLEMENT_RETARGETED`：只容忍缺失的前置恰为 `alienSettlement`，其余前置照常严格校验；`isTechnologyUnlocked` 仍然对**未来研究**强制新前置（研究门槛与历史校验分离）。
- **新增 T13 统一计划**（`unifiedPlan`，325 知识，`pre: ['alienSettlement']`）。
- **新增特殊科技世界统一**（`worldUnification`，1474 知识，`tier: -1`，`pre: ['unifiedPlan']`）。新增 `TechnologyDefinition.occupiedNeighborsRequired`，`isTechnologyUnlocked` 在占领数不足时直接返回 false，因此它在占领全部 3 个国家前不出现在可研究列表；tooltip 显示 `所需占领敌对国家 n / 3`。
- **统一效果**：`neighbors.ts` 的 `occupationOutputMultiplier`/`occupationTaxRate`/`garrisonedSoldiers` 改为读 `activeOccupations`，`isWorldUnified` 为真时一律视为 0 个占领，所以旧的占领加成一并失效；新增 `applyWorldUnification`（在 `applyResearchSideEffects` 里、科技入列表后调用，幂等：只在还有占领时执行，清空 `occupied` 并写日志）、`unificationOutputMultiplier`/`unificationStorageMultiplier`（1.25）。`advanceNeighbors`/`executeRaid`/`previewRaid`/`isNeighborsUnlocked` 在统一后全部停用。
- **数值接入**：`calculateGlobalOutputMultiplier` 乘上 `unificationOutputMultiplier`；`storage.ts` 新增 `pushUnificationRow`，在 `calculateStorageTotals` 的普通资源循环里乘 `unificationStorageMultiplier`，明细行名「世界统一」，保证 tooltip 与总量同源。普通资源 = 非 `special` 且非 `crafted`。
- **界面**：`InternalPanel.vue` 在统一后把临近势力面板替换为 `data-world-unified` 区块，列出 `data-unification-bonus`（+25% 产量 / +25% 储量）。
- **测试**：新增 `tests/world-unification.test.ts`（12 项：外星定居 tier/前置/太空港门槛、四项重挂、旧档进度保留、统一计划、世界统一的三次占领门槛、研究后清空占领且加成替换、+25% 产量与储量、真实生产结算、统一后禁止突袭、存档往返、脏存档不能复活占领加成）。浏览器验收新增 7 条（四项科技在定居前隐藏、T12/T13 解锁链、世界统一面板与数值）；`test-asriel.cjs`/`test-asriel-core.cjs`/`test-moon.cjs` 的「授予全部科技」夹具排除三个新科技，避免 +25% 扰动既有数值断言。
- **验证**：`npm run check` 全绿——679 项模块测试、VM 回归、浏览器验收 529 项 RESULT: PASS、类型检查与生产构建。

## 2026/10/20 beta 0.9.10 分段建筑改为一次性工程、电力详情去掉「供给」

玩家报告：建成空间撕裂者后，旁边仍保留「3/100」的建造行，可以继续开第二座。根因是 schema 32 的拆分只把段数搬到建造态 ID，没有把「完成态存在」当作该工程的终点——`isConstructionBlocked` 依赖完成态条目的 `max`，而除 AGI 核心外都没有 `max`，于是购买、排队、面板三处全部放行。

- **数据模型**：`src/data/buildings.ts` 给全部 6 个完成态条目（`spaceRipper`、`dysonSphere`、`dysonSphereL2`、`penroseSphere`、`aiSupercore`，以及原有 `agiCoreComponent`/`agiAscensionCore`）补上 `max: 1`。`isConstructionBlocked` 因此对建造态统一返回 true，`isPurchaseAllowed`、`buyBuildingNow`、`buyBuildingsInBatch`、`requestPurchaseModule`、`queuePurchase` 全部自动拒绝。
- **面板**：新增 `src/vue/construction-rows.ts`（`withConstructionPhases`），把「建造态插在完成态之前」的逻辑从 `BuildingsPanel.vue` 抽成共享函数，并过滤掉已建成的建造态；`BuildingsPanel.vue` 与 `DigitalWorldPanel.vue` 共用它（后者此前完全没有建造态行，AGI 核心组件/飞升核心无法建造）。`DigitalWorldPanel.atLimit` 同步补上建造态上限判定。
- **存档**：`CONFIG.version` 升到 33，`save-compatibility.ts` 新增 `upgradeSchema32To33`/`dropFinishedConstruction`：完成态 ≥1 的工程把完成数夹到 1、建造态计数清零、`stoppedBuildings`/`workers` 的建造态记录清零、`queue` 中指向该建造态的条目移除、`powerActivationOrder` 里超过 1 的计数条目移除。**未建成的工程进度完整保留**，非法数值原样留给严格校验拒绝。归一化链改为 `upgradeSchema31To32 → upgradeSchema32To33 → normalizeAdditiveDefaults`，`normalizeSchema32Save` 更名 `normalizeAdditiveDefaults`（同时接受 32/33，因为 additive 默认值对两个 schema 都适用）。
- **电力详情**：`TooltipPanel.vue` 的电力分支不再把行名后缀改写成「供给」，只去掉 `产出/消耗/占用`；左列标题由「固定供给」改为「发电建筑」，行名直接是 `氢气发电站`、`戴森球` 这类建筑名。
- **测试**：新增 `tests/segmented-one-off.test.ts`（8 项：完成态 `max:1`、四条购买路径全部拒绝、未完成仍可买到第 100 段、排队条目被清理、schema33 迁移丢弃残留进度且不改输入、未完成进度保留、多座旧档夹到 1、真实旧档载入往返）；`segmented-split-migration.test.ts`、`segmented-queue.test.ts`、`dyson-sphere.test.ts` 改为断言「建成后无法再建」；`support-preview`/`pool-replay`/`hyperspace-energy`/`retired-tianxing` 里 `aiSupercore = 100` 的夹具改为 1。浏览器验收：AI 核心与空间撕裂者各新增/改写「建成后移除建造行」断言，并新增「电力详情发电列直接显示发电建筑名」。
- **验证**：`npm run check` 全绿——667 项模块测试、VM 回归、浏览器验收 522 项 RESULT: PASS、类型检查与生产构建。

## 2026/10/20 beta 0.9.9 分段建筑名称去除「（建造中）」

玩家反馈建造态建筑名里的「（建造中）」不美观。

- **改动**：`src/data/buildings.ts` 中 7 个建造态条目（`agiCoreComponentSegments`、`agiAscensionCoreSegments`、`spaceRipperSegments`、`dysonSphereSegments`、`dysonSphereL2Segments`、`penroseSphereSegments`、`aiSupercoreSegments`）的 `name` 去掉「（建造中）」后缀，与完成态同名。
- **区分方式不变**：面板本来就按两行渲染，行内数字即区分——建造行显示已建段数 0～100，完成行显示座数；建造行有购买按钮与「预约 N 段」，完成行带 `data-not-buildable` 且可开关供能。
- **无存档影响**：只改显示名，ID、schema、校验与迁移逻辑均未变。
- **顺带修复**：`TooltipPanel.vue` 对完成态 `aiSupercore` 仍按 `building.segmentedRequired` 拼装描述，而该字段只存在于建造态条目，悬停会渲染 `NaN /undefined`。现改为描述只保留 `world.exection(cat);`，分段进度与维护行统一由 `building-tooltip-rows.ts` 读取 `buildings.aiSupercoreSegments` 生成。
- **测试**：新增 `tests/segmented-naming.test.ts`（4 项：建造态与完成态同名、名称不含「建造中」、两条记录仍可区分、完成态核心提示不出现 `NaN/undefined` 且进度读的是建造态记录）；`tests/dyson-sphere.test.ts` 的收支明细断言由「戴森球（建造中）」改为「戴森球」。全量 659 项模块测试、VM 回归、浏览器验收 520 项 RESULT: PASS、类型检查与构建全部通过。

## 2026/10/20 beta 0.9.8 修复：无维护费用建筑的供能按钮误报短缺

玩家报告军营的供能按钮被标成黄色（短缺）。原因是 `isBuildingUnderworking` 用「启用数量 vs 结算输入」比较：军营这类效果直接生效、不经过结算的建筑，`result.inputUnits.barracks` 永远不存在，于是 `实际 0 < 期望 1`，被判为"未完全正常工作"。

- **改动**：`src/vue/building-status.ts` 增加结算足迹判定——没有 `input`、`output`、`workerOutput`、`powerPlant`、`support`、`moonSupport` 的建筑直接返回 `false`。这类建筑（军营、医院、社区中心、住宅等）没有可支付的维护，黄色短缺状态对玩家毫无意义，也无法通过任何操作消除。
- **未削弱真实告警**：有维护/产出的建筑（AI超级核心、实验楼、采矿自动化等）仍按原逻辑在欠费、缺电、缺人时显示黄色；`powerGrid.failed` 与采矿船缺员的告警路径未变。
- **测试**：`tests/barracks-toggle.test.ts` 新增 2 项——军营在正常状态下 `isBuildingUnderworking === false` 且 `inputUnits.barracks` 为 0；AI超级核心在氦-3 为 0 时仍被判为短缺（防止过度修复）。浏览器验收新增 1 条：军营供能按钮不带 `is-shortage`、`data-power-failed`、`data-crew-short`。
- **验证**：`npm run check` 全绿——655 项模块测试、VM 回归、浏览器验收 519 项 RESULT: PASS、类型检查与生产构建。

## 2026/10/20 beta 0.9.7 分段建筑拆分与戴森球分级

分段建筑此前用「一个计数器 + 两个布尔」表达两种状态：`buildings.aiSupercore = 57` 既不是完成态也不是空，而是"57% 的某个东西"，靠 `segmentedRequired` 与 `segmentEffects` 在 `housing.ts`、`power-grid.ts`、`purchases.ts`、`costs.ts` 四处隐含分支里解释。本次把它拆成两种**真正不同的建筑**。

### 新模型

- **建造态**：`*Segments` 条目，拥有成本、科技、`segmentedRequired: 100`，通过 `completesInto` 指向完成态。未建成时没有效果属性（戴森球与彭罗斯球例外，保留 `segmentEffects` 的每段部分产能）。
- **完成态**：沿用旧 ID，`cost: {}`、`buildable: false`，只有效果、没有成本，可正常开关供能。`state.buildings[完成态]` 的含义从"段数"变成"座数"。
- **转换**：`constructBuildingState` 在段数达到 100 时消耗 100 段、`+1` 完成态并记录一条「建造完成」日志；`agiAscensionCore` 完成后默认关闭（沿用原规则）。
- 新增 `dysonSphereL2Segments` / `dysonSphereL2`：2 级戴森球建在 1 级之上，每段 +7.5 电力，建成后额外 +750（与 1 级 500 合计 1250），1 级完成态保留不动。
- 新增科技 `dysonSphereII`（era 4 / tier 22 / 420 万知识 / 前置戴森球）。

### 存档迁移（schema 31 → 32）

`CONFIG.version` 升到 32，`normalizeSchemaSave` 显式升级 31：`完成态 = floor(n/100)`、`建造态 = n % 100`，`stoppedBuildings` 夹到完成数、建造态停用归零，`queue` 里的旧 ID 改写为建造态，`powerActivationOrder` 计数按完成数夹取。归一化只复制记录，不修改输入对象；非法数值原样留给严格校验拒绝，不做"修复"。

### 影响面

- 注册表 +8 条目（6 建造态 + 2 级戴森球两件），`ADDITIVE_BUILDING_IDS` 同步补齐，旧存档缺失的键按 0 回填。
- 建造面板按 `completesInto` 自动在完成态前插入建造态行，完成态行不显示购买按钮与成本。
- 删除"按段数折算完整单位"的部分分支；`costs.ts` 的分段固定价格、`queue-settings` 的批量段数仍以建造态为准。

**测试**：新增 `tests/segmented-split-migration.test.ts`（11 项：段数拆分、完成态迁移、停用夹取、队列重定向、激活顺序、输入不可变、幂等升级、真实 schema31 载入、完成态不可购买、2 级增量）；更新约 40 个受影响用例（戴森球/彭罗斯/撕裂者/AI 核心/2 级戴森球/三阶段/剧情/运行时/存档兼容）；浏览器验收更新 16 个断言块并新增 4 块。全量：653 项模块测试通过、VM 回归通过、浏览器验收 518 项 RESULT: PASS、构建通过。

## 2026/10/20 开发工具链：AI agent 效率（无玩法变更）

本次只改开发/验证流程，不触碰玩法、数值、界面与存档结构；玩家侧无需更新，故 `updatelog.md` 不新增条目。

- **测试自动发现**：`npm test` 改为 `scripts/run-tests.mjs`，递归发现 `tests/**/*.test.ts`。原 `package.json` 手工枚举 82 个文件，导致 `tests/retired-anomaly.test.ts` 长期未被执行的漏洞（本次纳入后共 642 项）。新增 `npm test -- <关键字>` 只跑相关文件，`npm run check:fast` 只做类型检查 + 模块测试。
- **浏览器验收可诊断**：`acceptance.html` 头部增加经典脚本，把**模块解析阶段**的错误（此前会让页面永久停在 `running`）与未捕获异常写进 `#result`；`run-browser.cjs` 失败时打印过滤后的浏览器 console，并支持 `ACCEPTANCE_PAGE` 换页调试。新增 `tests/browser/failure-selftest.html` 与 `tests/browser/README.md` 用于验证与说明。
- **存档 fixture 生成器**：`npm run fixtures:make -- <git-ref> <name>` 用 git worktree 检出旧版本、复用当前 `node_modules`，跑旧版自身 `createInitialState` 导出真实存档，避免手搓 JSON 被旧版校验拒绝。
- **编码事故防护**：`.gitignore` 增加 `tmp/` 作为探针与复现页的专用目录；`AGENTS.md` 增加「Agent workflow」一节，明确禁止用 shell 文本管道往返中文文件（此前 `Get-Content | Set-Content` 把 `updatelog.md` 写成乱码）。
- **索引文档**：新增 `docs/agent-map.md`（分层、权威文件表、8 条改动配方、大文件导航、命令速查、实测耗时）与 `docs/notes/pitfalls.md`（7 条已付代价的坑）。
- **实测耗时**（推翻「跑测试很贵」的直觉）：typecheck 约 9 秒、全量模块测试约 7 秒、浏览器验收约 5 秒、构建约 2 秒，`npm run check` 全部约 25 秒。真正的成本是盲目迭代，不是跑测试本身。
- **验证**：`npm run typecheck` 通过；`npm test` 642 项通过、VM 回归 20 项通过；`npm run test:browser` RESULT: PASS；`npm run build` 通过；`tests/markdown.test.ts` 6 项通过（文档无 emoji）。

## 2026/10/20 beta 0.9.6 军营开关与士兵上限

士兵容量会直接压低幸福度（`calculateSoldierPressure` 按容量线性计入惩罚），而军营一旦建成就会永久抬高容量——误建多座后无法回收，产量被长期拖低。本次给军营加上与其它设施一致的开关，并明确规定「士兵数量不得超过上限，超出部分立即移除」。

- **军营可开关**：`barracks` 增加 `toggleable: true`（军营没有电力/资源维护，因此开关不受 `hasContinuousEnergyInput` 的技术限制，研究军事并建成后即可使用）。按钮与其它设施相同：左右两个按钮分别关闭/开启一座，支持 Ctrl×10、Shift×25、Alt×100。
- **士兵上限与容量口径**（`simulation/government.ts`）：
  - 新增 `calculateArmyLimit`：**士兵上限** = 运行的军营 ×2 + 运行的太空驻军 ×2 + 运行的世界模拟器 ×4。只看「是否关闭」，不看是否付费。
  - 新增 `clampSoldiersToArmyLimit`（`simulation/military.ts`）：士兵数超过上限时**立即削到上限**，并清零训练进度；返回被移除人数，未超限时不做任何写入。
  - `calculateOperationalSoldierCapacity`（可训练容量）在上限基础上再要求太空驻军完整付费、世界模拟器已供能：资源不足只**暂停训练**，不会删除士兵，避免一次缺油把整支军队清空。
  - `calculateSoldierPressure` 与 `calculateMorale` 改用运行口径，关停军营立刻减轻幸福度惩罚（军事体制 +50%、猫猫凝聚系数照常作用）。
  - `calculateSoldierCapacity` 保留原语义（拥有量口径），供存档校验与容量型军队压力的既有调用点使用。
- **超限即移除的执行点**：关闭军营（`setBuildingPowerEnabled`）→ 立刻削顶；每个 tick（`advanceGameTick`）→ 兜底削顶；载入/导入存档（`runtime.enforceArmyLimit`）→ 削顶并写一条日志说明移除了多少名士兵。
- **界面**：军事页显示「士兵：N / 上限」与「士兵上限 / 可训练容量」说明；容量已满时的提示改为「建造更多军营或开启已关闭的军营」；军营悬浮详情的「士兵容量」行说明关闭会立即取消名额并移除超编士兵。
- **兼容**：未改 schema、字段或存储格式。开关状态沿用既有的 `stoppedBuildings.barracks`（该记录本来就存在且已被校验），旧存档读入后军营全部为开启状态；只有士兵数确实超过运行上限的存档才会在载入时削顶。

**测试**：新增 `tests/barracks-toggle.test.ts` 10 项——开关注册与技术前置、关闭后上限与压力同步下降、士气结果实际回升、超编士兵立即移除、上限内士兵保留、训练不越上限、资源不足只暂停训练不删兵、开关数量上下界收敛、削顶幂等、带关闭军营的存档往返。`tests/reported-save-recovery.test.ts` 与 `tests/outer-space.test.ts` 更新为「校验放行 + 上限削顶」的新语义；浏览器验收新增 7 条：军营开关初始全开、关闭一座压力 -2、全关压力归零、上限内士兵保留、关停后超限立即移除、全关后归零、重新开启恢复。

## 2026/10/20 beta 0.9.5 读取修复：士兵超过容量不再拒绝存档

玩家报告更新后旧档进入保护模式。用其实存档（`tests/fixtures/reported-soldiers-over-capacity-schema31.json`）复现，错误消息是 `士兵数据无效。`，唯一原因是 `validate-civilization` 行的 `soldiers` 上限取了 `calculateSoldierCapacity`（拥有量口径）：该档 35 座军营 + 1 座太空驻军 = 72 个名额，实际有 73 名士兵。

**为什么会出现 73 > 72**：训练（`advanceSoldierTraining`）使用的是**运行口径** `calculateOperationalSoldierCapacity`，只统计完整付费运行的太空驻军与（数字世界的）世界模拟器；校验用**拥有口径**（不看运行状态、并把世界模拟器计入）。两者在太空驻军停机、缺电、缺人而停运时就会不一致——玩家合法训练出的士兵会让存档在自己手上被判非法。这正是 `calculateSoldierCapacity` 注释强调「停机或饥饿不得删除已有士兵」所预设的情形。

- **改动**：`soldiers` 校验改为只要求 `[0, MAX_SAFE_INTEGER]` 的安全整数，不再与当前容量比较。士兵是已获得进度，任何来源造成的差额（停机驻军、退役容量、临近势力伤亡）都不得让存档无法载入。`训练进度无效` 的交叉校验保留：`trainingProgress > 0` 且士兵已达拥有容量仍然拒绝，因此非法进位依旧逃不过。
- **行为不变**：超编时不训练——`advanceSoldierTraining` 仍以运行口径为上限停止并清零进度（新测试锁定）；军事页显示的仍是拥有容量与实际士兵数。
- **兼容**：未改 schema、字段或存储格式。被此规则拒绝的原档无需任何操作，更新后重新载入即可自动退出保护模式（原档全程未被覆盖）。
- **后续变更（beta 0.9.6）**：按玩家要求改为「士兵数量不得超过上限，超出部分立即移除」，因此本条中的「73 人原样保留 / 超编只暂停训练」已被 0.9.6 的上限削顶取代；载入仍不会被拒绝，只是超出的士兵会被削到上限并记录日志。

**测试**：新增 `tests/reported-save-recovery.test.ts` 5 项——该真实存档可载入且军队 73 人原样保留、坐实 73 > 72、超编时不训练而扩容量后恢复训练、放宽仅限容量检查（负数/小数/字符串士兵、`trainingProgress=30`、超编时的非零训练进位、负数伤兵、退役 schema 仍全部拒绝）、修复后再导出可再次载入。

## 2026/10/20 beta 0.9.5 治愈日志静默

医院在每次跨过整数进度时都写入一条「医院治愈了 N 名伤兵。」。一次偷袭留下几十名伤兵后，0.2 秒的 tick 会连续触发多次治愈，80 条的日志上限很快被这行例行维护记录刷满，把掠夺、伤亡、科技等真正需要阅读的事件挤掉。

- **改动**：`advanceHospital` 不再调用 `addLog`，同时移除因此不再需要的 `addLog` 引入。治愈本身、整数进位、`hospitalProgress` 归零、伤兵转回士兵序列以及返回值全部不变。返回值仍保留（调用方与测试按它判断本步治愈量），只是不再用于日志。
- **未变的可见反馈**：军事页的伤兵行与医院悬浮详情的「治愈伤兵 +1/游戏日」仍如实显示人数与速率，玩家依然能看到治愈在进行。
- **兼容**：未改动 schema 31、存档字段或本地存储格式；旧存档里已有的「医院治愈了…」历史记录照常保留显示，不做清理。
- **验证**：`tests/hospital.test.ts` 新增「healing a wounded soldier writes no log entry」（治愈仍发生、日志为空、既有日志不被改写）；浏览器验收新增一条「治愈伤兵不再写入日志」断言（治愈前后日志条数一致且无「治愈」字样）。另新增 `tests/previous-release-save.test.ts` 与两份上一版真实存档 fixture（见下条）。完整验证通过：633 项模块测试、经典 VM 回归、Edge 浏览器验收、类型检查与生产构建。

## 2026/10/20 beta 0.9.5 上一版存档回归测试

有玩家报告更新后旧档进入保护模式。排查结论：本次改动只删除了医院日志那一行，**没有触碰存档校验、字段或 schema**；用 beta 0.9.4 的构建真实导出的存档在 `validateCurrentSave` 与浏览器验收中均能正常载入。但排查过程发现「上一版存档一定可载入」这条要求**从来没有可执行的回归测试**——`save-compatibility` 与 `pre-beta0.6.5` fixture 都只覆盖更早的形态，临近势力/医院之后新增的字段（`wounded`、`hospitalProgress`、`neighbors`）没有上一版真实存档覆盖。

- **新增 fixture**：`tests/fixtures/pre-beta0.9.5-schema31.json` 由 beta 0.9.4 的构建本身生成（该版本的 `createInitialState` + 导出形状，含 `lastSaved`），不是按当前注册表手写，因此保留了「只有旧版才有的状态字段集合」这一特征。
- **新增 `tests/previous-release-save.test.ts`（5 项）**：上一版存档可载入且进度（人口/建筑/岗位/科技/威望资源）完整保留；缺失字段按升级默认值回填（`wounded` 0、`hospitalProgress` 0、`neighbors` 由存档自身字段确定性播种）；同一份存档两次载入结果一致且不修改输入；导出→再载入往返不丢字段；升级保持狭窄——退役 schema、外来建筑 ID、未知顶层字段仍被拒绝。
- **非法值仍拒绝**：`tests/fixtures/pre-beta0.9.5-schema31-malformed.json` 是同一上一版形状但携带越界 `hospitalProgress=5` 的存档，必须报「医院治疗进度数据无效」，证明默认值只补缺失字段、不修复显式错误数据。
- **兼容**：未改动任何生产代码的存档逻辑，schema 仍为 31。
- **验证**：`npm run check` 四步全部通过（633 项模块测试、VM 回归、Edge 验收、类型检查、构建）。若报告问题的存档仍无法载入，请用「设置→导出不兼容的旧版本存档」导出原始文本以便逐字段定位。


上一版提高了掠夺收益，但士兵几乎免费（仅 0.01 食物/秒），堆兵反复扫荡的循环缺少代价。本次同时调整两侧。

**军粮 0.01 → 2 食物/士兵/秒**

关键参照是农场：一名农民产出 2 食物/秒，同时作为猫口消耗 1 食物/秒，净产出只有 1/秒。因此 2/秒 的军粮恰好等于**一名士兵吃掉两名农民的全部净产出**。这让军队规模直接挤占食物预算，而不只是象征性扣一点。

实测校验（同一殖民地，只改变士兵数）：

| 士兵 | 净食物变化 |
|---|---|
| 10 | −20/s |
| 20 | −40/s |
| 30 | −60/s |

严格等于 `士兵数 × 2`。人口 20 时需要约 30 名农民才能供养 20 名士兵。

**掠夺基础时长 60 → 30 秒**

`baseSeconds` 是「一次行动相当于多少秒自身产量」的基准，减半即整体减半：

| 场景 | 偷袭 | 抢劫 | 扫荡 |
|---|---|---|---|
| 早期 经济30 | 296 → **178** | 750 → **457** | 1530 → **944** |
| 中期 经济60 | 4027 → **3130** | 10678 → **8436** | 22120 → **17635** |

行动等级系数（1 / 2.5 / 5 / 8）与敌国经济系数（0.5×～1.5×）不变，两个轴仍互相独立。

**一致性**：`resource-breakdown` 的「军粮」支出行读取同一个 `SOLDIER_FOOD_UPKEEP`，面板显示的军粮与实际扣除始终一致（已有测试锁定 `breakdown.net === rates.food`）。

**测试**：`tests/neighbors.test.ts` 的军粮用例改为断言精确值 2 并校验常量本身；`tests/raid-economy.test.ts` 新增「基础时长固定为 30 秒」用例，防止后续调参时漏改某个行动。

## 2026/10/20 beta 0.9.3 掠夺收益重做

beta 0.9.0～0.9.2 的掠夺公式是 `economy × haul / 4` 再按资源种数摊薄，一次偷袭只值零点几资源，整个临近势力玩法没有存在感。本次重做。

**新公式**

```
每种资源 → max(产量 × baseSeconds × 权重, 储量 × RAID_STORAGE_BASE × 权重)
         × 行动等级系数 × 敌国经济系数
```

- `baseSeconds` 60 秒 × `tierMultiplier`（1 / 2.5 / 5 / 8）——**行动等级**是独立的一个乘数。
- `RAID_ECONOMY_FLOOR + SPAN × economy/100`，即 0.5×～1.5×——**敌国经济**是另一个独立乘数。
- 两者相乘而非相加，所以「打弱国用高级行动」与「打富国用低级行动」是两条可比较的路线。
- 取 `max` 的原因是两种基准各有短板：只按产量算，前期产量近乎零时收益归零；只按储量算，后期仓库动辄上万会让掠夺失去意义。取较大值让新殖民地与后期殖民地都得到合理数量。
- 资源权重仍按档位递减（`1/(1+index*0.45)`），保证偷袭偏向基础资源。

**模块循环的处理**

`production` → `crafting` → `neighbors`（占领加成），若 `neighbors` 再直接 import `production` 就成环。因此新增 `src/simulation/neighbor-economy.ts` 负责构建 `RaidEconomyContext`（产量 + 容量），由调用方注入 `previewRaid` / `executeRaid`。这让掠夺计算保持纯函数，预览也能复用缓存。

**期间修掉的两个真实缺陷**

1. 最初用「产量 × 时长，再以 `储量 × 份额` 作为上限」的写法，结果小仓库时三个等级被同一绝对上限压平，等级与经济的差异全部消失。改为取较大值后两个轴才真正独立。
2. `App.vue` 的事件处理器直接调用 `executeRaid` 而没有传经济上下文，导致**实际游戏里掠夺恒为空**（只有预览有数字）。浏览器验收的日志断言暴露了它。现已统一收敛到 `commands.raidNeighbor`，UI 不再绕过命令层。

**测试**：`tests/raid-economy.test.ts` 6 项——等级梯度与配置一致、经济与等级可分离（富/穷比在各等级下相同）、收益随玩家规模放大、经济为 0 时仍有保底、掠夺范围受档位限制、容量取自真实存储规则。`tests/neighbors.test.ts` 与 `tests/raid-loot-log.test.ts` 的 fixture 补上真实产量（否则按新设计「没有产量就没有战利品」是正确的空结果）。

## 2026/10/20 beta 0.9.2 掠夺日志

军事行动此前只在日志里记录伤亡，掠夺到的资源进入库存却不留痕迹，玩家无从知道一次偷袭到底换回了什么。

- **新增 `describeLoot`**（`src/simulation/neighbors.ts`）：把 `RaidOutcome.loot` 渲染成「猫粮 12.4、木材 8.1、钢 2」。排在 `RAID_TIERS` 最后一级的资源顺序上，即基础资源在前、高阶资源在后，而不是依赖对象插入顺序——后者会随遍历实现变化，日志读起来不稳定。
- **数据来源是实际入库量**：`loot` 中每一项都经过 `granted > 0` 过滤，且已在 `state.resources[resource] += granted` 时写入，所以日志与库存严格一致（有测试逐项比对库存差值与日志数值）。
- **不产生空日志**：`describeLoot` 对空 map、零值、`NaN` 都返回空串，调用方据此跳过 `addLog`。被拒绝的行动（战力不足等）同样不会留下掠夺行。
- **与伤亡分行**：掠夺用 `progress`，伤亡用 `event`，两类配色不同，也避免了「阵亡 10，伤兵 5，掠夺 …」挤在一行难以扫读。
- 数字格式复用 `shared/format.ts` 的 `formatResourceNumber`，与资源面板同一套进位规则，不会出现日志写 1.2K 而面板写 1234 的情况。

**测试**：`tests/raid-loot-log.test.ts` 5 项——掠夺资源逐项出现在日志、日志数值等于库存增量、无战利品不写日志（含被拒绝的行动）、按档位顺序输出、掠夺与伤亡为两条独立记录。浏览器验收新增 2 条，实测输出形如「偷袭共联网络：掠夺 猫粮 0.45、木材 0.39、石头 0.28、铁 0.24、煤 0.18、铜 0.15、钢 0.14。」

## 2026/10/20 beta 0.9.1 医院

为上一版引入的「伤兵」补上唯一的出口——在此之前 `wounded` 只增不减。

**科技**（`src/data/technologies.ts`）
- `fieldHospital` / 战地医院：era 2、tier 5，前置 `military` + `science`，成本 5000 知识 + 20 钢板 + 800 资金。放在 `military` 之后是刻意的：伤兵只可能来自临近势力行动，而那条线需要军事。

**建筑**（`src/data/buildings.ts`）
- `hospital`：200 木材 + 150 水泥 + 15 钢板 + 200 资金，`costScales` 1.19，加入 `BUILDING_GROUPS` 的 `military`（军事设施）分组。没有 registry 机制字段，因为它不产出/消耗资源，效果完全由 `simulation/hospital.ts` 承担。

**治愈**（`src/simulation/hospital.ts`）
- 每座**运行中**（`buildings - stoppedBuildings`）的医院每游戏日治愈 1 名，即 `0.2/s`。
- 关键点是 `hospitalProgress` 小数累积：0.2s 的 tick 只能推进 0.04，若直接取整会永远为 0。只有跨过整数才移出伤兵，余数保留。
- 没有伤兵或没有可用医院时进度归零，避免「医院停机期间攒进度、恢复瞬间治好一个」。
- 治愈上限取 `min(伤兵数, 整数部分)`，不会凭空生成士兵。

**接入**：`tick.ts` 每步调用 `advanceHospital`；`building-tooltip-rows.ts` 显式渲染「治愈伤兵 +1/游戏日」（该建筑无 registry 字段，不会被通用行覆盖）；`InternalPanel` 军事页新增伤兵行，按有无医院给出不同提示。

**存档**：`hospitalProgress` 经 `normalizeSchema31Save` 回填为 0，校验区间 `[0, 1)`（它是进位值，超过 1 即损坏）；`hospital` 加入 `ADDITIVE_BUILDING_IDS`，旧存档的 `buildings/workers/stoppedBuildings` 三处记录都会补零，否则校验报「建筑数据无效」。schema 仍为 31。

**顺带修正上一版的自相矛盾**：上一版让 `trimAssignedCraftWorkers` 自动清零锁定配方的工匠，同时又让面板显示这些行供撤回——前者使后者成为死代码。现在裁剪只按名额生效，锁定配方的工匠保留，撤回按钮真正可用。`state.soldiers = 0` 的误判、`tick.js` 里 `advanceHospital is not defined`（桥接脚本漏注册 `simulation/hospital`）也一并处理。

**测试**：`tests/hospital.test.ts` 9 项，覆盖科技档位与前置、军事分组归属、每日治愈速率、短 tick 累积、无伤兵时归零、停机不生效、不超额治愈、闲置判定、旧存档回填与非法进位拒绝。浏览器新增 4 条，覆盖无医院提示、有医院显示速率、多座叠加、实际把伤兵转回士兵。

## 2026/10/20 beta 0.9.0 临近势力

政府页右侧新增「临近势力」，一个围绕现有士兵系统展开的掠夺玩法。

**数据与模拟**（`src/data/neighbors.ts`、`src/simulation/neighbors.ts`）
- 三个势力各自持有军事实力、经济实力、好感度。开局在各自区间随机（第一国最弱、第三国最强，区间不重叠），每游戏日缓慢增长，越强增长越快，上限为出生区间上限的 2 倍。
- `raidStrength = 士兵数^0.75 × 单兵战力`。用 3/4 次方而非线性：4 倍兵力只换来 2.83 倍战力，精英兵仍有价值，但数量也不会失去意义。最初用平方根，实测 100 名士兵（战力 10）打不动最弱国家（需 12.18），门槛过高，遂改为 3/4 次方。
- 掠夺资源按行动等级取白名单，且**刻意排除** 能量（每步预算而非库存）、知识/字节/加密数据（研究链必须自己走）与资金（税收才是正当途径，且占领本身会降低税收）。高等级资源按序降权，所以偷袭以食物木材为主，扫荡才真正给钛。
- 伤亡随机浮动，约三分之一定义为伤兵（`wounded`，不可参战）。占领需存活 ≥ 20，成立后写入 `occupied`。
- 好感归零触发反击：按对方战力扣士兵、随机一种非特殊资源按 12% 掠夺，好感回到 10%。

**接入既有系统**
- `calculateGlobalOutputMultiplier` 增加占领乘区（每国 ×1.05，作为**一个**因子而非逐国连乘）。
- `calculateTaxBase` 扣除占领惩罚，`neighbors` 为可选参数以保持既有调用方兼容。
- `finalizeProduction` 把军粮计入 `foodDemand`，因此净食物产量、饥饿判定、`rates.food` 三者一致；`resource-breakdown` 同步新增「军粮」支出行，避免提示与实际结算不符。
- `tick` 每步调用 `advanceNeighbors`。

**界面**：政府页 `.settings` 加 `government-layout` 双列网格，右栏为势力列表；每国显示属性、守备战力、行动选择、派遣人数、战力/伤亡预估与可掠夺清单，已占领则显示驻军与撤出按钮。断点设为 860px，与 style.css 主布局一致。

**存档**：`neighbors`、`wounded` 两个新字段经 `normalizeSchema31Save` 回填，只补缺失字段，显式错误值仍走严格校验（`validate-neighbors.ts` 校验区间、未知 id、重复占领）。回填的随机数由存档自身的 `eventIn/lastSaved/time/clicks/soldiers` 播种，**否则同一份旧存档每次加载都会得到不同的势力数值**——这是实现过程中由幂等性测试暴露出来的真 bug。schema 仍为 31。

**测试**：`tests/neighbors.test.ts` 14 项，覆盖生成区间与顺序、解锁条件、占领产量/驻军/税收、门槛拒绝、伤亡与好感、占领存活门槛、反击、占领后停止增长与撤出、增长速率与上限、军粮、战力曲线、旧存档回填与畸形数据拒绝。浏览器验收新增 11 条，覆盖锁定态、三国渲染、属性显示、按视口排列、战力预估、按钮禁用/启用、实际扣兵与重新隐藏。

**排查记录**：回归测试暴露了三处需要修正的地方——`mastery-production` 的收支一致性检查发现军粮没进 breakdown（真 bug）、`starvation` 的离线/在线深比较因邻国随机而失败（测试需固定种子）、`power-save-compatibility` 与 `save-compatibility` 暴露回填不幂等（真 bug）。生成桥接脚本还需要显式注册 `data/neighbors`、`simulation/neighbors`、`state/validate-neighbors` 三个模块，否则 VM 里 `validateNeighbors is not defined`。

## 2026/10/20 beta 0.8.6 工匠分配可用性与代码清理

- **锁定配方的滞留工匠现在可见可撤回**。工匠列表此前用 `.filter(isResourceUnlocked)` 生成，而 `craftUsed` 统计的是全部 `craftWorkers`。秘银加上合金需求后，旧存档中分到秘银的工匠既不出产、也不显示、更撤不回来，但一直占着名额——玩家看到 `3 / 5` 却只有一行 `木板`。现在 `craftRows` 保留「已锁定但仍有分配」的行，并带 `data-craft-locked` 标注「（未解锁）」。
- **撤回不再被解锁判定拦截**。`changeCraftAssignment` 原先在函数开头对所有操作检查 `isResourceUnlocked`，于是刚显示出来的行点击「撤回」也无效。改为只有 `delta > 0` 才要求解锁——继续投入受限制，取回永远允许。这一条是前一条能真正生效的前提。
- **`calculateAutomaticCraftingMultipliers` 改为返回数字**。`input: 1` 从工匠大师改成「吞吐翻倍」那一刻起就恒为 1，也没有任何调用方读取：原料始终按 `amount`（已含吞吐）扣除。保留它只会让后来的人以为存在输入倍率可以调整。返回值现在是 `output` 倍率本身，`settleAutomaticCrafting` 里对应改名为 `outputMultiplier`。
- **移除 `CatsPanel` 的死字段** `recipe`：它把配方原料拼成字符串，但模板从未渲染（真正显示原料的是 `craftJob` 悬停提示）。连带删掉不再需要的 `orderedCostEntries` 导入。
- 测试：`tests/artisan-display-consistency.test.ts` 增至 6 项，新增「滞留工匠可撤回」与「输出倍率是单一因子且无输入项」。浏览器验收新增 4 条：锁定配方仍显示、标注未解锁、只禁分配不禁撤回、点击撤回确实释放名额。
- 排查记录：构造该验收 fixture 时连续踩到三条存档校验规则——`workers` 受 `calculateWorkerCapacity` 限制（2 座铸造厂只能放 2 名工人）、`buildings[id] = 0` 时 `workers[id]` 必须为 0、工人总数不得超过人口。最终 fixture 以「先分配、再用 `store.mutate` 抽掉解锁科技」的路径构造，这也是真实旧存档的形态。

## 2026/10/20 beta 0.8.5 工匠显示一致性与存档修正

审计发现并修复的问题，均为显示层或派生计算的偏差，存档契约未变：

- **工匠大师速率未反映到提示**：`craftJob` 悬停提示与 `CatsPanel` 的 `craftRows` 直接用 `CRAFT_RECIPES[id].rate`（0.05），而结算走 `artisanCraftRate`（工匠大师下为 0.1）。玩家看到的产出与原料消耗都只有实际的一半。两处改为读取 `artisanCraftRate`。
- **锁定配方仍占用工匠名额**：秘银配方在本版新增 `{ alloy: 25, iridium: 10 }`，`isResourceUnlocked` 要求所有原料解锁。若旧存档在合金解锁前就把工匠分给秘银，结算里 `continue` 跳过该配方，但 `trimAssignedCraftWorkers` 只按名额裁剪，工匠就此空转。现在锁定配方的分配会被清零，已解锁配方不受影响；无解锁上下文的精简状态（预览、旧调用方）保持只按名额裁剪的旧行为。
- **`NaN` 污染名额**：`trimAssignedCraftWorkers` 遍历全部配方时，若 `craftWorkers[id]` 缺失会得到 `undefined`，`spare -= undefined` 变 `NaN`，之后每个配方都被写成 `NaN`。改为把非有限值按 0 处理。
- **命名不一致**：铸造厂（`castingToolUpgrade`）与恒星熔炉的条目在 `building-tooltip-rows.ts` 里仍写作「锻造物产量」，而详细面板与科技里已是「锻造工具加成」。统一为「锻造工具加成」；粒子加速器在 `particleImbalance` 下的锻造物加成是另一条路径（`calculateCraftingMultiplier` 里的粒子加速器乘区），保留「锻造物产量」标签。
- **死代码**：删除 `calculateStellarForgeCraftMultiplier`。恒星熔炉的 +10% 已并入 `calculateForgingToolBonus` 的加算池，该函数没有调用者，留着只会诱使后续代码重复计入。
- 测试：新增 `tests/artisan-display-consistency.test.ts`（4 项），锁定速率的结算与显示一致、锁定配方释放工匠、精简状态不产生 `NaN`、力建筑提示标签。`tests/starvation.test.ts` 的工匠裁剪用例改用默认可解锁的木板配方并补上铸造厂，避免被新的解锁裁剪逻辑误清空。

审计同时确认下列部分**没有**问题：导出加密在 1/4/8 MB 存档上往返正确（46/156/317 ms）、基因合成代理的份额与库存核算自洽（100% 份额下写入 100 知识产出 100 知识等值 DNA 且不留存）、恒星熔炉 5 座带来的 1.5× 正是工具池 +50%。

## 2026/10/19 beta 0.8.4 导出存档加密

- 安全：新增 `src/state/save-cipher.ts`，导出走 AES-256-GCM（Web Crypto，零依赖）。封装格式 `MEOE1.<keyVersion>.<base64(iv‖ciphertext‖tag)>`，IV 12 字节、标签 128 位、每次导出由 `getRandomValues` 重新生成——GCM 下 nonce 复用会同时破坏机密性与完整性，这是该方案唯一的硬性红线。
- 导入：`decodeSaveText` 先按 `MEOE1.` 前缀判断，加密档解密、明文档原样返回，两条路径都汇入既有的 `JSON.parse → validateCurrentSave` 链路，因此校验规则没有任何改动。解密失败、密文被改动、密钥版本未知、载荷截断均抛出带 `kind` 的 `SaveCipherError`，不会以原始异常形式暴露给玩家。
- 变更面：`Runtime.importSave` 与 `Runtime.exportSave` 改为异步（`crypto.subtle` 全为 Promise）；新增 `exportSavePlaintext()` 供面板显示长度与测试断言。`SettingsPanel` 的导出/导入按钮改为 async，导入提示与占位符说明新格式。
- 密钥：`config.ts` 的 `SAVE_EXPORT_KEYS` 为 `Record<version, 64-hex>`，`parseSaveKey` 严格校验 64 个十六进制字符（32 字节）。版本号随格式一起写入，将来轮换密钥只需新增一项，旧导出档仍可解密。
- 边界：`crypto.subtle` 仅存在于安全上下文（https 或 localhost）。`vite --host 0.0.0.0` 用局域网 IP 访问时导出会抛出 `unsupported-environment` 并提示改用 https 或本机地址；明文导入不受影响。**保护模式的旧档导出不加密**，因为它可能是无法解析的原始字节。
- localStorage 的自动存档保持明文（`persistGame` 未改），加密只覆盖手动导出/导入这一条路径。
- 验证：`npm run check`通过：575 项模块测试（新增 `tests/save-cipher.test.ts` 6 项：密钥解析、往返、封装结构、篡改/截断/未知版本拒绝、明文兼容、无 `crypto.subtle` 时的降级）、经典 VM 回归、Edge 浏览器验收（新增 5 条加密断言）、类型检查与生产构建。

## 2026/10/19 beta 0.8.3 工匠基础速率与技工/工匠大师重做

- 平衡：`CRAFT_RECIPES.mithril` 的 `input` 增加 `alloy: 25`，即每份秘银 = 25 合金 + 10 铱。
- 平衡：所有锻造物的 `rate` 由 0.1 降为 **0.05**（每位工匠每秒份数）。`settleAutomaticCrafting` 以速率同时驱动产出与原料扣减，因此两者永远同步。
- 机制：`calculateAutomaticCraftingMultipliers` 只保留技工的 ×2 与超频锻造基因加成；「工匠大师」不再作为乘数，改由 `artisanCraftRate(baseRate, state)` 把速率翻倍（0.05 → 0.1），使产出与消耗一起翻倍。`input` 倍率恒为 1。
- 界面：`resource-breakdown` 的工匠产出行按 `artisanCraftRate` 计算期望值与「原料供应」比例，并把「技工」作为独立 +100% 行列出；工匠大师因已并入速率，不再单独成行。`CatsPanel` 与 `TooltipPanel` 的说明、锻造物速率同步为动态值。
- 兼容：schema31 与存档字段不变；秘银改为需要合金后，未解锁合金的存档在制作秘银前需先建工厂（属于正常解锁流程，不涉及存档迁移）。
- 验证：`npm run check`通过：569 项模块测试、经典 VM 回归（同步更新秘银扣料与 0.05 速率断言）、Edge 浏览器验收、类型检查与生产构建。

## 2026/10/19 beta 0.8.2 锻造工具加成统一为加算

- 平衡：`starRingStation` 与 `geothermalPlant` 的 `costScales` 各 −0.01（1.25→1.24、1.2→1.19）。
- 机制：锻造物加成明确分为**独立加成**与**锻造工具加成**两类。`crafting.ts` 新增 `calculateForgingToolBonus` / `calculateForgingToolMultiplier`：铸造厂（需锻造工具加成科技，每座 3%）、恒星熔炉（每座 10%）、行星铸造厂（每位受支持居民 3%）加算进同一个池，再以 `1 + Σ` 作为**单一**独立因子参与乘算，因此任意两个工具来源都不会互相放大。
- 机制：`calculateAutomaticCraftingMultipliers` 改为把技工/工匠大师计入工匠**基础产量**（`1 + 技工 + 工匠大师`，各 +100%，合计 +200%，不再是 ×4），只保留工匠大师的原料翻倍；两者不进入工具加成池，因此不会出现在加成一栏。`calculateCraftingMultiplier` 相应改为「全局倍率 × 工具加成池 × 粒子加速器 × 超频锻造」。
- 命名：科技 `castingToolUpgrade` 由「铸造工具升级」更名「锻造工具加成」，CRISPR 技工/工匠大师与行星铸造厂的说明同步为新语义。
- 界面：`TooltipPanel` 的锻造物详情在右列「消耗」下方新增「锻造工具加成」栏目（`data-tool-bonus-title`），列出合计与 `calculateForgingToolBonus().entries` 的每个来源；左列因子表只保留一条「锻造工具加成 +X%」的总值，不再拆分子项、也不再作为其他加成的子行缩进。
- 兼容：schema31 与存档字段不变；加成来源仍读取既有建筑、科技与 CRISPR 数据。
- 验证：`npm run check`通过：569 项模块测试（新增 `tests/forging-tool-bonus.test.ts` 4 项，锁定加算语义、技工不再乘算、结算只应用一次、科技更名）、经典 VM 回归、Edge 浏览器验收、类型检查与生产构建。

## 2026/10/19 beta 0.8.1 基因合成改为按比例抽取知识产出

- 机制：基因合成从「每座实验室 × 合成速率 × 2000 知识/s」的固定扣款，改为按比例抽取**本次实际正向知识产出**。实现方式与 dl.exe 完全一致：`genes.ts` 新增 `createGeneSynthesisPool`，包在 `createDigitalProductionPool` 的 Proxy **外层**，只在知识流入时（内层 Proxy 已完成下载截流之后）按份额扣减，因此不会动用库存、不会扣负收入，也永远拿不到 dl.exe 已截走的部分。
- 界面：`GeneSynthesisModal` 的 4 个滑条共享 100% 预算。`changeGeneSynthesisRate` 会把请求值夹到「100% − 其他三项之和」，即滑条互相牵制；面板新增总额度显示，并按真实知识产出换算每项的「知识/s → 碱基/s」。
- 兼容：`MAX_GENE_SYNTHESIS_TOTAL = 100` 与 `remainingGeneSynthesisBudget` 收敛在 `genes.ts`；`validate-genes.ts` 在逐项校验之外新增总和校验（超过 100% 抛错，正好 100% 合法），不静默改写玩家配置。碱基转化比例不变（每个碱基仍 200000 知识）。
- 清理：删除 `settleGeneSynthesis`、`GENE_SYNTHESIS_KNOWLEDGE_PER_PERCENT`、`GENE_SYNTHESIS_DNA_PER_PERCENT`；结算账本 oracle 与 `digital-production` 测试同步改为新语义。
- 验证：`npm run check`通过：565 项模块测试、经典 VM 回归、Edge 浏览器验收、类型检查与生产构建。

## 2026/10/19 beta 0.8.0 描述与效果在数据层分开

- 结构：`src/types/buildings.ts` 与 `src/types/technologies.ts` 新增 `effects?: string[]`，并把 `desc` 改为可选且**仅承载纯文字描述**。数据层因此有两个互不混用的槽位：`desc` 渲染在名称下方，`effects` 渲染在价格分割线下的「建筑效果」/「科技效果」区块。
- 内容：112 条建筑描述与 190 条科技描述逐条拆分（按句号切句、逐句判定是否含机制词），并把前置条件句（「需要建成完整的空间撕裂者」等）归入 `effects`。拆分保证原文不丢失。
- 默认：拆分后建筑仅 11 条保留描述、科技仅 16 条保留描述，其余为空，符合「描述默认为空、只有额外说明才写」的约定。
- 移除（仅建筑）：删除 `buildings.ts` 的 `effects` 字段（89 条）及 `BuildingDefinition.effects` 类型。建筑效果行全部由机制字段推导（`building-tooltip-rows.ts` 读取 output/input/cap/knowledgeCap/jobSlots/support 等），消除文本与数值漂移。
- 保留（科技）：`TechnologyDefinition.effects` 与 180 条科技效果文本保留并恢复渲染（`TipContent.effects` + `.tip-effect` + 「科技效果」区块）。科技解锁分散在建筑、资源、区域、任务等多个系统，没有可推导的单一来源，删除会导致玩家无法得知效果。
- 界面：三种采矿船的悬停不再显示「采矿船操作员在岗」实时数字（该信息保留在猫猫面板的合并岗位行），只保留每座成本行。
- 平衡：星环空间站每名 Asriel 居民效果 +0.5% → **+0.25%**；星环优化改为「基础值不变，每座受支持的外星材料实验室 +0.01%」，移除原先基础值 0.5%→0.6% 的提升。系数收敛到 `asriel.ts` 的 `STAR_RING_RESIDENT_BONUS` / `STAR_RING_LAB_STEP` / `calculateStarRingCoefficient`，结算与悬停共用。
- 修复：建筑描述此前只在 `TooltipPanel` 的 29 项 id 白名单内渲染，其余 16 条 `desc` 从不显示。白名单已删除，改为 `tip.description = building.desc || ''` 统一渲染；`iceMiningShip` 那条依赖旧描述文本的 `.replace()` 随数字迁移到 `effects` 一并移除。
- 界面：`TooltipPanel` 新增 `TipContent.effects`，以整句列表（`.tip-effect`）渲染，效果行不再套用「效果 / <句子>」的名值结构；科技悬停复用同一区块，标题为「科技效果」。
- 兼容：schema31 与存档字段不变；`desc`/`effects` 仅用于展示，不参与任何结算或存档。
- 验证：`npm run check`通过：564 项模块测试（新增 `tests/description-effects-split.test.ts` 4 项，锁定「描述不得含机制词、效果行不得是带句号的散文、多数条目无描述、效果渲染在价格之后」）、经典 VM 回归、Edge 浏览器验收、类型检查与生产构建。

## 2026/10/19 beta 0.7.9 实验室描述改为三行动态效果

- 界面：实验室的三条效果改为**建筑效果**区块（`content.rows`）中的行，渲染在价格分隔线下方，而不是标题下的描述区；行文本为 `猫猫科学家 +1` / `知识容量 +x` / `供能时知识容量 +x，电力-2`，第三行只在研究「电力」后出现。此前「知识容量」出现三次的重复已消除，`description` 保留一句风味文本。
- 修正：此前供电容量被写死为 2000，忽略 `calculateLabKnowledgeMultiplier`（科研卫星每座 +5%、ARPA研究所每个 +4%）的倍率。现在 `x = calculateStorageBonuses('lab', state, ...).knowledge`，供电值为 `2x`，与知识储量明细同源。
- 兼容：schema31 与存档字段不变；建筑 `desc` 恢复为一句风味文本（数值全部由动态行承担），不参与结算。
- 验证：`npm run check`通过：560 项模块测试（新增 `tests/lab-tooltip.test.ts` 3 项：三行结构与动态倍率）、经典 VM 回归、Edge 浏览器验收（更新实验室悬停断言）、类型检查与生产构建。

## 2026/10/19 beta 0.7.8 实验室供电只升级容量

- 平衡：研究「电力」后实验室每座仍请求 2 电力，但供电只把该座知识容量从 1000 提升到 2000，并覆盖未供电的 1000；未供电或供电不足的实验室照常保留猫猫科学家岗位与全部科学家产出。`power-consumers.ts` / `pool-replay.ts` 的 `inputUnits.lab` 改为运行中的实验室总数，`labUnits` 只统计获得供电的座数并用于容量换算；`power-grid.ts` 新增 `POWER_DEMAND_ONLY_IDS`，实验室的供电不足只写入 `failed`（黄色标记），不进入有效 `stoppedBuildings`。
- 界面：实验室建筑描述与悬停同步标注「供电后知识容量 +2000」「供电时电力 -2」及「猫猫科学家不受供电影响」。
- 修复（显示不实时）：知识储量明细中实验室的供电容量此前与被覆盖的基础容量同名（均为「实验室 ×N」），悬停去重把两行合并，于是无论是否供电都只显示一档容量。现供电部分单列「实验室 ×N（供电）」，并让 `storageSnapshot` 携带 `labUnits`，容量随供电开关即时增减（新增 `tests/lab-knowledge-capacity.test.ts` 回归）。
- 兼容：schema31 与存档字段不变；科技/容量数值规则未改，旧档实验室按当前供电状态自动换算容量。
- 验证：`npm run check`通过：557 项模块测试（新增 3 项）、经典 VM 回归、Edge 浏览器验收（新增 5 条实验室断言）、类型检查与生产构建。

## 2026/10/19 beta 0.7.7 幸福度超额产量加成减半

- 平衡：幸福度对全局产量的加成改为「超出 100% 的部分每 1% 只增加 0.5% 产量」。`src/simulation/multipliers.ts` 新增 `calculateHappinessMultiplier(happiness)`：`happiness ≤ 100` 时仍为 `happiness / 100`（每点 −1%），超过 100 时改为 `1 + (happiness − 100) × 0.005`（150% → ×1.25、200% → ×1.5）。`calculateProductionMultiplier` 改用它，地面、工厂、太空、文化与数字世界产出自动一致；电力与锻造物（`crafted`）照旧不受幸福度影响。
- 界面：`resource-breakdown.ts` 的「幸福度」因子行与资源明细备注改为调用同一函数（如 150% 显示 `+25%`、`×1.25`），避免显示与结算漂移；TipsPanel 的幸福度说明同步为新曲线。
- 兼容：schema31 与存档字段不变；幸福度实际值/有效值/上限的来源与规则未改动，历史存档的幸福度数值照常生效，无需迁移。
- 验证：`npm run check`通过：554 项模块测试（新增 `tests/happiness-production.test.ts` 3 项：曲线取值、结算与因子行一致、锻造/电力免疫）、经典 VM 回归、Edge 浏览器验收、类型检查与生产构建。

## 2026/10/19 beta 0.7.6 采矿船占用猫口

- 平衡：铱采矿船、铁采矿船各需要 1 个猫口，E-710采矿船需要 2 个，统一称为「采矿船操作员」；占用数由当前启用的采矿船决定，直接从空闲猫口（总猫口 − 手动工作猫）抽取，不写入存档。配员按小行星带列表顺序（铱 → 铁 → E-710）进行，空闲猫口不足时排在最后的采矿船停机。
- 界面：工作列表把三种采矿船合并为一条只读的「采矿船操作员」岗位（在岗 / 需求，无加减按钮），标题的已用与空闲猫口统计包含该岗位；停机船的开关按钮显示黄色（与供电不足一致的 `is-shortage` 标记，额外 `data-crew-short`），悬停与建筑悬停均给出「采矿船操作员不足」的具体原因。建筑描述与效果行同步标注每座占用与在岗数。
- 机制：新增 `src/simulation/ship-crew.ts`（`allocateShipCrew`、`countSparePopulation`）。`space-settlement.ts` 的矿区船循环用实际配员数替代启用数，`support-preview.ts` 暴露 `shipCrew` 快照；`auto-workers.ts` 只使用操作员之外的空闲猫口，避免自动分配把船饿停。池回放复用同一批 `space.inputs`，预览、生产与明细保持一致。
- 兼容：schema31 与存档字段均不变，旧档已建成的采矿船按现有猫口自动配员，无需迁移；新增回归用 beta 0.6.5 旧档验证载入、派生配员与存读档往返。
- 验证：`npm run check`通过：551 项模块测试（新增 `tests/ship-crew.test.ts` 7 项、`tests/ship-crew-ui.test.ts` 3 项）、经典 VM 回归、Edge 浏览器验收、类型检查与生产构建。

## 2026/10/19 beta 0.7.5 项目开发优化与代码清理

- 清理：删除 `recovery/` 目录（beta 0.5.19 与 0.6.4 基线压缩包、回退说明、移除清单及 29 个历史验证日志）、根目录调试输出文本与 `tests/fixtures/diagnose-outer.ts` 诊断脚本。全仓库检索确认无代码、脚本或文档引用这些文件。
- 清理：`tests/pool-replay.test.ts` 与 `tests/rate-display.test.ts` 此前不在任何 npm 脚本中、也未被其他测试导入，因而长期未执行。`pool-replay` 的 oracle 未包含固定电力网的 `calculatePowerGrid` 视窗，在 beta 0.7.x 改造后已失效（错误：`rich@dt0.2 pool.energy 18 vs 0`）。补上电网视窗后恢复通过，二者一并加入 `npm test`，防止再次静默掉出 CI。
- 结构：`ground-settlement.ts` 中 1387 字符、67 项的 `[...].includes(id)` 排除数组改为建筑注册表的 `settledByOtherSystem` 标志（`types/buildings.ts` 新增可选字段，仅数据、不入存档）。保留 `spaceSource`、`isPowerProducer` 与既有的空输出判定；以 6 种科技组合 × 3 种持有量的 2196 组 id 判定对照验证新旧条件完全等价。
- 结构：建筑悬停的 150 行效果行从 `TooltipPanel.vue` 迁至 `src/vue/building-tooltip-rows.ts`（`addBuildingEffectRows`）。因行顺序敏感且与动态行交错，迁移采用整段连续搬移而非查表重排，文案、条件与顺序均不变；面板文件 719 → 568 行。
- 代码：删除 12 处全仓库零引用的导出（`BUILDING_FLAVOR_IDS`、`ERAS`、`getBuildingEffectNotes`、`calculateSpaceContainerCapacity`、`calculateCrisprUpgradeCost`、`availableGovernments`、`isHyperspaceSource`、`averageGrowthTarget`、`isSpaceMissionAvailable`、`RegionBalance` 等），并把 `ASTEROID_UNIT_SUPPORT_COST`、`SPACEPORT_HIGHER_DIMENSIONAL_WATER` 两处重复字面量改为引用命名常量。删除 `resource-breakdown.ts` 未调用的 `runningOf`。
- 代码：删除 `storage.ts` 中 12 处失效的 `snapshot.X ?? calculateSupportPreview(state).X` 回退——`accumulateStorageRows` 的所有调用点均经 `withStorageSupportFallback`，这些分支不可达。`storage-bonuses.ts` 的同类回退保留，因为测试与部分调用方确实在缺少 `digital` 时调用它。
- 文档：`updatelog.md` 与 `docs/update-log.md` 移除 beta 0.4.x 及更早条目，保留近版本并在末尾注明可查 Git 历史。
- 兼容：schema31 不变；`config.ts`、`src/state/` 与存档契约未改动；新增注册表标志不写入存档，`create-state.ts` 仍按 `Object.keys(BUILDINGS)` 补零。
- 修复（数值漂移）：科研卫星的建筑悬停写作「科学家知识产量 +1%」，而 `ground-settlement.ts:37`、`resource-breakdown.ts:305/336` 实际按每座 `+2%` 结算，悬停少报一半。现新增 `building-effects.ts` 的 `RESEARCH_SATELLITE_LAB_OUTPUT = .02` 与 `RESEARCH_SATELLITE_LAB_CAPACITY = .05`，四处结算/明细/悬停全部改读常量，消除同类漂移的可能。游戏数值本身未变，只修正显示。
- 验证：`npm run check`通过：541项模块测试、经典VM回归、Edge浏览器验收、类型检查与生产构建。

## 2026/10/19 beta 0.7.4 知识经济与成本蠕变平衡

- 平衡：粒子对锻造物的产量加成改为常规加成的1/8（`calculateParticleMultiplier` 中锻造物系数 0.00125 → 0.000625），普通资源仍为0.005。
- 平衡：数据中心（`observatory`）知识容量 3000 → 2500，知识产量加成 10% → 5%（`buildings.ts` 与 `storage-bonuses.ts` 同步）。
- 平衡：实验室（`lab`）基础知识容量 2000 → 1000，基础成本蠕变 +0.01（知识 1.17→1.18，铜/水泥/钢板/资金 1.19→1.2）。
- 机制：实验室在完成「电力」研究后成为耗电建筑，每座请求 2 电力。获得供电的实验室单座知识容量为 2000，未供电或电力超额时保留基础 1000；供电计数沿用既有的 `stoppedBuildings` 与固定电力优先级链，未新增存档字段。
- 平衡：猫猫教授知识产量 2/s → 1/s；猫猫科学家知识产量 3/s → 2/s。
- 平衡：光伏电站基础成本蠕变 -0.015（1.225 → 1.21）；伐木场、采石场、采矿场 +0.005（1.18 → 1.185）；剧场、喵喵学校 +0.075（1.19 → 1.265）；煤矿 +0.01（1.18 → 1.19）。
- 界面：卡西米尔晶体悬停不再显示「当前粒子软上限」，该信息保留在粒子悬停中；粒子加速器在已研究「知识传承」时，悬停追加「图书馆知识容量 +10%」，建筑描述同步该条。
- 技术：实验室的供电分档容量收敛到共享 helper `calculateLabKnowledgeCapacity`，由 `storage-bonuses.ts` 与 `storage.ts` 共用，使资源详情、批量总量、量子缩放与数字换算使用同一公式。
- 修复：移除 `resource-breakdown` 中误用 `inputUnits.lab` 的「实验室消耗」电力条目。该键的既有语义是「实际运转的实验室工人单位数」（由 `ground-settlement` 写入），与供电无关，会导致未研究电力的存档凭空出现 -2 电力条目并使电力详情 `net` 与 `rates.energy` 不一致。
- 兼容：schema31不变，`config.ts` 与 `src/state/` 未改动，不新增字段、不改迁移规则。历史存档载入后按新数值结算；已建实验室与已研究科技全部保留，不因数值下调而失效。
- 验证：npm run check通过：536项模块测试、经典VM回归、Edge浏览器验收、类型检查与生产构建；存档兼容专项19项通过。

## 2026/10/19 beta 0.7.3 工业化科技与光伏电站

- 新增：T8科技「工业化」，节点科技（金色边框），42k知识，前置电力+自动化+钛冶炼；工厂与生产线改用此科技解锁。
- 新增：T8科技「太阳能发电」，50k知识，前置电子学；解锁建筑「光伏电站」。
- 新增：建筑「光伏电站」，能源设施区域，固定产出4电力、无消耗无岗位；造价10k资金/1000铜/1000铁/100钢，蠕变1.225。
- 改动：电子学改为T8（42k知识，前置工业化+电力）；石油开采与应用改为T8（45k知识，前置工业化）；合金钻头与合金链锯前置改为工业化。
- 兼容：schema31不变。已研究电子学/石油开采/合金钻头/合金链锯的历史存档保留研究（只豁免新增的工业化前置，`isTechnologyUnlocked` 对新研究仍严格要求）；改指前的工厂建筑与工人计数保留。新增建筑`光伏电站`按缺失字段补0，显式畸形值仍拒绝。
- 验证：npm run check通过：536项模块测试、经典VM回归（核心0失败、工厂19组）、Edge浏览器验收、类型检查与生产构建。

## 2026/10/19 beta 0.7.2 电力界面与回归修复

- 改动：资源栏电力提示由“可用电力 / 总发电量”改为“剩余 / 总值”，其余展示逻辑不变。
- 修复：`research-power` 从结算账本 `SettlementLedger` 读取 `grid`，不再访问公开 `SupportPreview` 快照上不存在的字段；类型检查由4处错误恢复为0。
- 修复：生成式桥接登记 `power-grid` 与 `validate-power`（生成93个脚本），修复经典VM回归因缺少全局符号直接崩溃的问题。
- 修复：对齐固定电力语义下的过期期望。`available` 为“发电量−请求用电量”的余量，可为负；实际耗电由 `used` 单独表示。涉及 `distant-stars`、`outer-space`、`remote-anchor`、`hyperspace-energy`、`stage-three-economy-audit` 及3个VM套件。
- 修复：水泥测试原先用 `resources.energy` 供电，而固定电力按设计忽略电力库存，改用真实发电；工厂生产线与太空/月球维护测试补齐 `powerActivationOrder` 优先级。
- 技术：为电力三项含义（`PowerGrid.available` 余量、`ResourceBreakdown.net` 实际流量、`PowerBudget.available` 未用预算）补充源码注释；三者仅在全部负载获供电时相等。
- 兼容：schema31不变；不涉及存档结构、字段或迁移，现有存档继续读取。
- 验证：npm run check通过：528项模块测试、经典VM回归（核心0失败、月球20/20、工厂19组）、Edge浏览器验收、类型检查与生产构建。

## 2026/10/18 beta 0.7.1 核心散热器成本调整

- 改动：核心散热器的基础成本蠕变从1.2改为1.1（资金、字节、加密数据与纳米合金四项同步）。
- 改动：电力详细信息中耗电条目去除“占用”后缀，直接显示对应建筑名字。
- 改动：AGI飞升核心供电前后按钮形状不变；数字化飞升改为核心右侧独立的建筑按钮，点击触发原有飞升确认流程。
- 改动：移除核爆、逃离、黑洞重置与数字化飞升的确认弹窗；触发按钮悬停显示本次重置将获得的威望资源，点击立即执行。
- 修复：自动分配工作系统的上限输入框在 tick 重渲染时被打断；现在输入与箭头调整稳定，越界值钳制并即时提交。
- 兼容：schema31不变；只影响之后的购买报价，已建数量与已投入资源不受影响。
- 验证：npm test通过514项TS测试与经典VM回归，npm run typecheck与npm run build通过，浏览器验收覆盖飞升按钮布局与上限输入行为。

## 2026/10/18 beta 0.7.0 戴森球、量子平衡与固定电力

- 改动：新增T21戴森球科技与100段戴森球建筑（天元六-alpha，每段+10电力/s，固定单段造价）；量子水平基础改为 `ln(1+0.1×知识上限/250000)/ln(1.1)`，保留已供能AI超级核心+25%/个与AGI核心组件+50%倍率并向下截断两位；量子蜂群每级使蜂群工厂效果+1个百分点（卫星总减免上限95%）；量子制造改为毛皮 `(量子水平-1)×12.5%`、其他工业品 `(量子水平-1)×50%`；软路由节点改为电力-10/s，只有获得供电的节点提供带宽与CPU；修复AES提示重复与dl.exe零产量行；队列倒计时改用实时结算步长估算。
- 改动：电力改为固定供给预算，无库存、不随时间累积；发电与耗电按既有优先级直接结算，供电不足停机；移除储能站，历史已研究的电力储存科技保留但无效；建造/研究/工程的一次性电力费用移除，运行消耗数值不变。
- 兼容：schema31不变；旧档电力库存校验后归零，退役储能站建筑/停用/工人/队列记录定向清理，其余进度、队列与永久奖励保留；冻结历史fixture不改。
- 验证：npm test通过514项TS测试与经典VM回归（20+19组），npm run test:browser通过，npm run typecheck与npm run build通过，UI基准无回退。

## 2026/10/16 beta 0.6.8 数字世界

- 新增AI核心校准、二进制世界两项T22科技；校准需要完整彭罗斯球并赠送一个网关，精确记录工程师数字化日志。
- world_execution内Ethernet（网关路由/dl.exe）和Interface（量子存储器/下载缓存器）。数据带宽供给5/路由、消耗1/其余建筑，25电力/s；仅Ethernet右侧显示已用/总量。
- 实际知识产出0～100%下载分流，1000知识/s换10B/s。字节基础10KB、不支持容器，只受精通及缓存器加成；量子存储器+10KB。字节单位1000进制。
- 缺失字段明确默认值兼容既有schema31；不修改原档，不重复补发已研究赠品。
- 完整npm run check通过：444项TS测试、经典VM、Edge浏览器验收、类型检查和生产构建；包含旧JSON升级/导入/往返/保护恢复和数字页滑块验收。

## 2026/10/16 beta 0.6.7 成本与库存格式

- 危险物质库增加200万资金与5万合金，四资源1.265蠕变；不影响已有数量与存档。
- 成本及库存按1000进位，速率和效果保留10000阈值；悬停/建筑成本/ARPA投入接入独立成本格式。
- npm run check通过433项测试、经典VM、浏览器、类型及构建；另行3项速率测试通过，旧schema31升级与回读测试继续通过。

## 2026/10/16 beta 0.6.6 同分支存档兼容修复

- schema31升级精确补齐新增危险物质库建筑/工人/停用计数，保留显式值且拒绝畸形数据；升级不修改输入。已研究撕裂者超频不再追溯新门槛，新研究仍要求100段。
- 保护模式提示改为先备份、更新重载或导入恢复，不再引导所有人硬重置。版本兼容政策持久化到AGENTS.md，今后默认保持支持分支存档兼容；此前明确退役schema12～30例外维持。
- 新增前版JSON升级、运行时载入/导入、往返及历史研究保留回归，避免仅用最新初始化状态测试。历史未完成的超频队列可载入，未满100段时按已有规则取消而不扣资源。
- 验证：50项聚焦测试通过；npm run check通过432项TS测试、经典VM、Edge浏览器验收、类型检查及生产构建。

## 2026/10/16 beta 0.6.5 危险物质库与平衡

- T21危险物质库科技、卡尔维拉新储存建筑、小行星基地氦3/中子基础容量与高维存储加成。
- 精金船基础.25/s、精金精炼站改名及20%加成、撕裂者超频完整100段解锁；修正文案格纳库。
- 共享数字格式超过当前单位10000才进位k/M/G等，保留库存截断规则。浏览器验收新建筑区域及32k容量展示。
- npm run check完整通过，包括新储存/经典桥接、倍率/条件/存档、数字格式回归、浏览器、类型与构建。早期阶段测试夹具排除未解锁新科技，没有放宽存档校验。

## 2026/10/16 beta 0.6.4 成就等级与精通

- 成就0～3级由完成时实际挑战基因数决定，高级覆盖低级，快照需再次完成。源状态挑战用于重置事件，跨普通重置保留等级，硬重置清空。
- 每项最高等级贡献0.25/0.5/0.75/1%精通，不逐级累加。所有非电力产出及锻造物应用一次，明细/预览/结算同步；成本不变。
- 成就顶部四条Tips、等级与精通标记、特权总精通和等级特权接口。当前schema31未分级成就为0级，稀疏等级字段严格校验，无旧schema迁移。
- npm run check通过420项测试、旧VM、浏览器及生产构建。浏览器自动分配夹具暂停真实计时器避免虚设超住房人口被tick回收导致不稳定。

## 2026/10/16 beta 0.6.3 幸福度详情双列

- 左列有效值/实际值/上限，右列当前幸福度增减来源（不含上限来源），沿用实际供能预览与原样式。raw最低0无上限，happiness仍限制40至cap，结算效果不变。
- 验证：npm run check通过398项测试、旧VM、浏览器真实双列布局/文本、类型与构建；新增实际值高于上限、低于下限及归零三种边界测试。

## 2026/10/16 beta 0.6.2 人口增长提速

- CONFIG.populationGrowthRate=1.5，calculateGrowthMultiplier先应用基础倍率，再叠加原有科技、建筑、CRISPR及基因；保留已积累进度与抽样目标，界面ETA复用同函数。食物/住房与单步最多新增一猫规则不变。
- 验证：npm run check通过397项测试、旧VM、浏览器、类型检查与生产构建；新增人口20前后基础速度及叠乘回归。

## 2026/10/16 beta 0.6.1 合金工具与硅酸盐水泥

- 添加alloyDrill/alloyChainsaw：T8、automation+合金资源解锁、知识44000/合金500；指定岗位工具倍率2替换steelTools1.5，非叠加。农民不受影响。
- 添加silicateCement：T5、metallurgy+cement科技前置、知识5000/石头1000；基础水泥产出1.5倍且投入不变。
- 共用工具/基础产出函数使生产预览、tick、悬停及收支明细同步。schema31不变；显示版本0.6.1按约定去掉refresh。
- 验证：新增10项工具科技测试，npm run check通过396项测试、旧VM、浏览器验收、类型检查与构建。覆盖真实购买扣费、资源解锁门槛、钢铁覆盖、所有受影响岗位及副产物、不同dt与水泥缺料/搅拌情况下投入不变、严格存档往返。

## 2026/10/16 beta 0.6.0_refresh 重做分支重新起点

- 命名：refresh仅此版本使用，并保留在历史更新日志，标记重新制作的新0.6分支。从beta 0.6.1起恢复无后缀命名；不改变存档schema或玩法。

- 基线：恢复 beta 0.5.19 传统玩法后重新开始 0.6 分支；仅修改版本、存档兼容与日志，无新增玩法，不恢复已放弃的 0.6 原型内容。原有历史日志原样保留，历史兼容说明不代表当前契约。
- 兼容：schema 31 拒绝全部 schema 12–30，包括已放弃的 0.6 原型；移除历史迁移、缺字段回填、退役内容剥离与旧进度豁免 helper。有效的当前同 schema 导入仍受支持。
- 保护：沿用 `meow-civilization-v12` 检测已有数据；读取失败、无效或不兼容存档记录「设置→硬重置」指引并进入 `saveBlocked`，保留原始存档，阻止自动/手动保存及软重置覆盖。
- 重置：硬重置创建 schema 31 全新状态，清空所有进度、成就、传统威望与永久升级；只有成功写入存储后退出保护，写入失败仍保持保护。
- 原档导出：设置新增保护模式专用按钮，runtime缓存校验失败的原字符串并只读导出；存储读取失败可重试，失败不导出临时游戏。原始空白、损坏文本同样逐字保留，不改变保护状态；日志增加先备份指引。新增单元与浏览器测试，完整检查386项模块测试及VM/浏览器/类型/构建通过。
- 文档：同步 README、技术细节与名词表的当前版本及存档契约，保留历史更新记录；恢复安全区不作改动。
- 验证：npm run check通过，385项模块测试、旧VM回归、真实浏览器验收、类型检查与生产构建通过。存档回归覆盖全部12–30版本拒绝、当前档往返、原档不被自动/手动保存或软重置覆盖、硬重置写入失败继续保护及成功后清空退出。测试数量因删除迁移测试、加入严格边界测试而变化，不沿用历史数量。

## 2026-10-15 beta 0.5.19 质量喷射双列列表

- 质量喷射独立ejection-list网格两列，900px及以下单列；条目名称/质量说明左侧，分配按钮右侧允许换行，避免原长行挤出。汇总和集装箱布局不变。
- 验证：`npm run check`通过（387个测试、旧版VM、浏览器验收、类型检查与构建）；浏览器校验列数、同行坐标、无横向溢出以及分配操作。

## 2026-10-15 beta 0.5.18 恢复ARPA原布局

- 按用户要求撤回紧凑样式：建筑两列、其他项目单列，12px间距，恢复卡片原留白和按钮flex排列。底部重复说明保持删除，保留队列title及进度两位小数。
- 验证：`npm run check`通过（387个测试、旧版VM、浏览器验收、类型检查与构建）。

## 2026-10-15 beta 0.5.17 ARPA项目紧凑布局

- 所有ARPA项目网格宽屏四列，1200px及以下两列、700px及以下单列；卡片间距8px，资源投入逐行排列，六个按钮采用三列两行。建设进度文字最多两位小数，进度条及投资结算仍使用原精度。
- 删除每个项目末尾重复说明，队列倍率快捷键移至按钮title。研究/建设数值和排队逻辑不变。
- 验证：`npm run check`通过（387个测试、旧版VM、浏览器验收、类型检查、构建）。

## 2026-10-15 beta 0.5.16 更新日志金色标题

- 更新记录h3标题统一金色#e0b755；版本号拆为文本span并使用currentColor下划线，日期与摘要不加下划线。兼容beta与版本之间有无空格的历史标题，正文不变。
- 验证：`npm run check`通过（387个测试、旧版VM、浏览器验收、类型检查与构建）；真实更新日志页面逐标题验证金色、版本下划线及同色描绘。

## 2026-10-15 beta 0.5.15 电力容量平衡与电池聚能环

- 电力基础容量1000→10000；太阳能卫星每座提供500电力容量。新增T8电池聚能环，电子学前置，知识价格42114.514；基础电力储量再加90000，储能站每座容量改为5000。基础容量共享函数保证明细/总量一致，建筑tooltip复用动态容量。
- 验证：`npm run check`通过（387个测试、旧版VM、浏览器验收、类型检查及构建）。新增价格/前置/等级、研究前后容量、太阳能与储能站组合、明细总量一致及存档往返回归。

## 2026-10-15 beta 0.5.14 修复产量显示跳动

- 根因：产量由结算池与库存相减获得，20可成为19.99999999999909，库存格式的向下截断将其显示19.99。新增独立formatRateNumber，两位小数舍入；signedRate统一用于资源列表及收支明细，库存/容量仍截断，不改变模拟或存档数值。
- 验证：`npm run check`通过（386个测试、旧版VM、浏览器验收、类型检查、构建）。回归测试以实际增殖反应堆在不同库存和1/0.2/0.05秒时间步复现，确认稳定20/s；覆盖真实19.99、负数、缩写、近零以及库存截断不变。

## 2026-10-15 beta 0.5.13 智能化银行系统与中子库

- 新科技intelligentBankingSystem：T16、410k知识+750k资金，前置人工智能II；银行和猫咖容量贡献×2，每猫资金容量1000替代储蓄债券/股票交易，按优先级不叠加。
- 新科技neutronVault：T14、245k知识+2000中子，前置中子建筑材料；银行/猫咖基础资金容量加2000/3000，再计算现有百分比与智能银行倍率。格纳库普通箱上限40；超级集装箱已解锁时合金箱上限25，替换原30/15。
- 建筑tooltip与储量明细/总量共用动态规则；更新科技、建筑说明、名词与技术文档，存档版本仍29，不自动授予旧档新科技。
- 验证：`npm run check`通过（384个测试、旧版VM、Edge浏览器验收、类型检查与构建）。新增精确价格/前置、固定加成与乘法顺序、人口不叠加、两种箱上限及存档往返/缺前置拒绝测试；旧v25 fixture显式排除新增后期科技。

## 2026-10-15 beta 0.5.12 恢复齿轮入口例外

- 按用户要求恢复工厂、冶炼、合成、飞船配置入口的齿轮图形与18px紧凑尺寸，保留中文aria-label。开发规范记录唯一许可例外；自动扫描仅豁免BuildingsPanel中四个指定按钮，其余emoji仍禁止。
- 验证：`npm run check`通过（379个测试、旧版VM、浏览器验收、类型检查与构建）。无数值或存档改动。

## 2026-10-15 beta 0.5.11 移除emoji并确立禁用规范

- 清除全部运行源码中的emoji图标、时代前缀、标题/提示/日志装饰及图标渲染占位；配置按钮改为“设置”并适配宽度。数据icon字段保留空字符串，不改类型/存档/经济数值。
- 新日志与历史导入日志统一去除emoji序列，覆盖旗帜、肤色、组合和按键序列；保留日志正文、时间与类型，原始导入对象不变。发布更新日志旧齿轮文字一并改为“设置”。
- 在technical-details开发硬性规范明确今后禁止添加emoji，也不得用转义/HTML实体绕过；新增源码与发布入口扫描测试防回归。数学符号、单位和必要标点保持。
- 验证：`npm run check`通过（379个测试、90个生成桥接模块、旧版VM回归、Edge浏览器验收、类型检查与生产构建）。新增无emoji扫描、新旧日志清理与不可变测试；游戏源码emoji检索无匹配。

## 2026-10-15 beta 0.5.10 配方只在悬停时浮层显示

- 移除配方的focus显示条件，避免原生dialog自动聚焦首个名称时无悬停即弹提示；保留焦点轮廓与配方aria-label。配方改为相对当前行top:100%的绝对定位浮层，横跨行宽并自动换行，不占布局空间、不挤动后续行，也不覆盖当前行。
- 验证：`npm run check`通过（377个测试、旧版VM、浏览器验收、类型检查、构建）；覆盖聚焦不显示、浮层定位、行高/后续行坐标不变及窄弹窗横向不溢出。

## 2026-10-15 beta 0.5.9 工厂与冶炼配方提示

- 配方说明从名称列移到factory-row的第二行，跨越全部四列；悬停/聚焦名称时在正常布局内展开，自动换行，后续行顺延，不遮挡名称、数量或操作按钮。两种弹窗共用样式，不改配方与分配数值。
- 验证：`npm run check`通过（377个测试、旧版VM、浏览器验收、类型检查、构建）；窄工厂弹窗验证整行展开/换行/无横向溢出与失焦折叠，冶炼弹窗验证第二行跨四列及名称按钮位置。

## 2026-10-15 beta 0.5.8 移除桌面详情附块

- 用户不希望建成建筑右侧额外出现ⓘ附块；取消桌面强制显示，将建造按钮改为可聚焦的aria-disabled状态，并在点击处理显式阻止达上限购买。建筑本体直接响应悬停/聚焦详情，完成态仍亮起；触屏原有详情入口保留。
- 兼容：不改变建造上限、数值或存档；运行/齿轮按钮不变。
- 验证：`npm run check`通过（377个测试、旧版VM、浏览器验收、类型检查、构建）。浏览器验证桌面无详情附块、本体聚焦/悬停可查看详情、重复点击不增加建筑。

## 2026-10-15 beta 0.5.7 建成建筑保持亮起

- 用户要求一次性建筑/完整分段建筑建成后保持普通可负担建筑样式；新增完成态类，覆盖禁用斜纹、虚线与暗背景，保持原亮起背景和实线边框。原生禁止重复购买、详情入口与运行开关不变；仅被队列预约但尚未建成的按钮不使用完成态。
- 兼容：无存档或数值变化；技术细节与名词表已检查，本次仅完成态外观调整。
- 验证：`npm run check`通过（377个测试、旧版VM回归、浏览器验收、类型检查与生产构建）；浏览器断言完整AI核心保持亮色实线、无斜纹且点击不增加建筑。

## 2026-10-15 beta 0.5.6 全游戏审计修复

- 修复广播塔/观光空间站停机或维护不足仍提供幸福度的问题，幸福度与上限使用实际付费单位；超空间燃料反馈采用有界收敛计算。太空驻军区分拥有上限与实际训练容量，不删除现有士兵，不改变原容量压力规则。
- ARPA遵守有序建造前置并统一容量策略；显式零容量与独立科研队列保留。自动化耗电钳制浮点尾差，工匠增配不会在异常超配状态下变为减配。
- 修复飞船猫口乱码、日志筛选不可见、禁用/危险按钮无区分、Q热键失焦残留、分数像素断点、焦点轮廓及锁定剧情对比度。日志使用UI稳定对象键；满级建筑保留独立详情按钮；工厂配方改为可换行正常流，避免滚动弹窗裁剪。保持统一主题文字色与原彩蛋拼写。
- 暂停时税率也即时保存；重置/挑战状态校验异常显示错误，不记录虚假成功。军事UI显示拥有与训练两种容量。
- 存档未来时间只钳制元数据，写盘/序列化失败回滚时间；v28迁移仅补缺失字段，保留有效秘银与Asriel进度，仍拒绝非法值。统一过时排队标志、商业停机缺省、工程投入合成和往返校验。
- 补全存储/维护/猫咖/地热/实验室等描述；成本兼容表由建筑主数据派生，移除无消费者全局系数。保留宽容的非关键日志/未知设置规则，补充契约说明。
- 兼容：存档版本仍为29；不会恢复此前已清零且已保存的历史库存，尚未迁移的有效旧档不再被无条件清空。
- 验证：`npm run check`通过（377个测试、旧版VM回归、Edge浏览器验收、类型检查、生产构建）。新增回归涵盖0.2/1秒维护、幸福度与收支一致性、训练容量、有序ARPA、跨时钟导入、迁移不可变/幂等、失败写盘、日志键与筛选、失焦热键、860.5px断点、禁用原生行为和窄工厂弹窗。乱序重复建筑报价疑似项通过测试排除，无需改变定价规则。

## 2026-10-15 移除异常研究流程

- 用户确认保留场约束理论、场约束阵列与稳定度，删除整块第三阶段异常研究面板及信号传递/首次物质转移/远端连接三个实验。
- 删除双端场耦合、有限孔径稳定、异常拓扑测绘科技及远端锚点验证ARPA工程；短程通信节点、锚点货运站、民用航线站直接由场约束理论开放并参与运行；接入点信标、维度信标投放也改为该科技前置。
- stageThree只保留AI核心实际启动标志；旧存档清理退役科技/工程记录、对应队列与实验标志，不退款，不清空有效后续内容。剧情章节ID继续兼容，文本和触发改按实际科技/建筑里程碑。
- 验证：`npm run check`通过（355个测试、保留VM回归、浏览器验收、类型检查与生产构建）。退役实验测试改为直接解锁/稳定度/维护及迁移测试，覆盖旧档不可变/幂等清理、后续服务生效、完整移除面板与ARPA退役工程。

## 2026-10-15 简化超空间入口

- 新链路：全域观测校准→异常区域测绘→立即开放超空间；场约束理论前置直接改为异常区域测绘。
- 彻底移除深空干涉阵列、异常区探测任务、异常响应实验科技、深空实验平台及其前置校验；不再把早期异常面板放在ARPA进度页。保留信号传递、物质转移、远端连接等后续流程。
- 旧档清除退役科技、工程进度、对应待办队列和探测/响应标志，保留资源、永久收益与后续有效进度，不退款；原剧情章节ID保留，文本和触发条件按新链路更新。存档版本仍为29。
- 验证：`npm run check`通过（357个测试、保留VM回归、浏览器验收、类型检查与构建）；覆盖即时解锁、新前置、旧档不变性/幂等迁移、后续流程保留和界面清理。

## 2026-10-15 AI核心副标题与日志可读性

- AI超级核心悬停名称下新增独立一行 `world.exection(cat);`，保留当前量子水平与其他效果。
- 日志正文12→14px、行高1.6、时间12px，增强对比度；队列灰蓝、普通事件暖黄、进度事件浅蓝、成就浅绿，系统诊断浅红。筛选新增队列，发展改为进度事件。
- 队列完成使用新queue类型，里程碑/核心启动/飞船部件/黑洞进展归为progress；随机及人口普通事件继续event。旧档队列完成记录自动归类，存档版本不变。
- 验证：`npm run check`通过（353个测试、保留VM回归、浏览器验收与生产构建）；覆盖旧队列日志归类、独立筛选、五类不同颜色、14px字号和核心悬停副标题。

## 2026-10-15 队列建筑悬停预测价格

- 修复同类建筑队列悬停始终使用当前已建数量报价的问题，改为复用 `describeQueuedPurchases` 的前序同类数量累计结果；无需堆栈，按顺序扫描即可。
- uid保持稳定用于定位，显示编号随当前下标变化。取消第2项后原第3/4项编号及预测价格顺延，其他类型建筑不影响同类递增；分段建筑保留剩余分段总价格和单段储量校验。
- 验证：`npm run check`通过（352个测试、保留VM回归、浏览器验收与构建）。单测覆盖四个重复项目、删除中间、混排及实际建成后的价格稳定；浏览器逐项验证悬停报价与删除后的编号/报价顺延。

## 2026-10-15 替换成就与列表筛选

- 移除原六项成就，新增好奇害死猫、跑路了跑路了、人造天体、遮天蔽日、world.exection(cat);、超频小王子、空间毁灭者七项。条件分别为核爆、ESS逃逸、飞船完成、4096蜂群卫星、实际启动AI核心、OC-13研究、黑洞重置，条件写在描述破折号后。
- 列表新增全部（默认）/未完成/已完成筛选，选中边框绿色，空结果显示提示。达成成就记录对应日志且不会重复。
- 用户确认不按历史进度补发：旧成就记录清除，旧档现有条件记为基线，后续重新达成才授予；重置事件须更新后重新执行。成就保留规则不变，存档版本仍为29。
- 验证：`npm run check`通过（351个测试、旧版VM回归、浏览器验收与构建）。新增状态跨越/去重、旧档不补发、未知成就拒绝、核爆/逃逸/黑洞成就与日志、飞船完成立即发射保留成就，以及三种筛选与绿色边框验收。

## 2026-10-15 自动分配拖拽与按钮优化

- 优先级拖拽时在本地实时预览新顺序，使用TransitionGroup提供160ms平滑位移动画，拖动项淡化；松手提交，取消恢复原序，预览中不触发实际调配。支持减少动态效果偏好。
- 自动按钮固定显示「自动分配」，开启使用与设置页相同的绿色边框（#63b875）。
- 验证：`npm run check`通过（346个测试、浏览器验收与构建）；补充浏览器验证实时预览与松手提交、取消恢复、按钮文字与绿色边框，追加浏览器回归通过。

## 2026-10-15 工作自动分配

- 工作页新增总开关，开启后在手动按钮右侧显示有限岗位的自动开关与人数上限（-1不限），以空隙和竖线分隔；更右侧提供可拖拽的优先级列表，另支持上下按钮。
- 规则：只使用空闲人口补缺，不从其他岗位调人；按优先顺序填充，受岗位容量与自动人数上限共同限制，降低上限不撤回已有人员。关闭总开关停止自动分配并隐藏配置。
- 配置保存在周目字段 `autoWorkers`，默认全部关闭，旧存档自动补默认值，周目重置清空。tick生产前及末尾补员，新生人口和新增岗位自动纳入。
- 验证：`npm run check`通过（346个测试、保留VM回归、浏览器验收与构建）。覆盖优先级、空闲人口、人数限制、锁定/无限岗位、暂停与实际tick、新增岗位、存档校验/往返/重置，以及界面启停、上限输入和真实拖拽事件。

## 2026-10-15 游戏更名

- 游戏标题统一为「喵星旅人_world.execution(cat);」，同步主页面、顶部品牌、独立更新日志页及README。README展示版本同步beta 0.5.5。
- 保留原localStorage存档键、内部npm包名和Eden_Kittens区域名，不迁移或清空旧存档。
- 新增标题一致性测试，校验两份HTML入口、Vue顶部标题与README首行。`npm run check`通过（342个测试、保留VM回归、Edge浏览器验收、类型检查与生产构建）。

## 2026-10-15 超级集装箱与合金集装箱

- 新科技：超级集装箱（T8，51400知识，前置自动化存储）。研究后每座集装仓库提供25普通箱上限及10合金箱上限，每座格纳库保留30普通箱上限并额外提供15合金箱上限。
- 合金集装箱：每箱消耗10合金，储量为普通箱的4倍，同享全部集装箱科技加成；独立制造、分配与撤回，配置列表位于普通列表右侧，沿用相同样式与批量快捷键。
- 存档：新增周目字段 `alloyContainers`、`alloyContainerAssignments`，旧存档缺省为0，版本仍为29。储量明细和批量上限均纳入合金箱；撤回立即截断超额资源。
- 验证：`npm run check`通过（341个测试、旧版桥接回归、浏览器验收和生产构建）。覆盖科技定义、建筑上限、四倍储量与科技升级、制造成本和分配独立性、非法存档、JSON往返和周目重置，以及浏览器右侧同行布局与批量制造/分配/撤回。

## 2026-10-15 新科技：原油精炼优化

- 新内容：T9科技原油精炼优化（70k知识，前置化学沉积工艺+石油存储）。研究后石油精炼厂基础产量1→1.5石油/s，耗电0.5→2/s；后续产量倍率照常叠加。归入beta 0.5.5。
- 实现：`calculateRawBuildingOutput` 与 `calculateBuildingInput` 中的 `refinery` 分支，地面结算、电力分配与建筑悬停共用。
- 验证：`npm run check`通过（338个测试）；单元测试覆盖科技定义、配方、实际结算（dt 0.2/1）石油×1.5、电力差值，以及缺电时按供电份额开工。

## 2026-10-15 新科技：基因合成

- 新内容：T11科技基因合成（200k知识，遗传学+基因测序）。生物科学实验室新增配置面板，4个独立滑块设定C/G/A/T合成速率（0%～100%，默认0%）；10%下每座运行中的实验室消耗20000知识/s，产出0.1碱基/s，知识不足时按比例降速。需基因剪切才显示配置按钮。
- 存档：`geneModification.synthesis` 新字段，旧存档缺省0%；DNA允许小数。存档版本仍为29。归入beta 0.5.5。
- 测试：浏览器全建筑悬停夹具在比较前暂停游戏，避免真实计时器在恢复与比较之间推进一次tick（新增步骤让该竞态稳定出现）。
- 验证：`npm run check`通过（336个测试）；单元测试覆盖科技定义、消耗/产出比例、独立速率、知识不足降速、停机实验室、实际入账与统计、解锁条件、存档往返与校验、周目重置；浏览器覆盖配置按钮显隐、4个滑块默认0%、拖动设置。

## 2026-10-15 基因修饰紧凑布局与两项新基因

- 界面：基因修饰卡片缩小，每碱基一组4列网格，不同类型基因不同行，余位留空；窄面板降为2列。
- 新内容：成熟加速（C，人口增长速率+1%/级）、超频锻造（G，锻造物产量+2%/级，工匠产量另+1%/级，不增加原料）。基因等级记录新增两个键，旧存档缺失时按0级读取，存档版本仍为29。归入beta 0.5.5。
- 验证：`npm run check`通过（333个测试）；单元测试覆盖增长倍率与实际结算、手动锻造、工匠产出与原料、详情行；浏览器覆盖10个基因、4列网格、分组换行与紧凑高度。

## 2026-10-15 统计页新增特权子页面

- 界面：统计页新增「特权」子页，参考卡片列表样式：金色名称、来源标签、效果描述，覆盖链附当前实际数值。无特权时显示空状态。
- 实现：新增 `listActivePerks`（只读，不改结算）；覆盖链（材料效率→半衰期3、空间推理→维度扭曲）只显示最高级。成就定义新增可选 `perk` 字段，现有成就无特殊效果，暂不显示。
- 版本：显示版本升至beta 0.5.5，根更新日志新建0.5.5版本节，仅收录特权页；此前的界面与平衡改动保留在0.5.4。存档版本仍为29。
- 验证：`npm run check`通过（331个测试）；新增覆盖链、实时数值和成就特权单元测试，浏览器覆盖空状态、最高级过滤与卡片样式。

## 2026-10-15 电化学熔炼移除电力消耗

- 平衡：移除电化学熔炼给钢冶炼工位新增的电力2/s维护；钢基础产能仍从0.5/s提升至1/s，其他原料消耗与后续产量倍率不变。科技描述同步更新。
- 验证：`npm run check`通过；新增0.2秒及1秒步长回归，确认零电力时钢产能提升仍生效、输入配方不变、电力收支为0。

## 2026-10-15 集装箱与ARPA建筑页面按条件显示

- 界面：集装箱上限大于0或已有集装箱时显示集装箱子页；无集装箱条件且无质量喷射器时隐藏资源管理入口。仅喷射解锁时默认喷射页，条件消失后回退世界。
- ARPA：ARPA建筑子页仅在研究ARPA后显示；只有遗传学、CRISPR等解锁时自动选择可用子页，避免落入未解锁的建筑页。
- 验证：`npm run check`通过；浏览器覆盖开局隐藏、已有集装箱、仅喷射解锁、条件失效回退及遗传学独立解锁。

## 2026-10-15 政府改革按钮效果预览

- 界面：改革体制的候选按钮接入统一tooltip，鼠标悬停或键盘聚焦显示体制名称与效果。说明直接复用 `GOVERNMENTS[id].desc`，不改变改革逻辑。
- 兼容：仅界面变化，无存档变化；归入当前beta 0.5.4显示优化。
- 验证：`npm run check`通过；浏览器覆盖五种候选体制的效果预览，并确认查看不会触发改革。

## 2026-10-14 电力消耗明细自动双列

- 界面：电力收支tooltip中的消耗条目超过15个时自动分两列并加宽面板；15个及以下保持单列，其他资源不变。
- 兼容：仅布局变化，结算及存档不变。
- 验证：`npm run check`通过；浏览器覆盖超过15项与不超过15项的布局切换。

## 2026-10-14 beta 0.5.4：恒星熔炉与维护平衡

- 平衡：恒星熔炉新增电力+25/s，保留冶炼厂工位+2、工匠上限+2与锻造物产量+10%。精金加工站改为可开关，维护电力10/s；仅整座付费运行的加工站使精金采矿船产量+10%/座（加算），停机或维护不足不提供加成。
- 维护：AI超级核心每座完整核心需电力100/s及氦-3 25/s，未完成分段不扣维护。
- 兼容：保持beta 0.5.4，不提升版本号；存档结构不变。
- 验证：`npm run check`通过（328个测试、旧版VM、浏览器验收和构建成功）；新增恒星熔炉发电、加工站供电/停机与完整核心双资源维护回归，覆盖0.2秒和1秒步长，浏览器验证完整核心缺电警告。

## 2026-10-14 资源管理紧凑单行布局

- 界面：集装箱、质量喷射的多行资源卡片改成紧凑单行，名称、说明、数量、加减按钮同行。缩小按钮与内边距，行宽按内容收缩；窄屏横向滚动而不挤掉按钮。
- 兼容：保留原按钮选择器、倍率快捷键和禁用条件，不改变玩法或存档。
- 验证：`npm run check`通过；浏览器新增两页行高、同行布局和喷射分配操作验收。

## 2026-10-14 信号中继稳定度加成下调

- 平衡：每座运行信号中继对每座运行场约束阵列的稳定度加成从0.5降为0.25。阵列基础+2、太空港+4与维护费用保持不变。
- 实现：结算与建筑效果说明复用 `REPEATER_BONUS_PER_ARRAY`，建筑描述和名词表同步更新。旧档无需迁移，运行稳定度按新值计算。
- 验证：`npm run check`通过；更新满供能与缺电回归，覆盖0.2秒及1秒步长。

## 2026-10-14 资源列表显示精度调整为最多两位小数

- 显示：资源数量、储量上限、锻造物库存、每秒收支及储量明细使用 `formatResourceNumber`，按最新要求从5位改为最多2位小数，去掉末尾零；K/M等缩写的数值部分也保留最多2位。库存不向上舍入，仅修正机器浮点尾差；极小负值不会显示负零。
- 计算：结算仍保留完整浮点精度，不按显示精度逐tick截断，避免微小产量累计丢失。旧的通用价格/计数格式不变，黑洞质量仍显示8位小数。
- 兼容：不改变存档格式或资源数值，归入beta 0.5.4显示优化。
- 验证：`npm run check`通过；更新两位小数、浮点边界、负零和资源列表浏览器验收。

## 2026-10-14 证券交易所：银行家税收加成

- 数值：每个证券交易所（ARPA）使每位银行家的税收加成+2个百分点，基础5%。公式`1+银行家数×(0.05+0.02×证券交易所数)`，由`calculateBankerTaxRate`计算。
- 界面：证券交易所工程、证券交易所科技和银行的描述同步更新；内部管理税收说明显示当前每位银行家的加成。猫猫页的银行家岗位详情不再固定写+5%，改为显示实际加成；有证券交易所时，下面分行列出基础与证券交易所两部分。
- 兼容：存档无变化。
- 验证：`npm run check`通过（退出码0），新增证券交易所税收用例和银行家详情浏览器验收。

## 2026-10-14 beta 0.5.4：质量喷射、黑洞重置与暗能量

- 新科技：质量喷射器（T21，2M知识，前置彭罗斯理论，并需建成完整彭罗斯球体）、引力转化（T21，2.15M知识，前置质量喷射器）。
- 新建筑：质量喷射器。造价3M资金、20k精金、8k纳米合金、3k秘银、4k气凝胶，蠕变1.28，喷射容量+1000/s，电力-10/s（整座供能）。首座建成后写事件日志「资源管理中解锁了新的面板」。
- 新机制：
  - 质量喷射子页：按资源分配喷射速率，总量受容量限制，可用倍率键。只显示已解锁的可喷射资源（除资金外的普通资源和锻造物）。
  - 黑洞质量：初始10，奇异0，8位小数显示在彭罗斯球体详情和喷射页。引力转化后整座球体电力额外+5×(质量−10)+50×奇异质量。
  - 奇异质量达0.025时写事件日志，开放「稳定黑洞」（可重复）和「奇异失控」（确认框，不可入队）。
- 威望：新增黑洞重置与暗能量。公式见名词表。统计页增加黑洞重置次数、暗能量累计与当前值，侧栏威望资源增加暗能量。暗能量储量加成独立相乘。
- 显示版本：beta 0.5.4。
- 兼容：存档版本仍为29。旧档缺少`blackHole`、`darkEnergy`、`blackHoleResets`、`darkEnergyEarned`时补默认值。
- 验证：`npm run check`通过（退出码0），新增`tests/black-hole.test.ts`共9个用例，更新各测试的科技排除表。

## 2026-10-14 服务器更新脚本

- 工具：新增`scripts/git_update.sh`（最初名为`server-update.sh`，已由用户重命名）。它从GitHub拉取main分支到`/home/hikarier/HikariersReactor`，首次运行时克隆，之后快进拉取，然后执行`npm run build`，产物在`dist/`。
  - 发布：编译成功后，清空1Panel站点目录`SITE_DIR`（默认`/opt/1panel/www/sites/hikarier.heng-fn.top/index`），把`dist/`里的文件直接复制进去，然后执行`chmod -R a+rX`。
  - 清空保护：只接受`/opt/1panel/`下以`/index`结尾、不含`..`的已存在目录，否则停止。没有写权限时自动使用`sudo`。复制后检查`index.html`和`updatelog.html`都在。
  - 编译失败时不会清空站点，线上版本保持不变。
  - 远端地址比较时，忽略末尾的`/`和`.git`。
  - 依赖：只有`package-lock.json`变化或缺少`node_modules`时才执行`npm ci`。
  - 安全检查：检查Node版本（需20.19+或22.12+），并用`flock`防止重复运行。服务器有本地修改、分支分叉或目标目录不是本仓库时，脚本停止，从不强制重置。
- 仓库：新增`.gitattributes`，规定`*.sh`使用LF换行，避免Windows上`core.autocrlf`转成CRLF后脚本在Linux上无法运行。
- 兼容：无玩法变更。
- 验证：本机没有bash或WSL发行版，未能执行`bash -n`语法检查，也没有在服务器上实际运行；已确认文件为LF换行。

## 2026-10-14 平衡性：农场与基础资源建筑蠕变上调

- 数值：基础蠕变（`costScales`）上调，`BUILDINGS`与`BUILDING_COST_SCALES`两个注册表同步：
  - 农场：1.17 → 1.20（+0.03）。
  - 伐木场、采石场、采矿场、煤矿、住宅楼：1.17 → 1.18（+0.01）。
- 说明：CRISPR等动态减免照常叠加，首座价格不变。
- 兼容：存档无变化，之后的价格按新蠕变计算。
- 验证：`npm run check`通过（退出码0），新增6座建筑两个注册表的一致性用例。

## 2026-10-14 beta 0.5.3：新科技铱合金集装箱

- 新科技：铱合金集装箱（`iridiumAlloyContainers`，T13），需要230k知识和1000铱，前置为月球勘探。研究后所有集装箱（含已分配）的单个储量×2.5，与钢集装箱、强化集装箱的×2连乘：250基础→钢500→强化1000→铱合金2500。未研究强化集装箱时也按×2.5计算，例如只研究钢集装箱为1250。
- 显示版本：beta 0.5.3。
- 兼容：存档无变化，已分配的集装箱研究后立即按新容量计算。
- 验证：`npm run check`通过（退出码0），新增科技价格、前置、倍率阶梯与已分配集装箱储量用例；旧版月球VM测试的科技白名单已加入新科技。

## 2026-10-14 推送脚本加入静态编译

- 工具：`apush-to-github.bat`在检查未提交改动之前先编译静态网站。缺少`node_modules`时先执行`npm ci`。运行时会询问是否执行完整的`npm run check`，默认只执行`npm run build`。编译或检查失败，或没有生成`dist\index.html`时，脚本停止，不提交也不推送。
- 仓库：`dist/`继续由`.gitignore`忽略，编译产物只用于本地或nginx部署，不上传GitHub。脚本另加一道保险：如果`dist`曾被git跟踪，会用`git rm --cached`从索引中移除，本地文件保留。
- 兼容：无玩法变更。
- 验证：单独运行脚本中的编译段，`npm run build`成功，`dist`的git状态为已忽略（`!!`），被跟踪的文件数为0。没有实际执行推送。

## 2026-10-14 移除离线时间计算

- 改动：载入存档时不再按`lastSaved`补算关闭页面期间的时间，读档后从存档时的状态继续。`runtime.load`删除了离线`simulateElapsed`调用。
- 保留：页面开着但在后台或最小化时，回到前台仍按真实经过时间补算（上限8小时）；暂停时不计时。
- 兼容：存档格式不变，`lastSaved`字段保留并照常写入，只是不再用于结算。旧存档读入后不会获得离线收益。
- 验证：`npm run check`通过（退出码0），runtime测试改为断言载入不推进时间。

## 2026-10-14 更新日志改为独立页面

- 界面：移除游戏内「更新日志」标签页。顶栏版本号左侧新增「更新日志」链接，点击后在新浏览器标签页打开独立页面`updatelog.html`，并带有`rel="noopener"`。`vite.config.ts`改为多页面构建（`index`与`updatelog`两个入口），独立页面入口为`src/updatelog.ts`，复用`UpdateLogPanel.vue`。
- 兼容：存档无变化。
- 验证：`npm run check`通过（退出码0）。Edge验收检查链接的位置与属性，并通过iframe加载独立页面确认渲染。

## 2026-10-13 新增「更新日志」标签页

- 界面：（已被上一条取代）在「设置」右侧新增「更新日志」标签页，内容来自项目根目录的`updatelog.md`，构建时通过Vite `?raw`打包。由`src/vue/markdown.ts`解析一个Markdown子集（标题、两级列表、分隔线、引用、段落、粗体与行内代码），全部按文本节点渲染，不注入HTML。
- 文档：`updatelog.md`是面向玩家的版本日志，以显示版本号为标题，例如「## beta 0.5.2」。本文件`docs/update-log.md`仍是开发记录。
- 兼容：存档无变化。
- 验证：`npm run check`通过（退出码0），新增Markdown解析用例和Edge标签页检查。

## 2026-10-13 平衡性：17座地面建筑基础成本蠕变+0.02

- 数值：下列建筑每种资源的基础蠕变（`costScales`）各+0.02，`BUILDINGS`与`BUILDING_COST_SCALES`两个注册表同步：
  - 1.17 → 1.19：喵喵学校、图书馆、实验室（知识1.15 → 1.17）、数据中心、生物科学实验室、新兵训练营、冶炼厂、铸造厂、石油精炼厂、地面工厂、煤炭发电厂、剧场、广播塔、石油发电站、裂变发电站。
  - 水泥工坊：1.195 → 1.215。
  - 银行：1.25 → 1.27。
- 说明：CRISPR、工业至上等动态减免照常叠加，例如地面工厂在五级CRISPR加工业至上时为1.135。首座价格不变。
- 兼容：存档无变化，已建数量保留，之后的价格按新蠕变计算。
- 验证：`npm run check`通过（退出码0），蠕变测试更新为新值，并新增17座建筑两个注册表的一致性用例。

## 2026-10-13 修复：空间撕裂者电力明细与知识容量显示

- 修复：电力收支明细中，完整空间撕裂者下方多出一行「原料供应 −99%」。原因是明细按100段计算运行数，而发电结算按1座完整撕裂者计。现在明细改用和`settlePowerPlants`相同的`countRunningBuildings`。实际发电量一直正确（100/s或超频后200/s），只是显示错误。
- 修复：空间撕裂者详情的「知识容量」固定显示+20%，没有计入黑洞星际站。现在按当前供能的黑洞星际站数显示（20%+1%×站数），附注列出站数和额外加成。系数`calculateRipperKnowledgeBonusValue`由储量结算和详情共用。
- 兼容：存档无变化。
- 验证：`npm run check`通过（退出码0），新增TS回归用例和Edge详情检查（3座站时显示+23%）。

## 2026-10-13 修复：电磁发射器燃料减免作用于遥远星际

- 修复：遥远星际的「中子星探索」与「黑洞探索」任务的氦-3费用原先也享受电磁发射器的-5%/座减免。现在通过`FUEL_DISCOUNT_EXEMPT_MISSIONS`排除，按原价100k/150k氦-3收取。
- 核查：超空间与遥远星际建筑（太空港、采冰船、综合采矿设施、精金采矿船、石墨烯厂等）的维护本来就不在减免名单`SPACE_BUILDING_IDS`中，结算与收支一直按原价，未改动。太空区域的建筑维护、建造费用和其他探索任务仍然享受减免。
- 文案：电磁发射器描述与详情注明「不作用于超空间/遥远星际」。
- 兼容：存档无变化。
- 验证：`npm run check`通过（退出码0），新增区域范围用例。

## 2026-10-13 超空间太空港提供氦-3容量

- 改动：每座付费运行的超空间太空港额外提供16000氦-3容量，研究高维存储后变为32000。容量走现有储量管线，包括粒子、卡西米尔和交易所等全局加成，详情中显示为「超空间太空港」行。
- 文案：太空港描述新增「氦-3容量+16k」，高维存储描述改为「氘与氦-3容量×2」。
- 兼容：存档无变化。
- 验证：`npm run check`通过（退出码0），新增太空港氦-3容量用例（未供能为0、1座+16000、高维存储后+32000，总量与详情一致）。

## 2026-10-13 工厂配置窗口放大

- 界面：工厂生产线配置窗口宽度由360px增至504px（+40%），内边距与按钮、计数列同比放宽。纵向的行高、按钮高度、行距和上下内边距约+20%（行高25→30px）。冶炼厂工位窗口不受影响。
- 兼容：仅样式变更，无玩法变更。
- 验证：Edge浏览器验收（新增窗口尺寸检查）与生产构建通过。

## 2026-10-13 冶炼厂只提供工位

- 改动：地面冶炼厂本身不再显示资源产出和消耗，只提供冶炼厂工位+1。详情去掉了钢、铁、煤、电力等行，建筑按钮也不再显示产量。钢由钢冶炼工位产出，收支明细的来源行改名为「钢冶炼工位」。每个工位的配方在⚙弹窗中查看。
- 文案：奇诺之火、量子隧穿热处理、地热熔炉、钛冶炼的描述由「冶炼厂」改为「钢冶炼工位」。
- 数值：每个钢冶炼工位的产出与消耗不变，旧档产量不变。
- 兼容：存档无变化。
- 验证：`npm run check`通过（退出码0），Edge验收新增冶炼厂详情检查。

## 2026-10-13 版本号升级为 beta 0.5.2

- 界面：页面右上角显示版本由 beta 0.4.10 升级为 beta 0.5.2（对应遥远星际更新）。
- 兼容：仅展示版本变更，无玩法变更；存档结构版本（29）、npm 包版本与 localStorage 键不变。
- 验证：类型检查、Edge浏览器验收与生产构建通过。

## 2026-10-13 遥远星际：OverClocking-13、新区域与冶炼厂工位

- 调整：超空间太空港不再提供+25%普通资源产量，描述、结算、收支明细与详情同步移除。星环空间站的加成现在也作用于超空间与遥远星际设施生产的普通资源（含采冰船的水）。
- 新科技T20：OverClocking-13、超级金属、石墨烯加工、纳米合金、虚拟现实、虚拟训练、气凝胶、虚拟化娱乐、等离子研究、等离子采矿。
- 新科技T21：能量护盾、恒星熔炉、彭罗斯理论。价格与前置见README科技表。
- OverClocking-13：研究后写入事件「空间撕裂者在虚空中撕开了空间，形成了一个黑洞！」。超空间标签页更名为「遥远星际」，并在维度边界下方开放天元六alpha星区。
- 新区域与建筑（都不占支持或稳定度，只消耗电力或燃料）：
  - 天元六alpha星区：精金采矿船、精金加工站、石墨烯厂。
  - 卡尔维拉（中子星探索）：恒星熔炉。
  - DSR-8086（黑洞探索）：
    - 黑洞星际站：撕裂者知识容量效果+1%，电力-10/s。
    - 彭罗斯球体：100段，每段电力+5/s。
- 新资源：
  - 精金、石墨烯、纳米合金：容量0，可分配集装箱；锚点货运站各+32000容量。
  - 纳米合金：工厂生产线5石墨烯+2精金→1。
  - 锻造物气凝胶：10石墨烯+5纳米合金，每位工匠0.1/s。
- 其他新效果：
  - Asriel的VR中心：幸福度+2.5%，Asriel支持-1。
  - 虚拟训练：训练营效果5%→8%。
  - 等离子采矿：铱采矿船0.15/s、铁采矿船4/s、E-710采矿船0.012/s。
- 冶炼厂改为工位制：
  - 每座冶炼厂提供1个工位，恒星熔炉提供2个，每个工位等同于原来的一座冶炼厂。
  - 新增⚙弹窗用于调整钢冶炼工位，工位默认自动分配到钢冶炼。
  - 恒星熔炉还使工匠上限+2、锻造物产量+10%。
- 兼容：存档结构版本仍为29。缺少的新字段（建筑、资源、集装箱、生产线、气凝胶工匠、任务状态、`smelterIdle`）都按0或false读取。旧档的冶炼厂工位全部炼钢，产量不变。
- 验证：`npm run check`通过（退出码0）：
  - TS测试新增`tests/distant-stars.test.ts`（11项），覆盖科技链、蠕变、资源与容量、alpha结算与明细一致、星环、纳米合金与气凝胶、冶炼厂工位与旧档、VR、训练、黑洞站、彭罗斯和等离子采矿。
  - 太空港+25%相关的旧断言改为新数值。
  - Edge浏览器验收新增：研究日志、标签更名、区域顺序与描述、任务按钮与区域建筑、冶炼厂工位弹窗。
  - 严格类型检查与生产构建通过。

## 2026-10-13 分段建筑详情修正与撕裂者超频

- 修复：分段建筑详情的「分段进度」原先按`已建段数 % 段数`计算，建成后显示为0/100。现改为封顶显示，建成后为100/100。
- 优化：分段建筑建成后，详情不再显示「每段固定价格」及建造价格。
- 优化：空间撕裂者的描述只保留介绍文字「[AMD友情赞助] 这个巨大的装置撕开了空间的边界。」，效果改为列在「建筑效果」中：分段进度、电力+100/s、知识容量+20%（附注：建成完整撕裂者后生效）。
- 新科技「撕裂者超频」（T19，前置破维先锋，1M知识）：完整空间撕裂者的电力产出从100/s提高到200/s（`calculateBuildingOutput`，结算、收支明细与详情共用同一来源），研究后描述新增一行「空间的连接点似乎不稳定...」。
- 兼容：存档无变化。
- 验证：`npm run check`通过（退出码0）：293项TS测试（新增撕裂者超频科技与产能用例；测试夹具中「排除第三阶段后续科技」的列表补入新科技）与全部保留回归、Edge浏览器验收（新增未完成/建成/超频三种状态的详情检查）、严格类型与生产构建通过。

## 2026-10-13 建筑成本蠕变下限1.005

- 改动：`calculateBuildingScale`的实际蠕变（基础+动态）下限从1提高为`MIN_BUILDING_SCALE`=1.005，低于1.005时按1.005计算。
- 例外：分段建筑（AI超级核心、空间撕裂者）固定为1；数据中特别规定基础蠕变低于下限的建筑保持自身数值（目前只有星际船坞，固定为1，只能建1座）。
- 现状影响：目前所有普通建筑的基础蠕变≥1.17，叠加现有全部减免（CRISPR-0.05、工业至上-0.005、钢制建材与中子结构建材各-0.01）后最低约1.10，尚未触及下限。该规则为后续减免预留的保护，当前价格不变。
- 兼容：存档无变化。
- 验证：`npm run check`通过（退出码0）：292项TS测试（新增下限用例：降低后触底按1.005计价、未触底不受影响、分段与星际船坞豁免、所有普通建筑基础值≥下限）与全部保留回归、Edge浏览器验收、严格类型与生产构建通过。

## 2026-10-13 超出住房上限的猫猫立刻离开

- 改动：每个逻辑步在人口增长前检查住房上限（`enforcePopulationCapacity`），猫口超出上限的部分立刻移除，并写入一条事件日志「猫口超出住房上限，N只猫猫离开了文明。」。同时按原有优先级裁减岗位与工匠分配，重置增长进度；独立军队不受影响，不计入饿死统计。上限按向下取整计算。
- 触发场景：拆除或停用住宅、Asriel支持不足导致居住站失效、民用航线站停机、容量调整后读入旧档等。上限回升后猫口按正常增长恢复。
- 兼容：存档结构不变；旧档读取仍然接受超出上限的猫口，但会在下一个逻辑步移除超出部分。
- 验证：`npm run check`通过（退出码0）：291项TS测试（新增2项：超出即移除且保留士兵、岗位同步裁减、只记录一次日志；小数上限向下取整与上限为0）与全部保留回归、Edge浏览器验收、严格类型与生产构建通过。

## 2026-10-13 住宅平衡调整：猫猫小屋与钢制建材

- 数值：猫窝猫口容量 2→1，猫窝MKII 4→2（科技描述同步）。
- 新科技「猫猫小屋」（T3，前置农业，750知识）：解锁建筑猫猫小屋（住宅区，位于猫窝之后）。基础造价与猫窝数值相同（木材18、石头9、资金10，参数独立、不共用；没有猫窝前5座免资金的例外），基础成本蠕变1.35，猫口容量+1。
- 新科技「钢制建材」（T5，前置冶金，5000知识+500钢）：猫窝与猫窝MKII成本蠕变-0.01，与中子结构建材、CRISPR等动态蠕变累加；不影响猫猫小屋。
- 兼容：旧档缺少猫猫小屋记录时按0处理；容量下调后已有猫口超出新上限的存档仍可读取，超出部分不会被移除，只是暂停增长。结构版本不变。
- 验证：`npm run check`通过（退出码0）：289项TS测试（新增`tests/cat-housing.test.ts`5项：容量、科技层级/价格/前置、小屋造价与蠕变独立性、钢制建材减免与叠加、旧档兼容）与全部保留回归、Edge浏览器验收、严格类型与生产构建通过。

## 2026-10-13 资源收支不再单列基因加成

- 改动：资源收支明细移除「好猫基因」「奇诺之火」「完美主义」等基因加成子行。基因直接作用于基础产出，加成体现在来源行的基础数值里（例如奇诺之火10级时冶炼厂基础行由+6/s变为+6.6/s）。实际产量不变。
- 兼容：仅显示变化，无存档影响。
- 验证：`npm run check`通过（退出码0）：284项TS测试（基因用例改为断言基础行增加且不出现基因行，覆盖生产线）与全部保留回归、Edge浏览器验收、严格类型与生产构建通过。

## 2026-10-13 超空间页面延后解锁

- 改动：世界区域「超空间」标签不再一开始就显示，需第三阶段激活且建成ARPA「深空实验平台」后才出现。在此之前，第三阶段异常研究面板（含异常区探测任务与下一步提示）显示在ARPA-进度页顶部，避免探测任务→异常响应实验→深空实验平台的前置链卡死；平台建成后面板移至超空间，进度页不再重复显示。
- 兼容：纯界面门槛，存档结构不变；已建成深空实验平台的存档直接可见超空间。读入未解锁的存档时若停留在超空间视图会自动回到地面。
- 验证：`npm run check`通过（退出码0）：284项TS测试（新增解锁判定用例）与全部保留回归通过；Edge浏览器验收新增"激活前/激活后未建平台不显示超空间、面板位于ARPA进度页、建成平台后立即开放超空间且进度页不再重复"等检查并全部通过；严格类型与生产构建通过。

## 2026-10-13 威望资源显示优化、基因剪切与基因修饰

- 改动：
  - 威望资源（粒子、卡西米尔晶体）首次获得前隐藏；获得过一次即永久视为已解锁，数量归零也保持显示。两者都未解锁时整个「威望资源」栏目隐藏。
  - 新增CRISPR T1升级「基因剪切」（前置基因优化）：100粒子+25卡西米尔晶体，解锁ARPA-遗传学中的「基因修饰」栏目（还需完成本周目基因测序）。
  - 新增本周目机制「基因修饰」：4个按钮各花费200k知识制造C/G/A/T（支持Ctrl×10/Shift×25/Alt×100）；资源栏普通资源下方新增「特殊资源II」，单行显示`DNA：C-x G-x A-x T-x`。
  - 8个基因（默认0级，价格`10×2^等级`，用对应碱基升级）：好猫基因、吃苦耐劳（C）；超级工坊、完美主义（G）；泰坦之力、高级科学（A）；猫猫凝聚、奇诺之火（T）。效果同步显示在资源收支明细与幸福度/士兵数据中。
- 兼容：存档新增`prestigeUnlocked`与`geneModification`，旧档缺字段时自动推断/归零，结构版本（29）不变。基因与DNA随任何重置清零，基因剪切本身跨周目保留。
- 验证：`npm run check`通过（退出码0）：283项TS测试（新增`tests/genes.test.ts`8项：价格与扣费、解锁门槛、DNA制造倍率、升级翻倍、8个基因精确数值、真实结算与明细、存档往返与重置、威望资源粘性解锁）与全部保留回归通过；Edge浏览器验收新增基因剪切购买、基因修饰栏目、DNA行位置与实时更新、Ctrl倍率制造、基因升级、威望资源隐藏/保留显示等检查并全部通过；严格类型与生产构建通过。

## 2026-10-13 空间撕裂者完成事件日志

- 改动：建成空间撕裂者第100段时，事件日志新增一条「当前游戏主线部分已完成喵，请等待未来更新喵」。直接建造、批量建造与建造队列三种方式都会触发，且只在完成那一段时记录一次。
- 兼容：已建成空间撕裂者的旧存档不会补发这条日志；存档结构不变。
- 验证：`npm run check`通过（退出码0）：275项TS测试（新增三种建造方式触发一次的用例）与全部保留回归通过；Edge浏览器验收、严格类型与生产构建通过。

## 2026-10-13 开发与预览服务器绑定 0.0.0.0

- 改动：`npm run dev`与`npm run preview`的监听地址由`127.0.0.1`改为`0.0.0.0`，同一局域网内的其他设备可通过本机IP访问。无玩法变更。
- 兼容：浏览器验收测试仍自行绑定`127.0.0.1`，不受影响；构建产物不变。
- 验证：`npm run dev`启动后Vite同时列出本机与局域网地址，页面可访问。


> 更早版本（beta 0.4.x 及之前）的记录已归档移除；如需回溯请查阅 Git 历史。
