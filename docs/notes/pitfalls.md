# 踩坑笔记

按「症状 → 原因 → 做法」记录已经付过代价的问题。新会话先读这里，别重新踩。

## 1. 中文文档被 PowerShell 写成乱码

- **症状**：`updatelog.md` 全成 `鏇存柊鏃ュ織` 这类乱码；`git diff` 显示数百行增删。
- **原因**：`Get-Content -Raw | Set-Content -Encoding UTF8` 会按控制台代码页解码再编码，中文往返即损坏。
- **做法**：源码/文档一律用 read/edit/write 工具。必须用脚本时写 `tmp/*.mjs`，内部 `fs.writeFileSync(path, text, 'utf8')`。已经损坏就用 `git checkout -- <file>` 从仓库恢复后重写。

## 2. 浏览器验收失败但看不出原因

- **症状**：`--dump-dom` 只拿到 `<pre id="result">running</pre>`，没有任何错误信息。
- **原因**：页面里的 `window.onerror` 装在内联 module 里；模块**解析阶段**的语法错误会让该模块整体不执行，于是既没有断言也没有错误。
- **做法**：已在 `acceptance.html` 的 `<head>` 加经典脚本，把错误写进 `#result`；`run-browser.cjs` 失败时打印过滤后的 console。复现验证用 `ACCEPTANCE_PAGE=tests/browser/failure-selftest.html`。

## 3. 往验收页里写了 TypeScript 语法

- **症状**：整页停在 `running`，`RESULT` 从未出现，超时后报「no result element」。
- **原因**：`<script type="module">` 里写的是普通 JS；`state.tech = [...] as typeof state.tech` 会解析失败（Vite 不做类型擦除）。
- **做法**：不写 `as`、类型注解、`satisfies`。需要类型提示就改用注释。

## 4. 手搓存档 fixture 一律被校验拒绝

- **症状**：`士兵数据无效`／`经济记录无效`／`科技前置关系无效`，即使 JSON 看起来完整。
- **原因**：旧版本的 `createInitialState` 缺新字段；手工构造时要么补出旧版没有的键（例如给 `stoppedBuildings` 写一个旧注册表里不存在的 ID），要么漏掉旧版校验要求的键。
- **做法**：`npm run fixtures:make -- <git-ref> <name>`。它用 git worktree 检出旧版本、复用当前 `node_modules`，跑旧版自己的 `createInitialState` 导出真实存档。生成后清理工作树。

## 5. `npx tsx -e` 看不到输出

- **症状**：动态 import 的探针没有任何 stdout。
- **原因**：`tsx -e` 的内联脚本在动态 import 场景下会吞输出。
- **做法**：把探针写成 `tmp/probe.ts`，用 `npx tsx tmp/probe.ts` 跑。

## 6. 改了 `NEXT`/注册表后旧存档报「记录无效」

- **症状**：新档正常，旧档载入失败且提示某个记录无效。
- **原因**：新增字段/建筑后，旧存档缺少对应键，而校验逐键要求存在。
- **做法**：在 `state/save-compatibility.ts` 加窄范围默认值（不修改输入对象），并补 `tests/previous-release-save.test.ts` 用真实旧版 fixture 断言可载入、往返、非法拒绝。

## 7. 测试文件写了却没跑

- **症状**：以为全绿，其实某个测试文件从未执行。
- **原因**：`package.json` 的 `test` 脚本原来是手工枚举 82 个文件，`tests/retired-anomaly.test.ts` 就漏了数个版本。
- **做法**：已改为 `scripts/run-tests.mjs` 自动发现 `tests/**/*.test.ts`。新增文件不用登记；用 `npm test -- <关键字>` 可只跑相关文件。

## 8. 归一化链顺序错了，新增默认值会绕过严格校验

- **症状**：给 `normalizeSchemaSave` 加一步迁移后，`save-compatibility` / `outer-space` 里「显式非法值必须被拒绝」的用例反而失败，或校验报错对不上。
- **原因**：把 additive 默认值（`ADDITIVE_BUILDING_IDS`、`wounded`、`neighbors`…）放在迁移**之前**（`raw.version` 还是旧值，于是被跳过），或让新迁移对已是最新 schema 的记录也生效（把玩家手改的非法值悄悄"修好"，违反「显式非法数据必须拒绝」）。
- **做法**：固定链为 `upgradeSchema31To32 → upgradeSchema32To33 → normalizeAdditiveDefaults`，每一步只对**它负责的旧版本**生效（`raw.version !== N → return raw`）。迁移只做"改变含义"的转换，默认值只补**缺失**的键。改完必跑 `npm test -- save-compatibility segmented-one-off`。

## 9. 给完成态建筑加 `max` 会打爆老存档

- **症状**：给完成态条目加 `max: 1` 后，`validate-economy` 用 `building.max` 当存档数量上界，老存档里合法的 `spaceRipper = 3` 直接判「建筑数据无效」，玩家进不去存档。
- **原因**：`max` 同时承担**存档数量上界**和**购买上限**两个语义。
- **做法**：一次性规则要在迁移里先把计数夹到 1（`upgradeSchema32To33` 的 `dropFinishedConstruction` 就是这么做的，且只在 `version === 32` 时生效），不要只加 `max` 就完事；必须同时验证「多座旧档能载入且被夹到 1」。

## 10. 收紧科技前置会锁死老存档

- **症状**：给 `spaceControlTower` 等科技换前置后，几乎所有历史 fixture 都报「科技前置关系无效」，连 `save-compatibility`/`neighbors` 这类与科技无关的用例也全红。
- **原因**：`validateUnlockRecords` 对**已研究的科技**逐个校验 `pre`，所以任何前置变更都会让老档里合法的研究记录变成非法。
- **做法**：照 `RETARGETED_PREREQUISITE_TECH` 的模式加一个「只容忍这一个新前置缺失」的白名单（本次是 `ALIEN_SETTLEMENT_RETARGETED`），并**保持 `isTechnologyUnlocked` 对新研究仍强制新前置**——研究门槛与历史校验是两件事。同时补一条「旧档能载入且新研究仍被拦住」的测试。

## 11. 「授予全部科技」的测试夹具会意外激活新被动

- **症状**：新增一个带全局加成的科技（世界统一 +25% 产量/储量）后，一批与它无关的 VM 数值测试开始 `0.125 != 0.1` 这类偏移。
- **原因**：这些 fixture 用 `Object.keys(TECHNOLOGIES).filter(t => ![排除列表].includes(t))` 授予全部科技，新科技自动进入，被动加成渗进每一个数值断言。
- **做法**：新增带全局被动/倍率的科技时，把它加进这些排除列表（本次 `test-moon.cjs`、`test-asriel-core.cjs` 共 9 处），并在更新日志里注明；否则失败信息只会显示「产量多了 25%」，很难指向真正原因。

## 12. 装备科技有两份注册表，只改一份等于没效果

- **症状**：科技树里已经能看到「士兵基础战斗力+1」的 `effects` 文案，但军事页的数字纹丝不动，也没有任何报错。
- **原因**：`effects` 只是展示文本，真正的数值在 `src/data/military.ts` 的 `COMBAT_POWER_TECH_BONUS` / `DEFENSE_TECH_BONUS` 里按 ID 逐个登记。`calculateCombatPower`/`calculateSoldierDefense` 遍历的是这两个表，不是 `TECHNOLOGIES`。
- **做法**：新增或调整装备科技时**同时**改 `data/technologies.ts`（tier/价格/前置/effects）与 `data/military.ts`（对应的 +1）。`tests/soldier-stats.test.ts` 会核对注册表内容、`soldierStatBreakdown` 明细与最终数值三者一致，漏改一份会直接红。

## 13. 防御力一旦进入 `raidStrength` 就变成进攻科技

- **症状**：加了减伤机制后，突袭预览的「我方战力」莫名其妙变高，原本打不过的国家突然能打了。
- **原因**：`raidStrength = 士兵数^0.75 × 单兵战斗力`。如果把防御力顺手塞进 `calculateCombatPower` 或 `raidStrength`，减伤属性就顺带提升了门槛判定与掠夺量，语义完全变了。
- **做法**：防御力只乘在 `previewRaid` 的 `expectedLosses` 与 `retaliate` 的损失上，`strength`/`required` 保持只由战斗力决定。`tests/soldier-stats.test.ts` 直接断言「穿满防御装与裸装的 `strength`、`required`、`available` 完全相同，只有 `expectedLosses` 变小」。

