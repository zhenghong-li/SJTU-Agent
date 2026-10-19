# Spike Findings / 证据记录（Phase A 前已有事实）

> 本文件是证据矩阵（PLAN-v1.2 §5）的 basis 来源。规则：每条记录 URL、method、日期时间、状态码、响应片段、是否使用账号；无记录者一律标 U。
> 目前只记录**无凭证只读探测**与**环境事实**；带登录态的观察由 Phase A 的 A3/A5 补充。

## 1. 水源社区（shuiyuan.sjtu.edu.cn）

| 项 | 值 |
|---|---|
| 时间 | 2026-10-19 13:1x（Asia/Shanghai） |
| 请求 | `GET https://shuiyuan.sjtu.edu.cn/search.json?q=%E9%A3%9F%E5%A0%82` |
| 客户端 | Node.js 24.15 `fetch`，无 Cookie/账号 |
| 状态 | **HTTP 403** |
| Content-Type | `application/json; charset=utf-8` |
| 响应 | `{"errors":["您需要登录才能执行此操作。"],"error_type":"not_logged_in"}` |
| 结论 | 匿名只读不成立；水源需要登录态。搜索接口形态/登录后字段/限流待 A3 验证。 |

待补（A3）：登录后 `search.json` 字段（views/likes 是否存在）、`/categories.json`、`/c/<slug>/<id>/l/top.json?period=` 是否需登录、429 阈值、SSO 落点。

## 2. 体育场馆（sports.sjtu.edu.cn）

| 项 | 值 |
|---|---|
| 时间 | 2026-10-19 13:1x |
| 请求 | `GET https://sports.sjtu.edu.cn/pc/` |
| 状态 | HTTP 200 |
| 长度 | 1,989 bytes（SPA 外壳） |
| 结论 | 站点可达；可约/下单/支付流程与订单接口**未观察**，A5 用 CDP 抓取后回填。 |

## 3. 公众号（已有实测，详见 `<workspace>/jaide-analysis\notes\04-wechat-search-feasibility.md`）

- 搜狗微信搜索 `https://weixin.sogou.com/weixin?type=2&query=...`：200，可解析标题/摘要/公众号/时间/跳转链接；连续请求有 429/验证码风险。
- 搜狗 `/link?url=...`：服务端得到 JS 拼装的临时 URL，再请求为 31 KB 验证/空壳页，**不能**解析正文。
- 微信文章直链 `https://mp.weixin.qq.com/s/...` + Mobile MicroMessenger UA：200，可解析标题/公众号/时间/正文（`#js_content` 深度截取）。
- 结论：搜索（V）+ 直链读正文（V）已成立；"搜索→正文"自动衔接需 A4 浏览器解析或手动直链。

## 4. DSH 环境事实

| 项 | 值 | 来源 |
|---|---|---|
| DSH 版本 | 0.2.1-rc.2（mcp-client 0.2.0-rc.2） | `~/.dsh/profiles/node_modules/@deepseek-ai/dsh-mcp-client/package.json` |
| MCP 注册 | `@deepseek-ai/dsh-mcp-client` 配置行（transport/serverName/command/args/env/cwd/toolCallTimeoutMs…） | 该包 `README.md` |
| 工具名 | `mcp__<serverName>__<tool>`，serverName 建议 `sjtu` | 同上 |
| 默认工具超时 | 60,000ms（计划覆盖为 120,000ms） | 同上 |
| 启动失败语义 | `failOnStartupError:false` 时 harness 照常启动、该 server 工具不出现 | 同上 |
| stdio env | 会清理 ambient credentials，须显式配置路径/env | 同上 |
| 系统 Node | v24.15.0，路径 `C:\Program Files\nodejs\node.exe` | 本机 `node --version` / 评审实测 |
| Chrome | 155.0.8059.84，`C:\Program Files\Google\Chrome\Application\chrome.exe` | 本机实测 |
| dsh CLI | `C:\home\li_zhenghong\.npm-global\dsh.ps1`（profile 在 `~/.dsh/profiles`） | 本机实测 |
| 安装方式 | 优先 config-only bundle + `plugin_manager`；profile 文件修改需审批 | DSH 文档/评审 |

