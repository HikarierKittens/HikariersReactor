# A5 第二阶段：生产链消费结算账本（纸面设计）

> 状态：设计完成，实施前记录。oracle 基准见 `tests/settlement-ledger.test.ts`（字节级对照，1e-9）。

## 1. 目标

`calculateProduction` 消费 `buildSettlementLedger` 已派生的运行数，不再重复运行
`settleQuantumCores` / `settlePowerPlants` / `settleSpaceProduction` /
`settleE710WarehousePower` / `settleResearchAndCulture`。
**验收：与 oracle 在全部字段 1e-9 相等。**

## 2. 关键结论（已核实源码）

- 运行数（units）不依赖幸福度：发电、太空维护投入、E-710仓库、科研、量子核心均只依赖池资源与整单位地板。
- 太空产出依赖幸福度（`space-settlement.ts` 内多处 `calculateProductionMultiplier(resource, happiness, state)`）。
- 发电产出（能量）不依赖幸福度。
- `previewMorale` 的 `moonPool`（独立供电池）是历史行为，**保持不动**。
- 唯一"运行数依赖中间池"的环节：
  - 发电阶段 `swarmSatellite` 用 `calculateSwarmSupportCapacity`（读池），地热用 `calculatePoweredWaystations(state, pool)` 读池能——但都在发电结算内部，账本按序已算。
  - 太空阶段 E-710 容器读池氦-3，外星采矿船读池油/氦-3 比率——同样按序确定。
- **账本按序重放的确定性成立**：同序、同公式、同地板 ⇒ 同池轨迹。

## 3. 回放函数设计

新增 `src/simulation/pool-replay.ts`：

```ts
export interface ReplayStep { inputUnits: Record<string, number>; outputs: Record<string, number>; energy: number }
export function replaySettledPool(
  state: GameState,
  ledger: SettlementLedger,
  dt: number,
  happiness: number,
): { pool: ResourceAmounts; steps: ReplayStep; space: SpaceSettlementOutputs }
```

按序回放（只扣款/入账，**不重新决定运行数**——运行数全部来自账本）：

1. **量子核心**：`pool.helium3 -= ledger.aiSupercoreUnits * 25 * dt`（向下截断为0）。
2. **发电**：对每个发电建筑按账本 `space` 前的 `plants.inputUnits` 扣燃料、加产出。
   - 需要账本扩展：`buildSettlementLedger` 目前只保留 `space`（太空结算原样）。**扩展点**：ledger 增加 `plants: PowerResult`（发电原样返回，含 outputs/inputUnits/energy）。
3. **太空维护**：按 `ledger.space.inputs` 中各维护项扣款——
   - 驿站能量 5*wt*dt、月面油/电、Asriel 港氦-3/电/食、塔电、第三阶段阵列/中继/货运/民用/中继器/港/冰船/基地电与 E-710、精炼厂电、E-710 容器氦-3、外星采矿船油/氦-3。
   - **注意**：太空扣款公式含 `fuelMultiplier`（由驿站数决定，账本已含驿站数）与 `geothermalUnits`（精炼加成只影响产出不影响扣款）。
4. **E-710 仓库**：`pool.energy -= e710WarehouseUnits * 7 * dt`。
5. **科研/文化**：生物 `2*dt`、数据中心 `3*dt`、广播/观光按 `calculateBuildingInput` 扣款（这些不依赖池的整单位地板——广播/观光是**连续比率**，需保留池状态按比率扣；由于按序回放池状态与原流程一致，比率相同）。

产出重算（纯函数，不改池）：

- **太空产出**：新增纯函数 `spaceOutputsFromUnits(state, space.inputs, moon, asriel, stageThree, happiness, geothermalUnits, fuelMultiplier)`，按 `space-settlement.ts` 中产出公式从账本 units 重算（冰船水、月矿、Asriel 居民产出、外星采矿船、E-710 容器）。
- **发电产出**：直接用 `ledger.plants.outputs`（能量与产出不依赖幸福度）。
- **科研产出**：单位数即产出（biology/observatory），广播/观光 units=outputs。

## 4. calculateProduction 消费账本

```ts
const ledger = buildSettlementLedger(state, dt);           // 一次结算
const morale = previewMoraleFromLedger(state, dt, ledger); // 复用账本输入，保留 moonPool 历史
const replay = replaySettledPool(state, ledger, dt, morale.happiness);
const pool = replay.pool;                                  // 与旧链逐字节一致
// 后续 factory/automation/ground/crafting/population/finalize 不变（原样消费 pool）。
```

- `previewMorale` 保持现有结构（plants 池 + moonPool 池），但其 `support` 输入改为账本（已经是——`calculateSupportPreview` 现在就是账本薄封装）。
- **计数**：一次 `calculateProduction` 中 `settlePowerPlants`/`settleSpaceProduction` 各执行 1 次（在账本内）。`previewMorale` 里额外的两次 `settlePowerPlants`（coalRatio 池 + moonPool 池）为历史保留——**这两次是否也去掉？** 决定：保留（行为历史），但账本去重的目标是"生产主链不再重复结算太空链"，即 `settleSpaceProduction` 从 2 次（账本+生产）降为 1 次（账本），量子/E-710/科研同理。

## 5. 已识别风险与回退

| 风险 | 处理 |
|---|---|
| 发电 `swarmSatellite` 比率依赖池 | 账本发电已定 units，重放只扣款/入账——但 `swarmSatellite` 的 units 本身由 `calculateSwarmSupportCapacity` 决定（与池无关，读建筑+量子），安全。地热的 `calculatePoweredWaystations(state, pool)` 读池能——**在账本发电时已按当时池决定**，重放不再重算，安全。 |
| 太空阶段 E-710 容器/采矿船读池比率 | 同上：units 已由账本决定，重放只扣款。 |
| 广播/观光连续比率 | 按序回放池状态与原流程一致 ⇒ 比率一致。 |
| 幸福度产出 | 纯函数重算，池只入账产出（与原链一致：原链也是"扣款按单位，入账按幸福度产出"）。 |
| `withPoweredMetalRefining` 嵌套 | 保留在生产侧（精炼 units 来自账本 space），不影响池。 |

**回退**：若任何一步重放与旧链池状态不等（1e-9 内），保留该 settler 在生产内联、只去掉"账本+生产"重复的运行数决定部分，并在报告中明示。

## 6. 实施顺序

1. 扩展 ledger：增加 `plants` 字段（一次发电原样结果）。
2. 写 `tests/pool-replay.test.ts`：`replaySettledPool` 与"旧链逐步运行在克隆池上"deepEqual（池逐字段 + inputUnits/outputs）——先写测试（会失败）。
3. 实现 `src/simulation/pool-replay.ts` + `spaceOutputsFromUnits` 纯函数。
4. pool-replay 测试全绿后，改 `calculateProduction` 消费账本。
5. oracle（settlement-ledger.test.ts）必须仍全绿；新增计数断言：一次生产 `spaceRuns === 1`。
6. `npm test` 全量 + typecheck。

## 7. 不做的事

- 不改 `previewMorale` 的双池历史行为。
- 不改任何维护优先级、整单位规则、燃料折扣。
- 不动 UI/package/浏览器测试（父代理负责）。