## 14. 新增数据模块后忘了登记 VM 桥接，全 VM 回归报 `X is not defined`

- **症状**：模块测试全绿，但 `npm test` 里所有经典 VM 回归（`test-moon.cjs`、`test-asriel-core.cjs` 等）同时失败，报 `ReferenceError: SOLDIER_FUR_BASE is not defined`，指向 `assets/generated/government.js`。
- **原因**：VM 套件跑的是 `scripts/generate-legacy-data.cjs` 用 `ts.transpileModule` 生成的经典脚本；它把每个模块的 `import` 行整行删掉，靠全局变量串联。`data/military.ts` 是新文件，不在 registry 里，于是 `government.js` 里引用的常量全部未定义。
- **做法**：新增 `src/data/*.ts` 被 `simulation/*` 引用时，往 registry 里加一行 `['military-data', 'data/military']`，**并保证它排在所有引用它的模块之前**（顺序即加载顺序）。`assets/generated/` 是 gitignore 的产物，改完源码要重新跑一次 `node scripts/generate-legacy-data.cjs` 才能看到效果；`npm run check` 不会自动重建它。

## 15. 结算里乘了倍率，明细里却没有对应行

- **症状**：占领敌对国家后，「税收 −10%」和「产量 +5%」在资金/资源收支明细左列完全看不到；玩家只能看到数字莫名变小/变大，无法确认来源。世界统一 +25% 同理。
- **原因**：`calculateGlobalOutputMultiplier` 把 `occupationOutputMultiplier` / `unificationOutputMultiplier` 乘进每一个资源的结算，但 `calculateResourceFactorRows` 是**手写**的行清单——它列了幸福度、粒子、精通，却从没列这两个。结算与明细是两套独立代码，漏一处不会报错，只会静默不一致。
- **做法**：凡是新增「乘进 `calculateGlobalOutputMultiplier` 或其它全局结算倍率」的效果，必须在 `resource-breakdown.ts` 里同步加行；本次抽成 `addGlobalOutputRows()` 在资源行末尾统一调用。两个例外要记住：**`energy` 必须排除**（固定供给预算，`settlePowerPlants` 从不乘全局倍率，加行就是撒谎）；**`catTax` 不能被 `value !== 0` 过滤掉**（税收被压到 0 时正是最需要解释的时刻）。`tests/world-unification.test.ts` 的「the resource detail lists the occupation output bonus and the tax penalty」覆盖了这五种组合。

## 16. 手写映射表缺一项不会报错，只会静默少一个颜色

- **症状**：给科技加了分类配色后，新加的科技按钮没有边框色（退回默认的 `#393631`，几乎看不见），但控制台、类型检查、测试全绿。
- **原因**：`TECH_CATEGORIES` 是 `Record<TechnologyId, TechCategory>`——TypeScript 只在**字面量声明时**检查完整性；如果后来往 `TechnologyId` 联合类型里加了 ID，`Record` 会要求补全，但如果新科技走的是已有 ID 或有人用了 `as`，就完全绕过检查。运行时 `techCategory()` 返回 `undefined`，Vue 渲染出 `data-tech-category="undefined"`，CSS 匹配不到任何规则。
- **做法**：`tests/tech-categories.test.ts` 的第一项就是「每个科技都有类别、且没有未知 ID」，双向遍历 `TECHNOLOGIES` 与 `TECH_CATEGORIES`。凡是新增这种「按 ID 手写一张表」的机制（分类、配色、排除列表），都要配一个全量覆盖测试——这类遗漏靠 review 是抓不住的。

## 17. `watch` 看不见谓词函数内部读了什么

- **症状**：`useFocusLayout` 用 `watch([activePanel, ...sources], evaluate)` 实现，切换科技子视图时布局**完全不更新**，也没有任何报错；把漏掉的 ref 手动加进 `sources` 就恢复正常。
- **原因**：`watch` 只能追踪它被显式告知的响应式源。谓词 `() => techView.value === 'completed'` 里读的 `techView` 对 `watch` 不可见——它只看到函数引用本身，而函数引用不会变。这类 bug 静默、偶发、且只在「忘了列依赖」时出现。
- **做法**：把派生逻辑放进 `computed`，谓词在 computed 里执行，Vue 自动收集它读到的每一个 ref。调用方不再需要维护依赖数组，也就没有「忘记列」这种失败模式。同理，`requests` 表的**键必须与 `activePanel` 的值同源**（本次曾用面板名 `techTree` 而 `activePanel` 存的是标签页 id `tech`，谓词永远查不到）；`tests/focus-layout.test.ts` 对这两点各有一条专项测试。

## 18. 隐藏一列不等于获得空间：先看断点

- **症状**：专注布局隐藏右列后，中间列反而从 721px 变成 526px。
- **原因**：视口只有 756px，已落入 `max-width:1100px` 断点——该断点把 `.col-right` 移到下方并设为整行宽，三列网格实际只剩两列。此时把列宽改写成 `1fr 3fr` 等于把中间列从「占满剩余」压成「四分之三」。
- **做法**：列宽改写必须限定在真正有第三列的宽度区间（`@media(min-width:861px)`），`display:none` 可以无条件生效。浏览器验收按 `innerWidth` 分别断言「宽屏变宽 / 窄屏不变宽」，避免用单一预期掩盖这个差异。

## 19. 验收用例里的滚动操作会污染后续用例

- **症状**：给资源列表加「独立滚动」的浏览器断言后，**后面所有用例**开始连锁失败（`研究外星定居后开放四项Asriel科技`、`Missing click target` 等），而这些断言本身全绿。
- **原因**：该断言块派发了 `WheelEvent` 并修改了 `scrollTop`，把**页面滚动位置**从顶部挪到了 669px。后续用例通过 `click($(...))` 操作按钮，而验收页的 `click` 依赖元素在视口内；页面被滚走后，早期位于顶部的元素不在可视区，点击落空。
- **做法**：① 断言块只做纯 DOM 操作（临时改 `style.maxHeight` 制造溢出），**不修改任何游戏状态**；② 有滚动副作用的用例放到脚本**末尾**（`mounted.app.unmount()` 之前），此时依赖页面位置的用例已跑完。定位方法：用 `git stash` 分别回退功能代码与测试块，确认「只有测试块存在时才失败」，再二分块的位置。另外注意 `Object.assign(state, snapshot)` **无法移除数组多出来的元素**，还原数组要显式赋值或 `replaceState`。

## 20. `position:sticky` 需要「更大的容器」才有移动范围

- **症状**：给左列写了 `position:sticky; top:0`，页面滚动时它照样跟着滚走，`getBoundingClientRect().top` 从 36 变成 −89，且没有任何报错。
- **原因**：sticky 的移动范围 = **网格/流式行高 − 自身高度**。`.layout` 是 `align-items:start`，网格行高会被压成列自身高度，两者相等 → 移动范围 0 → sticky 等于没写。同理，只给列写 `max-height` 而不写 `height`，列高仍由内容决定，`flex:1` 的子元素也分不到空间。
- **做法**：`align-self:stretch`（让行高等于整页高度）+ `height:100vh`（把列本身锁在视口内），两个都要。验证方式是实测而不是读 CSS：注入一个 2400px 的中列填充，滚 300px 后断言 `colTop` 不变。
- **相关**：验收浏览器视口通常只有 756px，落在 `max-width:860px` 的窄屏断点内，宽屏规则根本不生效——必须用 **iframe 指定宽度**验证布局。但 iframe 内**不执行脚本**，合成 `WheelEvent` 不会触发监听器，`defaultPrevented` 恒为 false，滚轮类断言只能放在主页面。

## 21. `flex:1` 会把面板拉满，内容少时留下大块空白