待补（A1/A2）：在运行中的 DSH 会话里完成注册并调用 `mcp__sjtu__auth_status`；实测 120s 超时、取消、重连、审批档位行为。

## 5. jAide 逆向证据索引（V 级）

- jAccount OAuth/登录窗/凭证：`notes/01` §1（主包 `107323–107745`）。
- my.sjtu `/api/account`、`/api/task/me/*`：`notes/01` #2。
- i.sjtu **课表**：`notes/01` #5（`/kbcx/xskbcx_cxXsKb.html`）。**成绩/考试/GPA/修业未在 jAide 中逆向 → U→O**。
- calendar.sjtu：`notes/01` #7。
- activity.sjtu list/detail：`notes/01` #11；**报名端点 U**。
- pan.sjtu：`notes/01` #9。
- mail.sjtu 读取（Zimbra SOAP）：`notes/01` #10；**草稿/发送 U**。
- 交我办目录/收藏/最近/在办：`notes/01` #2；**动态表单预填未验证 → U→O**。
- 场馆（sports）**不在 jAide 域清单** → U；scseat 仅只读预约列表（`notes/01` #13）。
- 通知站群：jAide 无爬虫证据 → U→O（A6）。

## 6. 记录规范（后续）

- 每条：时间、URL、method、headers 摘要（不含 Cookie）、状态码、响应长度/片段、是否登录、观察者（Lead/A3/A5）。
- 带登录态的记录：只存脱敏后的字段名/状态，不存凭证、不存个人数据原文。
- 更新后同步 PLAN-v1.2 §5 矩阵等级（U→O→V）与 registry state。

## 7. Phase A A1 记录（2026-10-19）

| 项 | 结果 |
|---|---|
| 项目骨架 | `<workspace>/sjtu-mcp\`：package.json / tsconfig / src/core / src/index.ts / scripts/mcp-smoke.mjs |
| 依赖 | @modelcontextprotocol/sdk 1.32.1、zod 3.25.x、typescript、tsx（npm install 成功） |
| 构建 | `npm run build` 通过（tsc → dist/） |
| 本地 MCP 冒烟 | `npm run smoke` **PASS**：initialize → tools/list=`auth_status` → tools/call 返回 `ok:true, phase:"A-spike"` |
| DSH 配置 | 已写入 desktop profile patch（serverName=sjtu，stdio，node 绝对路径，toolCallTimeoutMs=120000，failOnStartupError=false）；js-yaml 校验通过；备份 `cordis.patch.yml.bak-sjtu-mcp-20261019-134141` |
| DSH 实机验证 | **待重启 DSH**：需要确认 `mcp__sjtu__auth_status` 出现在工具列表并可调用 |
| 结论 | A1 本地部分完成；DSH 侧待重启验证 |

补充证据：
- `dsh --profile desktop --dump-config` 被拒绝（profile 由 Electron 应用独占管理），因此注册通过 patch 层完成，无法用 CLI 预演；已用 YAML 解析验证结构。
- 系统 Node：`C:\Program Files\nodejs\node.exe` v24.15.0（配置使用该绝对路径）。

## 8. Phase A A1 实机验证（2026-10-19 13:56）

| 项 | 结果 |
|---|---|
| DSH 注册 | ✅ `mcp__sjtu__auth_status` 出现在 DSH 工具列表 |
| 工具调用 | ✅ 返回 `ok:true, data.phase:"A-spike"`；services 全为 uninitialized（spike 预期） |
| 进程 | ✅ DSH 拉起 `C:\Program Files\nodejs\node.exe <workspace>/sjtu-mcp\dist\index.js` |
| patch 语法 | ⚠️→✅ 首版裸条目被静默忽略（需 `- insert:` 包裹）；修正后 HMR 自动重组并连接，无需再重启 |
| 备份 | `cordis.patch.yml.bak-sjtu-mcp-20261019-134141` / `.bak2-...` / `.bak3-...` |
| 结论 | **A1 完成**：MCP 握手/工具注册/工具调用链路在真实 DSH 中打通 |

后续进入 A2（Browser Broker）/ A3（jAccount 非阻塞登录 + 各服务 session 探测）。

## 9. Phase A A2/A3 记录（2026-10-19 14:00）

| 项 | 结果 |
|---|---|
| A2 Browser Broker | ✅ 新增 `src/browser/broker.ts`：独立 Chrome profile（`dataDir/chrome-profile`）、固定 CDP 端口 9223、lazy start、持久 context、`openPage` 非阻塞、cookie 读取、Singleton 锁清理；playwright-core 使用系统 Chrome（channel:'chrome'） |
| A2 构建/本地冒烟 | ✅ `npm run build` + `npm run smoke` 通过；tools/list = `auth_login, auth_status, auth_logout` |
| A3 非阻塞登录 | ✅ `src/auth/jaccount.ts` + `auth_login` 工具：打开 `https://my.sjtu.edu.cn/` 并在 2s 内返回 `login_window_open`，不等待人工登录 |
| DSH 工具同步 | ✅ 杀掉旧 MCP 进程后 DSH 自动重连，新工具（auth_login/auth_logout）已加载；`auth_status` 返回新结构（browser/jaccount/cookies） |
| 登录窗口 | ✅ CDP `127.0.0.1:9223` 可见页面：`上海交通大学统一身份认证`（jAccount 登录页），等待人工登录 |
| 当前登录态 | ⏳ 浏览器已启动、有 JSESSIONID，但尚未出现 JAAuthCookie/JATrustCookie（用户未完成登录） |
| 下一步 | 用户完成登录 → `auth_status` 验证 → A3 服务探测（my.sjtu/i.sjtu/calendar/水源/邮箱）→ A4/A5 |

