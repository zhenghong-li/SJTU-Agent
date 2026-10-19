# DSH 集成 Runbook（Phase A A1 · 已生效）

> 目标：让 DSH 以 stdio MCP 方式启动 `<workspace>/sjtu-mcp\dist\index.js`，模型可见工具 `mcp__sjtu__<tool>`。
> 当前状态：**已注册并验证**。`mcp__sjtu__auth_status` 在 DSH 中调用成功；MCP server 进程由 DSH 拉起。

## 1. 正确配置（关键：新行必须用 `- insert:`）

`%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml` 末尾：

```yaml
- insert:
    - id: mcp-sjtu
      name: "@deepseek-ai/dsh-mcp-client"
      config:
        serverName: sjtu
        transport: stdio
        command: 'C:\Program Files\nodejs\node.exe'
        args:
          - '<workspace>/sjtu-mcp\dist\index.js'
        cwd: '<workspace>/sjtu-mcp'
        env:
          SJTU_MCP_DATA_DIR: 'C:\Users\<user>\AppData\Local\sjtu-mcp'
        toolCallTimeoutMs: 120000
        failOnStartupError: false
```

**踩坑记录**：最初把 `- id: mcp-sjtu` 直接作为顶层 patch 条目（没有 `- insert:` 包裹）→ 被当作"覆盖一个不存在的 id"静默忽略，工具不出现。DSH 的新增行必须使用 `insert` 列表；覆盖已有行才用裸条目。

## 2. 验证结果（2026-10-19）

- DSH 工具列表出现 `mcp__sjtu__auth_status`。
- 调用返回：`ok:true, data.phase:"A-spike", services.*:"uninitialized"`（符合 spike 预期）。
- DSH 拉起了 `C:\Program Files\nodejs\node.exe <workspace>/sjtu-mcp\dist\index.js`（进程列表中可见）。
- 修复 patch 后**无需再次重启**：DSH 的 profile patch 监听/HMR 自动重组并建立了 MCP 连接（观察到 server 进程出现、工具可用）。
- 备份文件：`cordis.patch.yml.bak-sjtu-mcp-20261019-134141`、`.bak2-...`、`.bak3-...`（同目录）。

## 3. 回滚

```powershell
$p = "$env:USERPROFILE\.dsh\profiles\desktop\cordis.patch.yml"
Copy-Item "$p.bak-sjtu-mcp-20261019-134141" $p -Force   # 或最近的 .bak3
```

或删除 patch 末尾 `- insert:` 整段后等待 HMR/重启。

## 4. 升级 / 卸载

- 升级：`cd <workspace>/sjtu-mcp; npm run build` → DSH 重新同步工具列表（工具名不变时历史不丢）。
- 卸载：删除 insert 段 → HMR 卸载/重启。
- 注意：stdio 子进程 env 会被 DSH 清理，路径/代理必须显式写入配置。

## 5. 已知行为

- `toolCallTimeoutMs` 默认 60s；本配置覆盖为 120s（登录/预填类工具需要）。
- `failOnStartupError:false`：MCP 启动失败不会阻止 DSH 启动，只是工具不出现。
- 审批由 DSH 工具管线/权限档位决定，MCP annotation 仅为提示；写操作安全仍由服务端 ReadOnlyPage + 浏览器人工确认兜底。
- MCP server 的 `initialize` 必须快且无副作用（当前实现不联网、不启动浏览器）。