- **症状**：资源列表最后一行与「锻造物」之间空出一大块，资源越少空得越多；玩家截图反馈。
- **原因**：给资源面板写了 `flex:1 1 auto`。`flex-grow:1` 是**无条件**的——不管内容多少都会拉伸填满容器剩余高度。资源少时面板被拉到 650px、内容只有 145px，中间空 500px。
- **做法**：用 `flex:0 1 auto`（basis 取内容高度，只在放不下时收缩）+ `min-height` 保底。想「只在内容溢出时才吸收剩余空间」也可以，但要用 CSS 属性选择器配合 JS 维护的标记，而 `data-overflowing` 由 ResizeObserver 测量得出、测量又依赖布局，会形成循环——直接用 `0 1 auto` 更简单且无循环。测试里显式断言「不能出现 `flex:1 1 auto`」，防止以后有人改回去。
- **重要限定（beta 0.9.25 补充）**：这条只适用于**不可滚动**的面板。同一个 `flex:1 1 auto` 加在**可滚动容器**上是对的——容器内部的剩余高度不会显示成空白，它只是可滚动区域的可用高度（多出来的空间在滚动内容之外，不产生视觉空白）。所以后来把左栏三块内容合并成一个 `.col-left-scroll` 滚动容器时，那里就该用 `flex:1 1 auto`，并且必须配 `min-height:0`（flex 子元素默认 `min-height:auto`，不加这一条容器会被内容撑开、永远不产生滚动条）。判断标准不是「flex 值」而是「这个盒子会不会滚」。

## 22. 改共用组件的样式必须限定作用域

- **症状**：为了修「资源明细弹窗里长数值被折行」，把 `.resource-factor` 的 grid 改成 `max-content max-content`、名称列改成 `nowrap`。资源明细好了，但浏览器验收里「全部131种建筑真实悬停效果列不挤压、不重叠、不溢出」几乎全部失败。
- **原因**：`.resource-factor` 是**建筑弹窗和资源明细弹窗共用**的行组件。建筑弹窗固定 242px 宽，本来就靠换行容纳长文本；把换行能力去掉，长内容只能撑破容器。**同一个类被两个不同宽度的容器使用时，它的布局规则不能只为其中一个优化。**
- **做法**：新规则全部加 `.resource-detail` 前缀（`.resource-detail .resource-factor{...}`），基础规则保持原样。并在测试里加一条**反向断言**：基础 `.resource-factor` 不得含 `max-content`、基础名称列必须仍是 `white-space:normal` + `overflow-wrap:anywhere`。这类「不要污染共用基础规则」的断言比正向断言更容易漏，但正是它挡住了这次回归。

## 23. CSS 特异性：`>span` 会静默压过 `.value`

- **症状**：给数值列写了 `white-space:nowrap`，浏览器里长数值**仍然折行**，且没有任何报错；`getComputedStyle` 显示 `white-space:normal`。
- **原因**：`.resource-factor-value{white-space:nowrap}` 的特异性是 **0,1,0**，而同一元素还命中 `.resource-factor>span{white-space:normal}`，特异性 **0,1,1**。后者更高，静默胜出。同类陷阱：`.resource-factor>span` 会覆盖任何只写单个类名的属性。
- **做法**：先算特异性再写规则。需要压过 `.a>span` 时，用 `.scope .a>span.value`（0,3,1）这类更具体的选择器，不要靠 `!important`。调试方法：把 `document.styleSheets` 里所有命中该元素的选择器和它们声明的属性打印出来对比，比猜快得多。另外 `getComputedStyle().width` 返回的是**解析后的像素值**，不是 `max-content` 这类关键字——断言宽度策略要读 `getBoundingClientRect()` 的实际像素或回到 CSS 文本层断言。

## 24. 布局 bug 必须用真实组件测量，手工 DOM 会漏掉父级约束

- **症状**：修好「长数值折行」后玩家立刻回报「看起来它还是坏了」——截图里数值确实单行，但弹窗右侧空出一大块。我的探针（手工拼的等价标记）显示一切正常，所以第一轮修复后我没发现。
- **原因**：手工 DOM 探针只复制了**结构**，没有复制**父级约束**。真实弹窗上还有 `min-width:400px`，它把容器撑到 400px，而内容只有 175px，右侧空出 225px。手工探针里那个类没有命中同样的宽度规则，所以测不出空白。
- **做法**：布局类 bug 一律测量**真实组件**——用 `mountGame` 起真实应用，构造真实存档状态（解锁资源、给足产量），对真实锚点派发 `pointerover`，再读 `getBoundingClientRect()`。测量要打印**完整的父子链几何**（每个直接子元素的 `y`/`x`/`w`、两列各自宽度、`widest` 后代），并算一个显式指标，例如 `trailingGap = tipWidth - paddingRight - lastValue.right`。有个具体数字才能判断「空白 129px」是 bug 还是设计。
- **顺带**：断言空白用**相对量**（`tipW - padding - columnsW <= 2`）而不是固定宽度（`width === 400`）。固定值会在每次调整设计时误报，相对量锁的是「不留空白」这个不变量。

## 25. 新增科技会连带打断一堆「部分科技」测试夹具

- **症状**：加完三个新科技后，`npm test` 一次冒出 9 个失败，全是 `科技前置关系无效。`，但报错行指向的文件和本次改动毫无关系（`hyperspace-energy`、`stage-three`、`test-moon.cjs` …）。
- **原因**：这些测试用 `Object.keys(TECHNOLOGIES).filter(id => ![...排除列表].includes(id))` 手工构造「研究到某个阶段」的科技列表。新科技的前置（`nanoAlloy`、`silicateCement`、`carbonNanotubes`）被它们排除掉了，于是存档校验发现「子科技在、父科技不在」而拒绝。
- **做法**：**给某个科技加前置后，必须同步所有排除列表**。用脚本一次性给这些文件的排除列表补上新 ID（它们都已含 `nanoAlloy`，按同一锚点插入即可），比一个个改快且不易漏。定位手法：`npm test` 的 `AssertionError` 后面跟的 `actual message` 是存档校验的原文，按它去 grep `validate-unlocks.ts` 的抛出点，就能确认是前置缺失而非逻辑错误。

## 26. 退役科技必须同时豁免「前置校验」

- **症状**：把 `agriculturalMachinery` 加进 `RETIRED_TECHNOLOGIES` 并在两个界面隐藏后，含该科技的旧存档仍被拒载，报 `科技前置关系无效。`。
- **原因**：`validateUnlockRecords` 会校验每个已研究科技的前置都在 `state.tech` 里。退役科技虽然没效果了，但它仍带着 `pre: ['automation', 'electricity']`；如果历史存档因为更早的 retarget 而没有其中一个父项，整档就会被拒。
- **做法**：在 `validateUnlocks` 的科技循环开头对退役 ID 直接 `continue`——它们的**效果已删除，前置图不再有意义**，而 `isTechnologyUnlocked` 又恒返回 false，所以豁免不会打开任何新研究。这是「已合法获得的进度不得失效」这条硬要求的直接实现。
- **配套**：`RETIRED_TECHNOLOGIES` 原本放在 `src/vue/tech-categories.ts`，但 `simulation/unlocks.ts` 也要用同一份名单，而项目禁止 `simulation → vue` 反向依赖。把它下沉到 `src/data/technologies.ts` 定义、由 vue 层 `export { ... } from` 转出，保持单一真相且依赖方向不变。

## 27. 注册表级的「同名是设计」不等于面板行不该唯一

- **症状**：玩家报告「解锁戴森球后建筑页出现两个戴森球」。而 `tests/segmented-naming.test.ts` 全绿——它断言的正是「两条注册表记录必须同名」。
- **原因**：那条测试锁的是**注册表层**的约定（分段态与完成态共用 `name`，靠行内计数区分），但没断言**渲染后**的行是否唯一。而未开工时两条记录的计数**都是 `0`**，原设计假定的「靠计数区分」在这个窗口期失效。测试和界面各自都「自洽」，合起来却是坏的。
- **做法**：修 `withConstructionPhases`，让未建成时**只渲染建造行**，完成体建成后才出现——而不是给分段行加后缀。理由是完成体在未建成时既不能购买也没有开关，纯展示行没有信息价值。**改动前先看既有测试与 `docs/agent-map.md` 里的设计决定**，避免用「加后缀」这种和既定约定打架的方案。
- **更一般的教训**：当一个 UI bug 与某条通过的测试看起来矛盾时，先确认那条测试锁的是**哪一层**。层与层之间的空隙（这里是「注册表正确」→「渲染正确」）正是 bug 藏身处。断言要落在**用户能看到的那一层**：这次补的 `tests/segmented-row-names.test.ts` 直接断言 `withConstructionPhases` 的返回列表，比断言注册表字段更贴近界面。