注意：未读取/未输出任何 cookie 值，仅输出 cookie 名称/域/过期时间。

## 10. Phase A A3 登录与服务探测（2026-10-19 14:03–14:05）

| 项 | 结果 |
|---|---|
| jAccount 登录 | ✅ 用户手动完成；`auth_status` 检测到 `JAAuthCookie`（`JATrustCookie` 未出现，与 jAide 的容错一致），状态 `authenticated` |
| 服务探测工具 | ✅ 新增 `auth_probe`（只读 GET，经 `context.request` 共享浏览器 cookie；不返回 cookie 值） |
| my.sjtu | ✅ 200，`/api/account` 返回含 `account` 的 JSON |
| i.sjtu | ✅ 200，`/jaccountlogin` 落到 i.sjtu（未跳 jaccount） |
| calendar.sjtu | ✅ 200；关键：参数需 `startDate=YYYY-MM-DD+00:00&endDate=YYYY-MM-DD+00:00&weekly=false&ids=`，且先访问首页热身 |
| 水源 | ✅ 200；需先在真实浏览器打开 `https://shuiyuan.sjtu.edu.cn/` 完成 SSO，再请求 `/search.json`（否则 403 not_logged_in） |
| mail.sjtu | ✅ 200，落在 mail.sjtu（SSO 成功） |
| pan.sjtu | ✅ 200 |
| activity.sjtu | ✅ 200 |
| 结论 | **A3 完成**：jAccount 会话可复用于 7 个校园服务；浏览器 profile 持久化登录，MCP server 重启后无需重新登录（Chrome 需由新 server 重新拉起，profile 复用） |

实现文件：`src/browser/broker.ts`、`src/auth/jaccount.ts`、`src/auth/probe.ts`、`src/index.ts`（auth_login/auth_status/auth_probe/auth_logout）。
下一步：A4 公众号浏览器解析 + A5 活动报名/报销/i.sjtu 成绩类/邮箱搜索的端点观察。

## 11. Phase A/B 进行中：水源 + 公众号工具（2026-10-19 14:14）

