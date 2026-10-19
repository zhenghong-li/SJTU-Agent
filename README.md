# SJTU Agent (sjtu-mcp)

上海交通大学校园 **MCP server**：把 jAccount 登录后的校园服务封装成 MCP 工具，供 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 等 MCP 客户端在对话中直接调用。

- 本机运行（stdio MCP），单用户、自用，不依赖任何私有服务端
- **只读优先**；写操作只做「打开/预填」，**绝不自动提交表单、支付或发送邮件**
- 登录态保存在本机 Chrome profile，仓库内不含任何账号、Cookie、发票或个人信息

## 功能（31 个工具）

| 域 | 工具 |
|---|---|
| 认证 | `auth_login` / `auth_status` / `auth_probe` / `auth_logout` |
| 水源社区 | `shuiyuan_search` / `shuiyuan_hot` / `shuiyuan_topic` |
| 微信公众号 | `wechat_search` / `wechat_read_article` / `wechat_resolve_url` |
| 校园通知 | `notice_sources` / `notice_list` / `notice_search` / `notice_get` |
| 教务/交我办 | `timetable_get` / `calendar_events` / `profile_get` / `services_catalog` / `services_search` / `services_open` |
| 活动 | `activity_list` / `activity_detail` |
| 邮箱 | `mail_search` / `mail_read` / `mail_draft`（仅存草稿） |
| 云盘 | `pan_info` / `pan_list` |
| ZIRC | `zirc_project_get` / `zirc_expense_prefill`（新增经费发生预填） |
| 报销 | `reimburse_prefill`（AI 报销字段级预填） |
| 聚合 | `search_all` |

## 快速开始

```powershell
# 需要 Node.js 24+
npm install
npm run build
npm run smoke        # 本地 MCP 握手 + tools/list 冒烟
```

登录一次（会打开本机 Chrome）：

```text
在 MCP 客户端中调用 auth_login，手动完成 jAccount 登录；
随后 auth_status / auth_probe 检查各服务登录态。
```

在 DSH 中注册（示例，路径按本机调整）：

```yaml
- insert:
    - id: mcp-sjtu
      name: "@deepseek-ai/dsh-mcp-client"
      config:
        serverName: sjtu
        transport: stdio
        command: 'C:\Program Files\nodejs\node.exe'
        args: ['<path-to>/sjtu-mcp/dist/index.js']
        cwd: '<path-to>/sjtu-mcp'
        env:
          SJTU_MCP_DATA_DIR: 'C:\Users\<user>\AppData\Local\sjtu-mcp'
        toolCallTimeoutMs: 120000
        failOnStartupError: false
```

## 安全与隐私

- 不保存密码；jAccount 登录由用户在真实 Chrome 中完成，profile 仅存于本机；
- 工具输出不含 Cookie/token 原文；
- `.gitignore` 排除 `node_modules/`、`dist/`、`artifacts/`、Chrome profile、凭证文件与日志；
- 报销/活动报名/邮箱发送等写操作只做预填，提交动作由本人完成；
- 请遵守学校系统、微信公众号等平台的使用条款；本项目仅用于个人学习与效率工具。

## 文档

- [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md) — 工具清单、验证状态、已知限制
- [docs/dsh-integration.md](docs/dsh-integration.md) — DSH 注册/回滚
- [docs/reimbursement-workflow.md](docs/reimbursement-workflow.md) — 报销标准流程（ZIRC + AI 报销）
- [docs/spike-findings.md](docs/spike-findings.md) — 端点/字段逆向与实测证据

## 免责声明

非上海交通大学官方项目。校园接口与页面结构可能变化；请自行评估使用风险，不要用于违反学校规定或平台条款的场景。

## License

MIT