## 28. 进了 `HYPERSPACE_CONSUMER_IDS` 才算真的扣费

- **症状**：AI数据中心建好后，电网 `requested` / `used` 都把它算进去了，但 `rates.energy` 一点没降。也就是说电力「被要求了却没被扣」。
- **原因**：卡尔维拉建筑有两条并行路径。`getBuildingPowerDemand` 只影响**电网的分配与缺电停用判定**；真正从池子里扣资源的是 `space-settlement` 里的两个循环——`HYPERSPACE_SOURCE_IDS`（有产出）和 `HYPERSPACE_CONSUMER_IDS`（只有维护费）。新建筑忘了进任何一个循环，就变成「计入需求但不扣费」。
- **做法**：没有任何 `output` 的维护型建筑必须加入 `HYPERSPACE_CONSUMER_IDS`（`hyperspace-output.ts`）。同时**不要在循环里写死数字**——`pool-replay` 里的 `* 10` 曾经和注册表的 `energy: 10` 并存，本次把精金精炼站改成 5 时只改注册表就会让重放与结算各扣一个数。统一读 `calculateBuildingInput(id, state)`。
- **验证手法**：加完建筑后直接跑 `calculateProduction`，对比 `power.used` 与 `generated - rates.energy`。两者不等就说明有人算了需求却没扣费。

## 29. 会自己算数值的结算函数不能反向调用「求值」入口

- **症状**：在 `settleSpaceProduction` 里调用 `calculateQuantumLevel(state)` 后，测试直接栈溢出 / 无限递归。
- **原因**：`calculateQuantumLevel` → `calculateQuantumSnapshot`（无快照分支）→ `calculateSupportPreview` → `buildSettlementLedger` → `settleSpaceProduction` → 回到起点。
- **做法**：**结算函数只接受调用方传进来的既有数值，绝不自己求解**。本次把量子水平的求解提到 `calculateProduction` / `buildSettlementLedger` 的入口处，再作为 `quantumLevel` 参数向下传给 `settleSpaceProduction`、`settleGroundProduction`、`replaySettledPool`、`replaySpaceDebits`。附带好处是「显示与结算同源」：石墨烯加成只解一次，工具提示与池子重放不可能不一致。
- **顺带**：这类参数故意**默认 `0`** 而不是「省略时自动求解」。默认值是安全的常量，漏传最多是「本次没有加成」，不会变成递归；如果默认写成求解，任何一个新的调用点都会埋一颗定时炸弹。

## 30. 新增按钮态前，先看旧禁用条件是否还成立

- **症状**：生产线抽取的后端逻辑（`changeFactoryAssignment`）测试全绿，但浏览器里玩家点不动——`»` 按钮在容量满时是 `disabled`。
- **原因**：模板里的禁用条件还是旧规则 `used >= cap`，而新规则是「有空余**或**有合金可抽」。后端能力已扩展，前端闸门没跟着放开。
- **做法**：把「能否增长」抽成一个具名函数放在组件里（本次是 `canGrow(id)`），模板只调它。这样规则变更时只有一处要改，而且函数名直接表达语义（`used >= cap` 这种表达式读起来像「满了」，很容易骗过 review）。
- **一般化**：**给某个动作放宽条件时，`grep` 一下这个动作的所有闸门**——后端早退、按钮 `disabled`、`aria-*`、空态文案。只改一层的结果是「功能测试通过但界面不可用」，而这类问题模块测试永远抓不到，只有浏览器验收或真人点击才会暴露。

## 31. 工具提示的 `percent` 是 `formatEffectNumber`，不是 `vue/format` 的 `percent`

- **症状**：AI数据中心改成「单座加成」后，模块测试断言 `+0.06%` 通过，浏览器验收却拿到 `+0.0629%`，同一个数字两种格式化结果。
- **原因**：`TooltipPanel.vue` 给 `addBuildingEffectRows` 传的是 `percent = formatEffectNumber`（`shared/format.ts`，绝对值 <10000 时保留**四位**小数），而 `vue/format.ts` 的 `percent` 是两位小数。自写显示测试时顺手 `import { percent } from '../vue/format'`，就等于用了一个真实界面根本不会用的格式化函数。
- **做法**：写显示断言时**照抄组件实际传入的实参**（这里是 `formatEffectNumber`），不要用「名字看起来对」的那个函数。浏览器验收里则不要硬拼期望字符串，改成解析出行内数字再用容差比较（`Math.abs(shown - q/1.75) < 1e-3`），这样格式化精度变化不会误伤断言，而「显示总量还是单座」的语义差异仍然能被抓到。
- **一般化**：凡是「测试里复刻组件行为」的用例，复刻的必须包括**依赖注入的实参**。`addBuildingEffectRows` 把格式化器做成参数，本身就是为了让显示与组件不漂移；测试绕过去注入别的函数，等于把这道保险卸掉。

## 32. 自作主张给效果行加解释小字，会被要求全部删掉

- **症状**：AI数据中心的四条效果行原本各带一行解释（「每座完整建成并运行的中心加算5%基础倍率（当前 2 座）。」「每座运行中的中心：量子水平 8.33 / 1.75%。」），数值还带 `/座` 后缀。玩家看完直接要求全部移除。
- **原因**：给「加一行效果」这个明确需求顺手补了机制解释和单位后缀，属于**交付了需求之外的内容**，而这类文案在悬停面板里会挤占空间、也让一行数值变得啰嗦。
- **做法**：需求没写的小字、括注、单位后缀一律不加；机制解释写进 `docs/glossary.md`（已经写入 `AGENTS.md` 第 9 条）。数值行保持「名称 + 数值」两项。
- **配套测试**：`tests/t21-ai-data-center.test.ts` 的显示用例不只断言数值，还断言 `note === ''` 且数值不含 `/座`；浏览器验收也有一条「效果行没有额外小字说明或 `/座` 后缀」。这类断言能防止以后有人「顺手加一句解释」又把它带回来。

## 33. 往 `powerActivationOrder` 写「不需要供电」的建筑，会让存档下次载入被拒

- **症状**：玩家更新到 0.9.28 后一进游戏就是新档、进度归零，设置页却能看到「导出不兼容的旧版本存档」——也就是保护模式生效、原档其实没被覆盖。控制台报「供电开启顺序数量无效」。真实存档里 `stellarForge` 有 3 座，`powerActivationOrder` 却有 4 条。
- **原因**：`registerBuiltPowerUnits` 无条件 `if (enabled) order.push({ id, count: enabled })`。恒星熔炉是 `powerPlant: true, alwaysRunning: true`，`getBuildingPowerDemand` 对它返回 0，所以 `enabled = newlyEnabled`（本次新建数）——但供电顺序只记录**需要供电的负载**，这条记录永远不会被消费，于是每建一座就多一条，累积到 `order > 已建数` 后 `validatePowerActivationOrder` 拒绝整档。
- **另一个坑**：想用「给 `stoppedBuildings` 加一以隐藏新单位」来算历史运行数，对 `alwaysRunning` 建筑**完全无效**——`countRunningBuildings` 会忽略 `stoppedBuildings`（`housing.ts:12`）。必须用函数入参 `beforeCompleted` 推建造前的运行数。
- **做法**：`demand <= 0` 直接 return，发电/常开建筑永不进供电顺序；写入时用「已有条目合计 + 本次启用数」替换该建筑原有条目，保留其原有优先级位置，不要 `push` 一条新的。
- **自愈**：已经被写坏的存档由 `save-compatibility.ts` 的 `clampActivationOrder` 在载入时夹到运行数。**修复必须严格限定在「数量超限」这一种情况**：条目要恰好是 `{id, count}` 正整数，否则原样透传。第一版实现重建了 `{id, count}` 对象，结果把 `extra: true` 和超长数组（10001 条）都「修复」成了合法档，被既有测试 `explicit malformed activation order is rejected` 抓到——这正是那条测试存在的意义。
- **诊断经验**：载入失败原本只有一句笼统日志，只能靠猜。给 `validateCurrentSave` 每步加阶段标签、并用 `console.warn` 把真实原因打到控制台后，这次问题一条命令就定位了。注意用 `console.warn` 而不是 `console.error`：验收页把所有 `console.error` 记成失败断言。
- **配套测试**：`tests/power-order-repair.test.ts`（4 项）覆盖写入端不污染、负载逐座登记、超限夹取、不臆造缺失条目；`tests/power-order-save.test.ts` 的同名用例改为「超限夹取」并保留「格式非法仍拒绝」的整组断言。