| 工具 | 状态 | 说明 |
|---|---|---|
| `shuiyuan_search` | ✅ 已测 | 水源搜索，返回标题/链接/回复数/时间/标签；默认 15 条 |
| `shuiyuan_hot` | ✅ 已测 | 全站/板块热榜，带 views/like_count（周榜 5 条验证） |
| `shuiyuan_topic` | ✅ 已实现 | 帖子详情 + 可选前 30 回复 |
| `wechat_search` | ✅ 已测 | 搜狗微信搜索，10 条/页，标题/公众号/时间/摘要/跳转链接 |
| `wechat_read_article` | ✅ 已测 | 微信直链正文解析（MicroMessenger UA） |
| `wechat_resolve_url` | ✅ 已实现/待实测 | 真实 Chrome 打开搜狗跳转 → 等 mp.weixin 直链 |

实现：`src/sources/shuiyuan.ts`、`src/sources/wechat.ts`、`src/tools/*`、`src/http/{public,browser}.ts`、`src/core/tool.ts`。
下一步（自动连续开发）：通知聚合 5 源、教务（课表/成绩类）、活动、邮箱搜索/草稿、云盘、交我办/报销预填、P3 聚合、集成与验收。

## 12. 通知聚合工具（2026-10-19 14:18）

| 工具 | 状态 | 说明 |
|---|---|---|
| `notice_sources` | ✅ | 8 个来源：jwc、新闻网 5 栏目（要闻/媒体聚焦/探索发现/综合/活力校园）、学工通知、学工新闻 |
| `notice_list` | ✅ 已测 | 跨来源列表，支持 sources/category/keyword/since/limit；按发布时间倒序 |
| `notice_search` | ✅ 已实现 | 关键词跨源搜索 |
| `notice_get` | ✅ 已实现/待实测 | 仅允许 jwc/news/affairs 域名；jwc `#vsb_content`、news `Article_content`、affairs `artview_content` |
| 解析器 | ✅ | jwc `.Newslist li`、news `ul.list li>a.card/item`、affairs `.newlist li`；30 分钟缓存 |

未接入（标 backlog）：公开公文（需登录页/API 观察）、学院官网（各站结构不同，需逐站适配）。

## 13. 教务/交我办工具（2026-10-19 14:21）

| 工具 | 状态 | 说明 |
|---|---|---|
| `profile_get` | ✅ 已测 | `/api/account` → 姓名/学号/学院/班级；已返回 |
| `timetable_get` | ✅ 已测 | POST `/kbcx/xskbcx_cxXsKb.html?gnmkdm=N2151`，xnm=2026 / xqm=3；解析 13 条课程（课名/教师/星期/节次/周次/教室/学分） |
| `calendar_events` | ✅ 已测 | `/api/event/list`（`YYYY-MM-DD+00:00` 参数）；返回个人课程/活动事件 + 校历事件 |
| `services_catalog` | ✅ 已实现 | `/api/task/me/apps`（298 项），30 分钟缓存 |
| `services_search` | ✅ 已测 | 搜索"报销"返回 8 项，含 **AI自助报销**（`apply.jdcw.sjtu.edu.cn/req/reimbursement`）和 **我的发票(AI报销)**（`.../my_invoice/`）——报销预填的目标入口已确认 |

下一轮：活动列表/详情（OAuth token 流程）、邮箱 SOAP 搜索/读取、云盘、报销预填、P3 聚合。

## 14. 活动与邮箱（2026-10-19 14:23）

| 工具 | 状态 | 说明 |
|---|---|---|
| `activity_list` | ✅ 已测 | OAuth code → `/api/v1/login/token` → Bearer；返回活动 id/名称/主办/图片/链接；startTime 字段待补 |
| `activity_detail` | ✅ 已实现 | `/api/v1/activity/{id}?detail=1` |
| `mail_search` | ⚠️ 阻塞 | Zimbra SOAP `/service/soap` 返回 500 `service.AUTH_REQUIRED`（`no valid authtoken present`）；浏览器 UI 会话正常（收件箱 51），但 `ZM_AUTH_TOKEN` 作为 SOAP authToken 被拒 |
| `mail_read` | ⚠️ 同上 | 依赖 SOAP |
| `mail_draft` | ⚠️ 未验证 | `SaveDraftRequest` 实现，待 SOAP 可用后验证 |
| 已尝试 | — | raw/decoded token、Cookie 头、`X-Zimbra-Csrf-Token`、`Origin/Referer`、`/service/soap/` 路径均失败 |

