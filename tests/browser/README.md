# 浏览器验收说明

`tests/browser/acceptance.html` 是一个顺序脚本：挂载真实应用 → 逐条断言 → 每条 `log(ok, 名称)` 写入 `#result` → 全绿时输出 `RESULT: PASS`。`tests/run-browser.cjs` 启动 Vite 与 headless Edge/Chrome，`--dump-dom` 取回结果并校验该字符串。

## 运行

```bash
npm run test:browser
```

可选环境变量：

| 变量 | 作用 |
|---|---|
| `BROWSER_PATH` | 指定浏览器可执行文件（默认自动找 Edge/Chrome） |
| `ACCEPTANCE_PORT` | Vite 端口，默认 4399（端口被占用时改这里） |
| `ACCEPTANCE_BUDGET` | `--virtual-time-budget` 毫秒数，默认 45000 |
| `ACCEPTANCE_PAGE` | 换成别的页面，用于调试或诊断自检 |

## 失败时看什么

失败输出包含三部分，按可信度排序：

1. **页面自述原因**：`FAIL 异常：SyntaxError: ...` 或 `FAIL 异常：Error: Missing click target`。这是 `acceptance.html` 顶部那段经典脚本（非 module）写进 `#result` 的——它能捕获**模块解析阶段**的错误，而页面自身的 `window.onerror` 做不到。
2. **最后一条 PASS**：说明失败发生在它的下一步。
3. **browser console（last 25 signals）**：`run-browser.cjs` 在失败时打印，已过滤扩展与 GPU 噪声。

诊断能力自检：

```bash
ACCEPTANCE_PAGE=tests/browser/failure-selftest.html node tests/run-browser.cjs
```

预期：打印 `FAIL 异常：SyntaxError: Unexpected identifier 'as'`，退出码 1。若这条不再复现，说明错误捕获被改坏了。

## 写新断言时

- **只能写 JavaScript**。这页按 JS 解析，写 `as`、`const x: number` 之类会让整页停在 `running`。
- 夹具用 `JSON.parse(JSON.stringify(S()))` 快照，结束时 `store.runtime.replaceState(snapshot); store.refresh();` 还原。
- 还原后 `App.vue` 不会自动切回原来的标签页：后续用例需要特定页面时，显式 `click($('[data-tab="..."]'))`。
- 真实玩家路径优先：能点按钮就不要直接改 state；只有准备夹具时才 `store.mutate`。
- 断言文本会被 `tests/markdown.test.ts` 之外的规则约束：界面文案不得含 emoji。

## 定位某段断言

文件按功能顺序排列，用中文断言名 grep 最快：

```bash
grep -n "临近势力" tests/browser/acceptance.html
```