## 34. `ratio` 可能是 `Infinity`，别用 `!Number.isFinite` 一刀切成 0

- **症状**：新加的「削减敌方军事」里，`raidMilitaryDamage(Infinity)` 返回 0，本该返回 10% 上限。测试 `the reduction share scales with how decisively we outmatch the defender` 直接抓到。
- **原因**：`previewRaid` 里 `const ratio = required > 0 ? strength / required : Infinity`——当守备为 0（`required === 0`，例如敌方军事已被削到下限以下或为 0）时 `ratio` 就是 `Infinity`。防御性写法 `if (!Number.isFinite(ratio) || ratio <= 0) return 0` 把「无限优势」当成了「非法输入」。
- **做法**：只挡真正的非法值（`Number.isNaN(ratio) || ratio <= 0`），让 `Infinity` 自然走 `Math.min(1, ratio / 2)` 落到上限。凡是拿 `strength / required` 比值做后续计算的函数，都要先问一句「分母为 0 时这里是什么」。
- **相关**：`assert.ok(x, someOptional)` 在 `exactOptionalPropertyTypes` 下会报 TS2769（`string | undefined` 不能当 message），用 `String(...)` 或 `?? ''` 包一层。
- **配套测试**：`tests/neighbor-military-raid.test.ts`（8 项）。其中 4 项在「执行端不真正扣军事」时会变红，是这套机制的核心守卫。

## 35. 界面砍掉预估后，别忘了 simulation 里那份 `loot` 还有别的读法

- **症状**：临近势力面板按需求删掉「可掠夺资源预估」后，很容易顺手把 `previewRaid` 的 `loot` 一起删掉，以为没人用了。
- **原因**：`loot` 的消费者不止界面。`tests/raid-economy.test.ts` 大量用 `previewRaid(...).loot` 断言经济差异，`executeRaid` 也走同一套 `raidLoot`。删掉会让结算失去预览依据、并让一批测试失去意义。
- **做法**：只删界面那一行，以及因它而死的 `buildRaidEconomy` 调用；`previewRaid` 的 `loot` 字段保留。界面侧不传 `economy` 时 `loot` 回退为 `EMPTY_ECONOMY` 的空对象，正好顺带省掉每次按键的一次重算。

## 36. 新增 simulation 模块后，忘登记 legacy 注册表会让核心 VM 回归静默失败

- **症状**：`npm test` 打印 `ℹ tests 780 / pass 780 / fail 0`，看着全绿，但**退出码是 1**。往上翻才能看到 `核心回归失败数：24` 和 `ReferenceError: unificationFuelMultiplier is not defined (assets/generated/storage-bonuses.js:122)`。
- **原因**：经典的 VM 回归用的是 `assets/generated/*.js`——`scripts/generate-legacy-data.cjs` 把源码按注册表顺序拼成共享全局的 VM 脚本。新模块 `simulation/unification-storage.ts` 没进注册表，于是它的函数在 VM 全局里不存在，而依赖它的 `storage-bonuses` 照常被注入。TypeScript 那里完全正常，只有 VM 报错。
- **做法**：新增 `simulation/*.ts` 模块时必须往注册表加一行，且**顺序要在依赖它的模块之前**。本例必须排在 `neighbors`（它调用 `isWorldUnified`）之后、`storage-bonuses` 与 `containers` 之前。
- **教训**：`npm test` 的 `fail 0` 不代表通过，**要看退出码**；模块测试与 VM 回归是两条独立通道。

## 37. 用 `git stash -- <新文件>` 验证「改前是红的」是无效的

- **症状**：想验证新测试改前会失败，执行 `git stash push -- a.ts b.ts new-module.ts`，结果 `error: pathspec ... did not match any file(s) known to git`——未跟踪文件让整条命令失败，**一个文件都没被 stash**，测试跑的还是新代码，于是「全绿」被误当成验证通过。
- **做法**：验证红有两种可靠方式——只 stash 已跟踪文件（接受导入失败的编译级红），或**把关键判定临时改成恒假**（例如把 `isWorldUnified` 换成 `() => false`）跑一遍，确认断言真的失败，再改回来。后者是行为级红，更有说服力。
- **配合**：跑完立刻恢复并重跑一次确认绿，别把临时改动留在工作区。

## 38. 上一次会话残留的「临时置假」改动，会让下一次开工时基线莫名其妙是红的

- **症状**：新会话一开始跑 `npm run check`，780 项里有 23 项失败（存档、购买、队列、猫窝都不对），但 `git log` 显示最初那次 commit 是全绿的。
- **原因**：上一轮验证红时把 `isBuildingUnlocked` 临时改成 `if (id === 'nest') return false;`，恢复步骤没执行，改动一直躺在工作区。
- **做法**：**开工第一步永远是 `git status --short`**，而不是直接跑测试。看到不认识的改动先判断来源。同理，收尾前也要 `git status` 确认没有残留的临时改动被一起提交。

## 39. 按行号切分测试文件：要处理 CRLF、别名 import 和 default import

- **症状**：把 1277 行的 `tests/modules.test.ts` 拆成多个文件时，生成结果出现 `Cannot find name 'assert'`、`'purchases' has no exported member named 'requestPurchase'`、`The 'type' modifier cannot be used when 'import type' is used`，或整段中文变乱码。
- **原因**：四个独立陷阱——(1) 文件是 **CRLF**，按 `\n` 切分后每行尾残留 `\r`，写回时混进正文；(2) `import assert from 'node:assert/strict'` 是 **default import**，没有花括号，只解析花括号会把整条丢掉；(3) `requestPurchaseModule as requestPurchase` 是**别名**，重建时若用 `as` 后的名字会把源导出名写错；(4) 原文件 specifier 自身写作 `type BuildingId`，整条又是 `import type`，拼回去变成 `type type BuildingId`。
- **做法**：读文件用 `fs.readFileSync(..., 'utf8')` 并按 `/\r?\n/` 切分；解析 import 时保留 `specifier.raw` 原样（别名不能拆）；遇到整条 `import type` 要剥掉 specifier 里的 `type`；default/namespace import 单独分支处理。拆分后**先数测试数量**（`^test\(` 计数）核对与拆分前一致，再跑 typecheck——数量对得上才说明没漏掉测试。

## 40. `noUnusedLocals` 会误报 Vue 模板 ref

- **症状**：开启 `noUnusedLocals` 后，`App.vue` 的 `const leftScrollContainer = leftScroll.container;` 报 `'leftScrollContainer' is declared but its value is never read`。
- **原因**：它只被模板里的 `ref="leftScrollContainer"` 使用。TypeScript 看不见模板，所以视为未使用——**但删掉它就真的坏了**，左栏滚动隔离会失效。
- **做法**：保留变量并加 `void leftScrollContainer;` 显式读取，附注释说明是模板 ref。判断某个「未使用」变量能不能删，先 `grep` 模板里的 `ref="<名字>"`。同类要留意：`ref=`、`defineExpose`、事件里用到的具名函数。

## 41. 给右栏写 `height:100vh` 会向下溢出，而且无头浏览器测不到宽屏规则

- **症状**：把右栏改成固定列、`height:100vh` 想让日志区贴底，结果日志区底部余量是 **-28px**——不但没贴底，反而越出视口。
- **原因**：右栏不在视口顶端，上方还有 topbar 与标签栏，列顶在 `top:36`。`100vh` 是视口高度，加在 36px 的起点上，底边必然超出 36px。左栏没这个问题是因为它排在第一行、从顶端开始。
- **做法**：`height:calc(100vh - var(--pinned-top-offset))`，偏移量由 `src/vue/pinned-column-offset.ts` 的 `usePinnedColumnOffset` 实测后写入（`rect.top + scrollY`）。**不要硬编码 36px**，它随视口宽度、topbar 换行与缩放变化。
- **连带陷阱**：`tests/run-browser.cjs` 的无头浏览器默认视口只有 **756px 宽**，低于 861px 的断点，所以宽屏 CSS 规则**根本不会生效**，断言会静默走窄屏分支、通过得毫无意义。加 `ACCEPTANCE_WINDOW="1440,900"` 才会真正测宽屏。任何只在 `min-width:861px` 内生效的改动，都必须用这个环境变量验一遍。
- **另一个连带**：`tests/focus-layout.test.ts` 曾用 `/<aside class="col-right">/` 匹配右列，模板一加 `ref` 或 class 就失配。断言「结构存在」时应匹配 class 标记而不是完整属性串。