下一步（下一轮）：
1. 邮箱改为 **浏览器 UI 抓取** 或从 Zimbra 页面 JS 取真正的 SOAP authToken（`ZmCsfeCommand`/`Zs` 内部 token）；
2. 活动 startTime/endTime 字段从详情接口补齐；
3. 云盘（pan）列表/配额、报销预填、P3 `search_all`。

## 15. 邮箱突破 + P3 聚合（2026-10-19 14:26）

**邮箱 Zimbra SOAP 根因与修复**：
- SOAP 请求除 `authToken`（`ZM_AUTH_TOKEN` cookie 值）外，还必须带 **`X-Zimbra-Csrf-Token` 请求头**，值取自 Zimbra 页面 JS 的 `window.csrfToken`（42 字符）；
- 只带 authToken / 只带 Cookie / 用 csrf 当 authToken 都会 `500 no valid authtoken present`；
- 实现：打开邮箱页读取 token+csrf（缓存 30 分钟），SOAP 失败 `AUTH_REQUIRED` 时清 mail cookie 重新 SSO 重试一次。
- 验证：`mail_search` 返回收件箱邮件（id/主题/发件人/时间/摘要），`mail_read` 返回正文（HTML 实体已解码）；`mail_draft` 代码就绪（SaveDraftRequest），未实发验证。

**新增 `search_all`**：水源 + 公众号 + 通知 + 活动并行聚合，返回统一结构 + 各源 warnings；已实测（perSource 限制修复）。
**活动**：`activity_list` 已实测（OAuth token 链路）；startTime 字段待详情补齐。

累计已注册工具：约 27 个。剩余：云盘（pan）列表/配额、报销预填、验收文档；mail_draft 实测。

## 16. 报销字段级预填逆向（2026-10-19 14:45–15:05）

**目标 SPA**：`https://apply.jdcw.sjtu.edu.cn/finance-claim/ui/home`（"AI自助报销"日常报销表单；Vue3 + Element Plus）。
入口链路：`/req/reimbursement`（AI自助报销首页，卡片：我的发票/暂借办理/酬金申报/…）→ 我的发票 = 独立 SPA `/my_invoice/`；真正报销表单是 `finance-claim` 应用。

**my_invoice（我的发票）SPA 事实**：
- 页面：`/my_invoice/?locale=zh`，`GET /my_invoice/api/userinfo`、`PUT /api/binds/refreshAuditResult`、`GET /api/binds/page?pageNo=1&pageSize=999&status=0`；
- 发票卡片：`article.invoice-card`，主按钮 `.invoice-card__button--primary`（报销）；另有 分享/添加标签/弃用发票/凭证&附件；
- "报销" 点击 = `PUT /my_invoice/api/binds/batchReimb` `{ids}` → 生成预约单并 `window.location.href = data.urlNew`（另有 AddLabelPopup 选择"日常报销/国内差旅"后预约报销）；
- 上传：`POST /my_invoice/api/invoices/ocr`（发票识别），`/binds/{id}/upload`（附件），`/binds/{id}/cancelAppointment`（取消预约）。