## 42. 验证「产量详细信息」时用错了数据源

- **症状**：删掉「多重曝光技术」的明细行后，断言「factor rows 里没有它」怎么写都通过——把 `pct('多重曝光技术', ...)` 故意加回去也不失败。
- **原因**：产量详细信息的数据源是 `calculateResourceFactorRows(...)`（返回 `{ rows }`，倍数行），不是 `calculateResourceBreakdown(...)`（返回 `{ entries }`，来源汇总行）。两者同在 `resource-breakdown.ts`，名字相近。对 `entries` 断言「某个倍数行不存在」永远为真。
- **做法**：改摘要明细前先确认界面读的是哪个函数；倍数行断言一律走 `calculateResourceFactorRows`。
- **连带陷阱**：删明细行时**不能连带删掉 `local *= ...`**。`local` 参与同函数内的 `expected` 自检，删了会让明细与结算分叉，而这个 bug 不会在任何单项测试里直接报出来。

## 43. 拿资源总产出做比值，单项加成会被其他来源稀释

- **症状**：芯片工厂加成应为 ×1.2 与 ×1.5，实测总现金产出比却只有 1.16 与 1.4，看起来像加成没生效。
- **原因**：`cash` 由「芯片工厂产出」与「猫猫税收」两部分组成，税收不随科技变化。总产出比值 = (加成部分 + 固定部分) / 总量，必然小于真实倍率。
- **做法**：断言落在该建筑自己那一行（在 entries 里按名字找），或直接用单座 `calculateBuildingOutput`。不要拿资源总产出做比值。

## 44. 浏览器验收里筛不到目标行时，断言会静默通过

- **症状**：验证「E-710 与纳米合金名称显示红色」时，断言写成 `exoticRows.length === 2 && ...`，第一次跑就 FAIL 且列表为空——那个存档根本没解锁这两个资源。
- **风险**：如果当时写的是 `exoticRows.every(...)`（空数组的 every 恒为真），这条断言会永远通过，等于没测。
- **做法**：先在用例里把需要的资源/建筑解锁，再重新查询 DOM；并且**必须显式断言行数**（`exoticRows.length === 2`），不能只靠 `every`。用完把 `unlockedResources` 之类被改动的状态还原，否则会泄漏到后续用例。

## 46. 把效果行搬进数据后，builder 里的旧行留着会渲染两遍

- **症状**：0.9.40 把建筑固定效果行迁进 `buildings.ts` 的 `effectRows` 后，`npm test` 全绿，但 `stellarForge`/`blackHoleStation` 的同一行出现了两次，`aiSupercore` 出现三遍，`shortRangeRelay` 反而丢了一行。
- **原因**：迁移只做了"加"没做"删"，而现有测试并不检查每座建筑的完整行列表，所以全绿是假象。另外 `addDeclared()` 若在两个位置各调用一次，会重复渲染。
- **做法**：①迁移必须成对增删；②`addDeclared()` 用 `declaredRendered` 标记保证单次渲染；③新增断言「builder 里不得残留同名同值的 `add(...)`」；④**用 dump-diff 验证而不是只信测试**：把重构前后全部建筑的效果行序列化后逐行比对，顺序也要一致。

## 47. 脚本批量插入时改坏了无关数值，而行级对比查不出来

- **症状**：0.9.40 用正则脚本往 `buildings.ts` 插入 `effectRows` 之后，效果行 dump-diff 是 0 差异、当年的测试也全绿。但下一轮加科技时 `npm test` 冒出 `1.21 != 1.18`：`lab.costScales.knowledge` 被改成了 1.21（应为 1.18），`e710MiningShip.costScales` 四项被改成 1.28（应为 1.25）。
- **原因**：脚本按文本位置插入，写回时把邻近的行也重写了一遍。而「效果行对比」只看提示面板的渲染结果，**根本不检查成本蠕变这类注册表字段**，所以发现不了。
- **做法**：批量改注册表后，做一次**逐字段 dump 并与上一版本比对**（`JSON.stringify(BUILDINGS)` 存两份，逐 key 比），把新增字段（如 `effectRows`）排除掉。这比只比对某一类派生结果覆盖面大得多。对照脚本模式：`git stash` → `git checkout <old> -- 文件` → 导出 JSON → 还原 → 导出当前 → 逐字段 diff，直到 0 差异。

## 45. 删掉带默认值的函数参数后，旧调用点会静默错位

- **症状**：移除地热发电站的铱矿加成后，`settleSpaceProduction` 的 `geothermalUnits` 变成未使用参数（TS6133），于是从签名里删掉。`npm run typecheck` 全绿，但 `pool-replay.test.ts` 报「回放与顺序结算在水产量上差 0.002」——一个看起来像浮点噪声、实际是真分叉的错误。
- **原因**：测试里保留着一份手写的旧签名调用 `settleSpaceProduction(state, pool, dt, happiness, plants.inputUnits.geothermalPlant || 0, plants.inputUnits.hydrogenPowerPlant || 0)`。参数删除后，`geothermalPlant` 的值被当作 `hydrogenUnits` 传入，`hydrogenPowerPlant` 的值被丢弃。**全是 number 且都有默认值，类型检查无法发现。**
- **做法**：删除或重排多默认参数时，不要只依赖 typecheck——用 `grep "函数名("` 过一遍**全部**调用点（包括 `tests/` 里手写的辅助函数），逐一核对实参含义。更稳的做法是这类位置参数超过 4 个时改用对象参数。

## 48. 新增 simulation 模块后，经典 VM 套件报 `xxx is not defined`

- **症状**：`npm test` 里 4 个 `tests/test-*.cjs` 全红，报 `ReferenceError: createSpeciesTraitsState is not defined`，而 TS 侧（typecheck、`*.test.ts`）完全正常。
- **原因**：经典套件不用 ES 模块，而是由 `tests/load-game.cjs` 把 `scripts/generate-legacy-data.cjs` 里一张**手工维护**的 `registry` 清单按顺序拼成全局脚本执行。新模块不在清单里，就等于没定义。
- **做法**：新增 `src/simulation/*.ts` 或 `src/state/validate-*.ts` 时，同步往那个 `registry` 加一条，并**注意顺序**——被依赖的模块必须排在依赖者之前（本次 `species-traits` 要排在 `building-production`、`morale`、`storage-bonuses`、`projects` 之前）。`data/*.ts` 同理（如 `data/genes` 之于 `simulation/genes`）。

## 49. 新增带默认状态的机制后，一批无关测试会红

- **症状**：给所有存档加了默认的种族特质（聪明 +0.25 教授知识、创造 -20% ARPA 造价）之后，10 个历史测试变红：`genes`、`crispr`、`containers-cafe-smelting`、`projects-genetics`、`space-support`（知识产量、ARPA 造价、队列时间估算）。
- **原因**：这些测试验证的是**别的机制**，把当前数值当成了不变量。它们的期望值是机制无关的干净基线。
- **做法**：不要改它们的断言值——那会把「基因倍率」之类的测试悄悄变成「基因倍率 × 特质」的测试，以后特质一调又全红。正确做法是在这些测试的夹具里加一行 `state.speciesTraits = { traits: [] }` 隔离新机制，并注明原因。只有真正要覆盖新机制的测试才保留默认值。

## 50. 新增可选存档字段时，字段集合校验会先于它自己的校验器拒绝旧存档

- **症状**：给 `GameState` 加 `speciesTraits` 后，删掉该字段模拟旧存档，`validateCurrentSave` 报「存档字段无效。（字段集合）」，而新写的 `validateSpeciesTraits` 回填逻辑根本没跑到。
- **原因**：`validate-save.ts` 里有一条更早执行的双向集合校验，要求 `state` 的每个键都出现在 `raw` 里。
- **做法**：往那里的 `backfilledFields` 白名单加 id，并在对应的 `validate-*.ts` 里写成「`undefined` → 回填默认；有值 → 严格校验（重复/未知/超限一律报错，不静默裁剪）」。别为了图省事把字段直接设成可选——那样非法数据也会被放过。改完记得同步 `tests/save-compatibility.test.ts` 里冻结旧 JSON 的逐字段期望。

## 51. 浏览器验收里钉死具体色值的断言，既拦不住回归又拖慢每次改样式

- **症状**：改主题金色（`#e0b64a` → `#ffd700`）会让 `acceptance.html` 里 7 条断言一起变红，而实际没有任何行为变化。
- **原因**：那些断言写成 `getComputedStyle(x).color === 'rgb(224, 182, 74)'`，把「哪一类元素用哪种颜色」这条**规则**错误地表达成了「必须是这个具体色号」。
- **做法**：把规则和色值分开断言。要守规则时，比较**同组元素之间**的关系（如「四个科技分类的颜色两两不同」），而不是钉死色号；要守可读性这类硬指标时，断言阈值（`fontSize >= 14`、`opacity === '1'`）而不是具体值。染色后的验证方式：改主题色应保持绿，制造撞色（把两类设成同色）必须变红。
- **注意**：`new Set(colours).size > 1` 这种写法太弱——两个分类撞色时它仍然是 2 而通过。要按分类分组后检查每组只有一项。

## 52. 把「注册表里有 N 项」写进断言，等于给每次新增内容埋一颗雷

- **症状**：`JSON.stringify(Object.keys(CRISPR_UPGRADES).sort()) === JSON.stringify([...12 个 id])`，每加一个升级就要手改一次这条测试，而它防的「注册表漏项」在别处已有覆盖。
- **原因**：用整份 id 清单做快照，把「结构完整」表达成了「内容与此刻完全一致」。
- **做法**：断结构不断内容——每项 `tier` 是整数、`pre` 是数组且指向真实条目、已有的关键 id 仍在。内容会增长，结构不会。同理，`$$('[data-x]').length === 17` 这类计数断言，改成断言具体的关键条目存在。

## 53. 测试「每项注册表条目都有界面入口」时，注意面板会按条件过滤

- **症状**：在 CRISPR「可修饰」子页断言 `Object.keys(CRISPR_UPGRADES)` 每项都有对应元素，报 11 项缺失。
- **原因**：该子页只渲染**当前可购买**的升级（前置未满足的、已购买的都不显示）。这是设计，不是 bug。
- **做法**：这类「全覆盖」断言要么放在能显示全量的视图上（如「已完成」子页配合已购状态），要么改成断言过滤规则本身（`仅显示已满足前置的`）。先读组件模板确认渲染条件，再写断言。

## 54. 把共享辅助函数放进已参与循环的模块，会静默破坏不相干的功能

- **症状**：给 `challenges.ts` 加 `challengeLevel`/`challengeFactor` 后，`tests/genes.test.ts` 的「威望资源首次获得后解锁」报 `prestigeUnlocked` 实际是 `[]`。该测试与奖励公式毫无关系，typecheck 全绿，也没有任何报错堆栈。
- **原因**：`challenges.ts` → `prestige.ts` → `government.ts` 已经是链，而 `government.ts` 又要读 `challenges.ts` 的新函数 → 构成循环。ESM 在循环下把尚未初始化的导出当作 `undefined`，`updateProgression` 里调用时抛错被吞掉，只表现为"什么也没发生"。
- **做法**：新函数放到**下游的叶子模块**（这里是 `prestige-scaling.ts`，只 import 类型），再由原模块 re-export 保持调用点不变。判断依据：模块 A 已经 import 了 B 的运行时值，就不要让 B 反过来 import A。这类 bug 只能靠**全量测试**发现，`npm test -- <关键字>` 和 typecheck 都看不出来。

## 55. 奖励公式改动会让一批"顺便用到它"的测试变红，需要区分夹具问题与公式问题

- **症状**：威望公式重做后，`genes`（核爆解锁粒子）、`simulation-core`（40 人口期望 20）、`outer-space`（逃离期望 400/500）、`acceptance.html`（逃离卡西米尔 ≥13）接连变红。
- **原因**：这些测试用威望奖励当**副作用触发器**，而不是在验证公式本身。夹具大多没有人口和知识消耗，新公式下奖励变成 0 或个位数。
- **做法**：先判断测试意图。验证「重置会解锁粒子」的（`genes`）→ 给夹具补上人口与 `statistics.run.knowledgeSpent`，让它像一个真实周目；验证「重置会清空船坞」的（acceptance）→ 去掉对奖励数值的硬性期望，只断重置后果；真正在验公式的（`simulation-core`、`outer-space`）→ 按新公式更新期望值并注明算式。不要一律改数字，那会把"重置会解锁资源"悄悄变成"重置给 13 粒子"。

## 56. 新增 `simulation/*.ts` 后 VM 回归报 `xxx is not defined`，且 `pretest` 看起来没用

- **症状**：登记进 `scripts/generate-legacy-data.cjs` 后，`node scripts/run-tests.mjs` 仍报 `ReferenceError: prestigeSoftCap is not defined`。
- **原因**：`assets/generated/*.js` 是生成产物，`pretest` 钩子只在 `npm test` 时触发；直接跑 `node scripts/run-tests.mjs` 会用旧产物。
- **做法**：改完 registry 后手动跑一次 `node scripts/generate-legacy-data.cjs`，确认 `assets/generated/manifest.json` 里出现新模块名，且顺序在被依赖者之前。

## 57. 从"产成品数量"反推"原料消耗"，一旦产物带上产量倍率就会一起被放大

- **症状**：给基因合成加"同知识消耗下产量翻倍"的升级后，DNA 确实翻倍了，但同时记录的**知识消耗**也翻倍。表现是威望奖励虚高、`statistics.run.knowledgeSpent` 与真实花销不符。
- **原因**：`result().knowledge` 原本写成 `DNA总量 × DNA_KNOWLEDGE_COST`——用产物反推原料。加乘数时只改了 DNA 那一行，反推式就把乘数一起吃进去了。**只要有"产出 = 投入 × 系数"的关系，任何一侧加了系数，另一侧的反推就失效。**
- **做法**：投入量在**发生的当下**单独累加（`diverted += taken`），不要事后从产物反推。同时把"投入 → 产出"的换算抽成一个函数（`calculateSynthesisedDna`），让结算与 UI 预览共用，否则两处各写一遍，迟早一处记得倍率一处忘了。

## 58. 给"没有产出的夹具"写数值断言，会得到恒真的绿

- **症状**：想在浏览器验收里补一条"高级基因合成让预览 DNA 翻倍"，写好后一直通过，点开日志发现是 `0 → 0`。
- **原因**：该夹具只有 5 人口、没有在岗工人，`knowledgeProduction` 恒为 0，`0 × 2 = 0` 当然成立。
- **做法**：涉及数值的浏览器断言，先打印一次实际值确认非零，再写比较。如果夹具本身不具备该条件，**宁可删掉这条断言**并把覆盖交给能构造真实场景的单元测试——留一条恒真的绿比没有更糟，它会让人以为覆盖到了。




## 59. 用"库存"判断能不能抽走食物岗位的猫猫，永远抽不走

- **症状**：自动化开局能涨到 5 种建筑后彻底停住——人口 3、岗位全是觅食、木材产量 0、科技停在 3 项，而食物早就堆到仓库上限 400。
- **原因**：食物安全判据写的是 `库存 >= foodBuffered(pop)`，而 `foodBuffered` 按人口放大（`300 × 人口`）。食物上限本身只有几百，阈值却是上千，**这个条件在正常游戏里永远不会成立**，于是"腾人给伐木/学校"的整条路径都是死代码。
- **做法**：能不能抽人看**产量方向**，不看库存：`产能 > 0` 就允许挪，真饿了由 `ensureFoodCrew` 立刻调回来。凡是拿"库存 ≥ 某个按人口放大的阈值"当开关的地方，先确认那个阈值能不能真的达到；上限是固定的几百时，它一定达不到。

## 60. 容量小的岗位抢不过容量紧的岗位，需要一条显式的调人路径