**finance-claim（报销表单）事实**：
- 路由（bundle 实测）：`/ui/home`（日常报销）/`/ui/invoice`（选取发票）/`/ui/invoice/detail`/`/ui/project`/`/ui/travel/:id`/`/ui/contract`/`/ui/remuneration*`/`/ui/temporary-loan*`；
- 表单字段（PC 版）：报销项目（`button.pc-picker-card`）、支付信息（picker）、合同信息、非发票附件（行程单/补充材料，`input[type=file]`）、审批信息（业务审批人/复审人）、实际报销人、**摘要**（题注"摘要"的 textarea）、特殊事项说明、发票列表（发票管理）、报销承诺勾选、合计、**提交预约单**；
- 发票管理对话框：`.el-dialog.common-dialog--common-dialog`，搜索框 placeholder「可通过开票单位、发票金额、标签、分享人进行搜索。」，行 `.el-table__row`，行内 `input.el-checkbox__original`（勾选用视觉层 `.el-checkbox__inner`），底部 `全选`/`上传发票`/`保存`；上传发票的文件输入 `input[type=file][accept=".pdf,.jpg,.jpeg,.png,.gif"]`；
- 保存发票后调 `POST /claim/invoice/refresh` + `POST /claim/info`（仅刷新表单态，未生成服务端预约单：重开表单仍为空，已验证）；
- 报销项目选择器：`.el-overlay.el-modal-dialog`，标题"选择授权项目/添加非授权项目"，项目行 `label.el-checkbox[aria-label="选择<编号>，<姓名>，<项目名>"]`，右侧显示 单位代码/可用余额/预算项/报销金额（默认自动按发票金额分配），底部 `报销金额/已填写/待填写` + `取消`/`保存`；
- 提交按钮：`button:has-text("提交预约单")`（**MCP 绝不点击**）。

**接口表（bundle 字符串实测）**：`/finance-claim/invoice/list`、`/invoice/title/list`、`/claim/info`、`/claim/project/list`、`/claim/contract/list`、`/claim/invoice/refresh`、`/claim/save`、`/claim/basic/draft/save`、`/claim/proj/draft/save`、`/claim/pay/draft/save`、`/invoice/ocr`、`/invoice/attach`、`/claim/search/project` 等。

**实现**：`src/browser/finance.ts`（prefillReimbursement / prefillReimbursementOnPage）+ `src/tools/reimburse.ts`（`reimburse_prefill`）。
**实测**：2026-10-19 15:07，`{invoiceQuery:"XX.XX", fundingSource:"ZIRC20XX-XX", description:"..."}` → `status:"prefilled_awaiting_submit"`，项目卡片 `AOxxxxxx/xxx/xxx ZIRC20XX-XX 致远未来学者项目 ¥XX.XX`，合计 `¥XX.XX·1 张发票`，摘要已填；截图见 `%LOCALAPPDATA%\sjtu-mcp\artifacts\reimburse\`。**未提交、未支付。**

## 17. 活动平台字段与报名逆向（2026-10-19 14:50–15:05）

- 列表原始字段：`activity_time:[start,end]`、`address`、`presenter`、`sponsor`、`method`、`signed_up_num`、`person_num`、`registration_time:[start,end]`、`img`；**没有 start_time/end_time 顶层字段** → 原 `startTime/endTime` 映射为 null 的根因。
- 详情原始字段：`base_info.{start_time,end_time,introduction,presenter_bio,address,custom_properties,activity_type_id,activity_type}`、`sign_up_info.{method,person_num,registration_time,form_design,need_captcha,cancel_sign_up,sign_up_url}`、`in_signed_up/in_collection/in_calendar/has_subscribed`、`signed_up_num`。
- 令牌：浏览器 `IMPSA-Token` cookie（JWT）作为 `Authorization: Bearer <jwt>` 可直连全部活动 API；OAuth `code` 常被 SPA 先消费（"登录凭证已使用"），已实现 cookie 优先 + code 回退。
- 报名方式枚举（`GET /api/v1/dict/all` → signupMethods）：1 线上报名（审核录取）、2 线下报名、3 线上报名（先到先得）、4 无需报名、5 线上报名（随机录取）、6 跳转其他报名、7 不显示报名方式。
- 报名页：前端路由 `/activity/signUp/:id`（组件 ActivitySignUp），但本机直接访问 `detail/:id`、`signUp/:id` 均落 `/401`（SPA 请求 `/api/v1/activity/0`，`route.params.id` 解析不到）；`/activity/signedUp`、`/activity/list` 正常。
- 报名提交 API **未观察到**（详情/页面网络里只有活动详情与字典请求）；`need_captcha` 表明提交还需验证码。
- 结论：**不实现 `activity_signup_prefill`**（写操作 + 深链不可用 + 验证码）；`activity_detail` 已返回报名方式/名额/报名窗口/验证码需求/是否已报名。

## 18. 通知来源扩展与阻塞（2026-10-19 15:00）

- ✅ 新增船建学院源：`https://naoce.sjtu.edu.cn/gjh_tzgg.html`；列表结构 `ul.dj_lb1 > li > a + span.sj`；实测 8 条、标题/日期正确；`notice_get` 支持该域名，正文 `.ab_nr`，标题 `h2.ny_bt`。
- ❌ `publicoa.sjtu.edu.cn`：未登录跳 jAccount；登录后返回 Vue SPA 外壳（`/static/ui/`），公开公文列表 API 未逆向。
- ❌ 机械学院 `me.sjtu.edu.cn/tzgg.html`、电院 `www.seiee.sjtu.edu.cn/cpyc_notice.html`：HTML 中无文章条目（JS 渲染），正则解析 0 条，需浏览器渲染或接口逆向。
- ❌ `umji.sjtu.edu.cn` 根路径 404。