- **症状**：学校建好了、也有空位，`changeWorkerAssignment(state, 'school', 1)` 手调能成功，但自动化里知识产量长期是 0。
- **原因**：`changeWorkerAssignment` 加人时取 `min(想要, 空闲人口, 岗位剩余容量)`。总人口被觅食岗位撑满、没有空闲人口时它返回 0；而"腾人"逻辑只从**同类候选**里挑，教授岗位容量是 1、优先级又排在原料缺口之后，永远轮不到。看起来每个函数都对，拼起来就是死锁。
- **做法**：给"必须有人"的岗位单独写 `moveWorkerTo`：先找空位，再从其它岗位调一只，**挪完复查食物产量仍为正**才算成功，否则回滚。判断是否成功一律比较调整前后的人数——`changeWorkerAssignment` 返回的是调整后的人数，不是差值。

## 61. 建造锚点不看仓库上限，会守着一个永远付不起的目标空转

- **症状**：木材 261 / 上限几百、石料 46，锚点却要 304 木材 152 石料。脚本每 tick 都选它、每 tick 都付不起，几百个 tick 建筑数量一动不动，而 `fault` 是 `null`（它没报错，只是没进展）。
- **原因**：`buildAnchor` 只按"等级 + 成本权重"排序，没有考虑"这个成本是否可能攒够"。资源有上限时，成本超过上限的目标永远买不到，但它排序靠前就一直霸占锚点，把能造的目标全挡在后面。
- **做法**：加一层可达性过滤——某项成本超过该资源上限、且该资源当前没有正产量时跳过该目标。判据必须是 `成本 <= 上限`，不能是 `成本 <= 当前库存`（后者会把"再等等就能造"的正常目标也排除掉）。

## 62. 引擎里"读配置"这一步也要包在 try 里

- **症状**：给 `createAutomationEngine` 传入一个会抛错的 `config` 工厂，异常直接冒到 `tick()` 外面，整帧结算被打断。
- **原因**：只把 `resolveAutomation(...)` 放进了 `try`，而 `options.config()` 写在 `try` 之前——"配置由外部提供"就意味着它也可能抛错（导入中途被替换、存储实现异常）。
- **做法**：外部注入的回调（配置工厂、随机源、读取器）与内部逻辑一起放进同一个 `try`，异常统一转成 `fault`。自动化是可选功能，任何情况下都不允许它拖垮游戏主循环。

## 63. 构造运行时就读存储，会打破"加载存档只读一次"的既有断言

- **症状**：给运行时加自动化配置后，`tests/runtime.test.ts` 的 `assert.equal(env.reads, 1)` 变成 `2 !== 1`。
- **原因**：在 `createRuntime()` 里直接 `loadAutomationConfig(localStorage)`，构造一次就多一次 `getItem`。
- **做法**：惰性读取——构造函数只放默认值，第一次访问 `runtime.automation`（或第一次 tick）时才读存储。既有测试断言的"读存储次数"是真实契约（保护模式判定、导入流程都依赖它），新增模块不能悄悄加读数。同时保留 `createRuntime(initialAutomation?)` 让测试注入，不必依赖真实存储。

## 64. 上限类设置只挡一条建造路径，等于没挡

- **症状**：把「同类建筑数量上限」设成 1，仓库、学校都老老实实停在 1 座，但住房从 5 座涨到 6 座；把「自动补住房」关掉也一样涨。面板上的两个开关看起来都没有效果。
- **原因**：住房补建走的是 `runFrontier` 里单独的一段（人口顶到住房上限时优先补住房），自动建造走 `applyAutoBuild`。上限只写进了后者；而 `autoBuildHousing` 只关掉了前者，后者在排序里仍会把住房当普通候选选中。
- **做法**：加"限制类"选项时，先把**所有**能产生该效果的路径列出来（这里是两条），每条都加同一个判据；开关语义要写成"排除该类目标"，而不是"跳过某一段代码"。验证方式是两个极端（上限 1 / 上限 0）各跑一段长 tick，断言最大值。

## 65. 按注册表字段判断"这座建筑干什么"，规则可能永远不命中

- **症状**：「储量告急时提高仓库类建筑权重」这条规则对仓库完全无效——倍率设成 0 也照样造，设成 5 权重也不变。`weightingKeysFor('warehouse', ...)` 返回空数组。
- **原因**：类型上 `BuildingDefinition` 有 `cashCap` / `knowledgeCap` 等字段，于是拿"条目里有没有 cap 字段"当判据。但仓库这类建筑的上限贡献由 `storage.ts` 的建筑表统一计算，注册表条目本身**一个 cap 字段都没有**。
- **做法**：判据改成**试算**——多一座这个建筑，`calculateStorageTotals` 的结果有没有变大。这类"效果分散在别处"的机制不能用注册表字段猜。试算很贵（两次全量结算），必须按 `(建筑, 当前数量)` 缓存，否则单个 tick 就是数百次全量结算。

## 66. 参数化条件来源要校验拆分后的段，不是整串

- **症状**：`buildingCost` 条件永远返回 `undefined`，覆盖行永远判否，但代码里明明写了校验、也没抛错。
- **原因**：参数是 `nest.wood` 这种复合值，代码先 `split('.')` 拿到两段，却拿**整串** `arg` 去查 `BUILDINGS` / `RESOURCES` 注册表——永远查不到，于是每个合法参数都被当成非法参数丢掉。
- **做法**：拆分后的每一段分别校验。新增参数化来源时，在探针测试里给每个来源点名一个**真实**参数（不是占位符），并断言结果不是 `undefined`；同时比对探针表与注册表的键集合，两侧数量不等就红——否则新增来源会悄悄绕过这条测试。

## 67. 注册表里重复的选项键，测试要能拦住

- **症状**：「工匠优先顺序」和「锻造优先顺序」两个选项用了同一个键 `craftPriority`。面板上渲染出两个输入框，实际只有一个值，改哪个都会覆盖另一个。
- **原因**：`AUTOMATION_OPTIONS` 是从分节列表 `Object.fromEntries` 折平出来的，重复键会静默后者胜出；`Object.keys` 数量对不上也不会报错。
- **做法**：测试里显式遍历分节、用 `Set` 检查键唯一；再断言"默认配置能原样通过自己的校验"——这条顺带能抓到"小数默认值配了 `integer: true`"这类自相矛盾的注册表条目（`2.5` 被当成非法值，整份默认配置都过不了校验）。

## 68. "子开关全关 + 主开关打开"= 脚本空转，玩家会以为脚本坏了

- **症状**：只打开「启用自动化」主开关，一个 tick 之后什么都没有发生；更糟的是觅食岗位一个人都不派，食物线在 100 tick 内清零、人口归零。`fault` 是 `null`，面板上没有任何报错。
- **原因**：各模块开关默认全关（`autoWorkers`、`autoBuild`、`autoResearch` 全都是 `false`），主开关只是总闸，打开它不会连带打开任何模块。这个默认值从 v1 就存在，不是新引入的，但"打开总开关就饿死"是玩家看到的第一个结果。
- **做法**：默认值要按"最坏情况下最先发生的事情"来排——食物与住房是维持性需求（不处理就不可逆地掉人口），所以 `autoWorkers` / `autoBuild` / `autoBuildHousing` / `autoResearch` 默认开启；其余扩张性模块（ARPA、太空、威望、基因）默认关闭。写"默认值"测试时不要只断言"默认全关"，要断言"只开主开关也能活下来"。

## 69. "这一类"与"这一座"要分成两层乘数，否则玩家的两种意图会打架

- **症状**：想"整体别再修集装箱建筑了，但那个最大的留着继续修"时做不到——只有按情境的整类倍率，关掉整类就等于全关；只有逐座开关，"这一类"要改十几条。
- **原因**：只有一层权重模型。参考脚本是两层：`bld_w_<id>` 管单座，`weightingRules` 里的倍率按情境管整类，两者相乘。
- **做法**：`buildWeight = (基础分) × (命中的情境倍率) × (自身权重 / 中性值)`。中性值取 100 而不是 1，是因为"权重"这个说法对玩家要能直接理解（100 是基准、0 是不造），而乘法上 100/100=1 保持恒等。最后一层乘法放在函数末尾，天然复用既有的 `weight > 0` 淘汰逻辑。