## 19. mail_draft 实测（2026-10-19 15:02）

- `mail_draft({to:"example@sjtu.edu.cn", subject:"[sjtu-mcp 验证] 草稿功能测试（不会发送）", body:...})` → `{draftId:"<草稿id>", saved:true}`；
- `mail_search("in:drafts subject:sjtu-mcp")` 命中 id=<草稿id>（fragment 与正文一致）；
- 未发送、未删除；草稿保留在用户草稿箱。

## 20. pan_list 非空目录字段映射（2026-10-19 15:03/15:08）

- 个人空间根目录：`GET /api/v1/directory/{lib}/{space}/?...` → `{path:[],subDirCount:0,fileCount:0,totalNum:0,contents:[]}`（空）；
- 创建临时目录：`PUT /api/v1/directory/{lib}/{space}/{name}?user_token&access_token&user_id=<145279>&conflict_resolution_strategy=rename` → 201 `{creationTime,path:[name]}`；
- 非空列表 entry 实际字段：`{name,type:"dir",userId,creationTime:ISO,modificationTime:ISO,eTag,virusAuditStatus,sensitiveWordAuditStatus,path:[name],hasSync,authorityList,authorityButtonList}`；
- 修复映射：`modifiedAt` 原用 `modifiedTime` 且 `Number()` 解析 ISO 字符串 → NaN；改为 `modificationTime/creationTime` ISO 解析；`path` 用 `item.path[]` 拼接；新增 `createdAt`、`totalNum/subDirCount/fileCount`；
- MCP `pan_list("/")` 实测返回 `{totalNum:1,subDirCount:1,fileCount:0,entries:[{name,path:"/<name>",type:"dir",isFolder:true,modifiedAt,createdAt}]}`；
- 清理：`DELETE /api/v1/directory/{lib}/{space}/{name}?...` → 200 `{recycledItemId}`；根目录恢复 `totalNum:0`。

## 21. 构建 / 重启 / 冒烟（2026-10-19 15:07）

- `npm run build` ✅（tsc，无错误）；`npm run smoke` ✅（tools/list 29 个工具，auth_status ok）；
- 重启：kill `node dist/index.js` + kill `chrome-profile` 所属 Chrome → DSH 自动拉起新 MCP 进程；新 Chrome 懒启动并复用持久化 jAccount/SSO 登录态（验证：重启后 reimburse/activity/pan 均无需重新登录）；
- 冒烟（经 DSH MCP 客户端实测）：`reimburse_prefill`、`activity_list`、`activity_detail`、`pan_list`、`notice_list`(naoce)、`mail_search(in:drafts)` 全部 ok。
