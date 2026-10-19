# SJTU MCP — 交付说明与验收（v1 当前状态）

> 更新时间：2026-10-19 15:10。项目位置：`<workspace>/sjtu-mcp`。
> 定位：本机 stdio MCP server，供 DSH 使用；单用户自用；写操作只"打开/预填"，不自动提交、不自动支付、不自动发信。

## 1. 已交付工具（DSH 中名为 `mcp__sjtu__<tool>`）

### 认证（4）
| 工具 | 状态 |
|---|---|
| `auth_login` | ✅ 非阻塞打开 Chrome 登录页 |
| `auth_status` | ✅ 检查 JAAuthCookie，不输出 cookie 值 |
| `auth_probe` | ✅ 7 个校园服务登录态探测 |
| `auth_logout` | ✅ 清 cookie + 关浏览器 |

### 水源（3）
`shuiyuan_search` ✅、`shuiyuan_hot` ✅、`shuiyuan_topic` ✅（均实测；需 SSO）

### 公众号（3）
`wechat_search` ✅（搜狗）、`wechat_read_article` ✅（微信直链）、`wechat_resolve_url` ✅ 已实现（搜狗跳转 → 真实 Chrome 解析）

### 通知聚合（4）
`notice_sources`、`notice_list`、`notice_search`、`notice_get`
- 来源 9 个：jwc、新闻网 5 栏目（要闻/媒体聚焦/探索发现/综合/活力校园）、学工通知、学工新闻、**学院通知（船建学院·通知公告，2026-10-19 新增）**；
- ✅ 列表实测；正文解析已适配 jwc/news/affairs/**naoce** 域名。

### 教务与交我办（7）
`profile_get` ✅、`timetable_get` ✅、`calendar_events` ✅、`services_catalog` ✅、`services_search` ✅、`services_open` ✅（打开事项页）、**`reimburse_prefill` ✅ 字段级预填（实测，见 §9）**、`prefill` 状态管理未单独建工具。

### 活动（2）
`activity_list` ✅（OAuth/会话令牌链路；返回起止时间/地点/主讲人/报名方式/名额/报名时间窗）、
`activity_detail` ✅（新增简介全文/主讲人简介/自定义属性/报名信息/本人状态，见 §10；报名预填未实现，见 §12）

### 邮箱（3）
`mail_search` ✅、`mail_read` ✅（Zimbra SOAP + `X-Zimbra-Csrf-Token`）、
**`mail_draft` ✅ 已实测保存草稿（draft id <草稿id>，未发送，见 §13）**

### 云盘（2）
`pan_info` ✅、**`pan_list` ✅ 含非空目录字段映射实测（见 §14）**

### 聚合（1）
`search_all` ✅（水源+公众号+通知+活动并行聚合）

**合计：29 个工具已注册**（`tools/list` 实测：认证 4 + 水源 3 + 公众号 3 + 通知 4 + 教务/交我办 7 + 活动 2 + 邮箱 3 + 云盘 2 + 聚合 1 = 29）。

## 2. 已验证 / 未验证

| 项 | 结论 |
|---|---|
| jAccount 登录 + 7 服务 SSO | ✅ 实测 |
| 水源搜索/热榜 | ✅ 实测（注意 429，已限速） |
| 搜狗 + 微信直链正文 | ✅ 实测 |
| 通知 9 来源列表 | ✅ 实测（含学院源） |
| 课表/日历/交我办目录 | ✅ 实测 |
| 活动列表/详情（起止时间/地点/报名方式） | ✅ 实测（2026-10-19 修复字段映射） |
| 邮箱搜索/读信/存草稿 | ✅ 实测（草稿 id <草稿id>，未发送） |
| 报销字段级预填（选发票/选经费项目/摘要，停在提交前） | ✅ **实测**（status=`prefilled_awaiting_submit`，未提交） |
| 报销 PDF 上传（发票管理→上传发票→OCR） | ⚠️ 已实现 + 上传输入框/请求链路已探明；**无真实发票 PDF 未做实传验证**（避免向财务系统写入测试发票） |
| 活动报名预填 | ❌ 未实现（报名页深链 401 + 需验证码；见 §12） |
| 公开公文（publicoa） | ❌ 未接入（SPA + 需 jAccount；API 未逆向） |
| 学院官网通知 | ⚠️ 已接入 1 个（船建学院）；机械/电院为 JS 渲染，未接入 |
| 云盘非空目录字段映射 | ✅ 实测（临时目录创建→列表→删除，字段全部对上） |

## 3. 使用方式（DSH）

- 配置：`~/.dsh/profiles/desktop/cordis.patch.yml` 中 `mcp-sjtu`（见 `docs/dsh-integration.md`）；重启/热重载后工具可见。
- 示例：
  - "搜一下水源最近关于选课的热帖" → `shuiyuan_hot` / `shuiyuan_search`
  - "帮我看看交大公众号关于奖学金的通知" → `wechat_search` + `wechat_resolve_url` + `wechat_read_article`
  - "今天有什么课/作业/通知" → `calendar_events` + `notice_list`
  - "查一下我的课表和成绩入口" → `timetable_get` / `services_search`
  - "帮我把那张 XX.XX 的交通发票报销一下，走 ZIRC20XX 项目" → `reimburse_prefill`（预填后由本人核对提交）
  - "最近有什么第二课堂活动" → `activity_list`（type=second-classroom）+ `activity_detail`
  - "搜一下邮箱里奖学金相关邮件" → `mail_search` + `mail_read`

## 4. 维护

- 登录过期：`auth_status` 显示 expired → 调 `auth_login` 手动登录一次（profile 持久化，通常无需重复）。
- 水源/搜狗反爬：已限速+缓存；失败会返回明确错误码。
- 活动平台令牌：优先读取浏览器 `IMPSA-Token` cookie 作为 Bearer；失败回退 OAuth code 交换（code 可能被前端先用掉，已做兜底）。
- 依赖：Node 24，`npm run build` 重新构建，重启 MCP server（杀掉 `node <workspace>/sjtu-mcp\dist\index.js` 后 DSH 会自动拉起，Chrome 会由新进程按持久化 profile 重新拉起）。
- 回滚：`docs/dsh-integration.md`。

## 5. 已知限制（明确）

1. 报销只做"预填到提交前"：`提交预约单`、`支付信息`、`报销承诺` 勾选、行程单上传均需本人完成；
2. 报销 PDF 上传分支代码就绪但未用真实发票验证（避免测试数据写入财务系统）；
3. 活动报名预填未实现：`/activity/signUp/:id` 深链在本机会话返回 401，且报名需验证码（`need_captcha`），报名提交 API 未观察；
4. 公开公文（publicoa.sjtu.edu.cn）为 SPA + jAccount 鉴权，未逆向；机械/电院学院站列表由 JS 渲染，未接入（已接入船建学院 1 个源）；
5. 云盘个人空间目前为空，非空目录映射通过"临时目录创建→列表→删除"验证（见 §14），测试数据已清理；
6. 部分页面随学校改版可能失效，解析器已按源隔离，失败返回 `SOURCE_CHANGED`。

## 6. 云盘（pan）实测补充（2026-10-19 早期）

- 浏览器打开 pan.sjtu.edu.cn 会落到 /login，仅有 jAccount cookie 不足以访问云盘 API；/user/v1/space/1/personal 返回 400 EmptyUserToken。
- 需要：sso-login-redirect/xpw8ou8y → jAccount → 回调 code → POST /user/v1/sign-in/verify-account-login/...?type=sso&credential={code} 换取 userToken，再用 userToken 调 API。

## 7. 云盘 userToken 链路已打通（2026-10-19）

- SSO：GET https://pan.sjtu.edu.cn/user/v1/sign-in/sso-login-redirect/xpw8ou8y?auto_redirect=true&device_id=Chrome+155.0.0.0 → 落到 /login?code=...&state=...；
- 换取：POST /user/v1/sign-in/verify-account-login/xpw8ou8y?device_id=...&type=sso&credential={code} → userToken（128 字符，expiresIn≈30 天，含 userId）；
- 空间：POST /user/v1/space/1/personal?user_token={token} → libraryId、spaceId、accessToken（128 字符，expiresIn=1800s）；
- 列目录：GET /api/v1/directory/{libraryId}/{spaceId}/?user_token={token}&access_token={accessToken} → 200，返回 contents。

## 8. 云盘工具已交付（2026-10-19）

- `pan_info` ✅ 实测：返回 libraryId/spaceId/token 过期时间；
- `pan_list` ✅ 实测：根目录 200；非空目录字段映射见 §14；
- 缓存：userToken+accessToken 按 personal.expiresIn 缓存，过期自动重登。

## 9. 报销字段级预填（reimburse_prefill，2026-10-19 实测）

**目标页面**：`https://apply.jdcw.sjtu.edu.cn/finance-claim/ui/home`（"AI自助报销"日常报销表单，Vue3 + Element Plus SPA）。

逆向得到的字段级操作链（全部为真实 UI 操作，`src/browser/finance.ts`）：

| 用户需求 | DOM / 接口 | 工具行为 |
|---|---|---|
| 上传 PDF 发票 | 发票管理对话框内 `上传发票` 按钮 → 隐藏 `input[type=file]`（accept `.pdf,.jpg,.jpeg,.png,.gif`）→ `POST /finance-claim/invoice/ocr` | `invoiceFiles[]` 逐个 `setInputFiles` 上传并等待 OCR 列表刷新（⚠️ 无真实发票未实传验证） |
| 选择发票 | 发票管理对话框：搜索框（可通过开票单位/发票金额/标签/分享人搜索）+ `.el-table__row` 勾选 + `保存`（`POST /claim/invoice/refresh`） | `invoiceQuery` 命中行勾选；`selectAllMatches` 可全选；保存后校验表单发票列表 |
| 选择经费/项目 | `button.pc-picker-card`（报销项目）→ 全屏选择器"选择授权项目/添加非授权项目"→ `label.el-checkbox[aria-label]` → `保存` | `fundingSource` 支持项目名/项目编号（ZIRC20XX-XX）/财务编号（AOxxxxxx/xxx/xxx）；勾选后校验 checkbox + 面板 + 表单卡片，失败自动取消 |
| 简短说明 | "其他信息→摘要" `textarea` | `description` 写入摘要（input+change 事件），特殊事项说明不填 |
| **强制安全** | `提交预约单` 按钮 | **从不点击**；`submitted:false`；返回截图 + 待人工确认清单 |

**实测结果（2026-10-19，本机）**：

- 调用：`reimburse_prefill({invoiceQuery:"XX.XX", fundingSource:"ZIRC20XX-XX", description:"市内交通费报销（MCP 预填，未提交）"})`；
- 返回：`status:"prefilled_awaiting_submit"`、`total:"合计 ¥XX.XX· 1 张发票"`、发票=某出行平台 XX.XX（2026-08-12）、报销项目=`AOxxxxxx/xxx/xxx ZIRC20XX-XX 致远未来学者项目 ¥XX.XX`、摘要已填；
- 截图：`%LOCALAPPDATA%\sjtu-mcp\artifacts\reimburse\reimburse-prefill-<ts>.png`（已验证画面：项目卡片/发票列表/合计正确，提交按钮未点击）；
- `openOnly:true` 回退模式 ✅（仅打开表单）；
- 未指定发票时的部分预填 ✅、`invoiceFiles` 不存在文件的容错 ✅（返回 warnings，不崩溃）；
- 安全说明：预填仅在页面内存态，**不产生服务端预约单**（重开表单为空）；提交必须本人操作。

## 10. 活动字段修复（activity，2026-10-19 实测）

- 列表接口 `GET /api/v1/activity/list/home` 原始字段为 `activity_time:[start,end]`、`address`、`presenter`、`method`、`signed_up_num`、`person_num`、`registration_time:[start,end]`；
- 详情接口 `GET /api/v1/activity/{id}?detail=1` 的字段在 `base_info.start_time/end_time/introduction/presenter_bio/address/custom_properties` + `sign_up_info`；
- 已修复映射：`startTime/endTime`（原为 null）现在返回真实起止时间；新增 `address/presenter/signedUpNum/capacity/registrationStart/registrationEnd/signUpMethodId/signUpMethod`；详情新增 `presenterBio/customProperties/signUp{...}/userState{...}/signUpPage`；
- 报名方式枚举（实测 `GET /api/v1/dict/all`）：1 线上报名（审核录取）/2 线下报名/3 线上报名（先到先得）/4 无需报名/5 线上报名（随机录取）/6 跳转其他报名/7 不显示报名方式；
- 活动令牌：优先使用浏览器 `IMPSA-Token` cookie 作为 Bearer（`Authorization: Bearer <jwt>`），避免 OAuth code 被前端先用掉导致的 401。

## 11. 通知来源扩展（2026-10-19 实测）

- 新增源：`naoce_gjh`「船建学院·通知公告」`https://naoce.sjtu.edu.cn/gjh_tzgg.html`；
- 解析器：`ul.dj_lb1 li > a` + `span.sj`（YYYY-MM-DD），实测 8 条、时间正确；
- `notice_get` 新增允许域名 `naoce.sjtu.edu.cn`，正文容器 `.ab_nr`，标题 `h2.ny_bt`（避免误取页面 h1 "国际交流"）；
- 未接入：publicoa.sjtu.edu.cn（SPA + jAccount，API 未逆向）；机械学院 `me.sjtu.edu.cn/tzgg.html`、电院 `seiee` 列表为 JS 渲染（HTML 无文章条目），需浏览器渲染或接口逆向。

## 12. 活动报名（未实现，阻塞说明）

- 前端路由存在：`/activity/detail/:id`、`/activity/signUp/:id`（`ActivitySignUp`），但**直接访问在本机会话均落到 `/401` 页面**（SPA 内 `route.params.id` 解析为 0，请求 `/api/v1/activity/0`），未能稳定打开报名页；
- 报名方式枚举显示存在"线上报名（审核录取/先到先得/随机录取）"等活动（如 id 18840、18856）；
- 详情 `/sign_up_info` 暴露 `need_captcha`、`form_design`、`cancel_sign_up` 等字段，其中 18840 `need_captcha=true`；
- **未观察到报名提交 API**，且报名是写操作（提交后进入审核/录取流程，不可安全回滚），按"不自动提交"原则**不实现 `activity_signup_prefill`**；`activity_detail` 已返回报名方式/名额/报名时间窗/验证码需求，供用户人工判断。

## 13. mail_draft 实测（2026-10-19）

- 调用 `mail_draft({to:"example@sjtu.edu.cn", subject:"[sjtu-mcp 验证] 草稿功能测试（不会发送）", body:...})`；
- 返回 `{draftId:"<草稿id>", saved:true}`；`mail_search("in:drafts subject:sjtu-mcp")` 命中该草稿（id <草稿id>），**未发送、未删除**；
- 如需清理：在邮箱草稿箱手动删除该验证草稿。

## 14. pan_list 非空目录字段映射实测（2026-10-19）

个人空间根目录为空（`contents:[]`），为验证非空映射，用云盘 API 创建临时目录 → 用 MCP `pan_list` 读取 → 删除临时目录（可逆、无残留）：

- 创建：`PUT /api/v1/directory/{lib}/{space}/{name}?user_token&access_token&user_id&conflict_resolution_strategy=rename` → 201；
- `pan_list("/")` 实测返回：`totalNum:1, subDirCount:1, fileCount:0`，entry=`{name, path:"/<name>", size:null, type:"dir", isFolder:true, modifiedAt:ISO, createdAt:ISO}`（字段映射与真实 JSON 完全对上）；
- 删除：`DELETE /api/v1/directory/{lib}/{space}/{name}?...` → 200（recycledItemId），根目录恢复 `totalNum:0`（已确认清空）。

## 15. 构建 / 重启 / 冒烟（2026-10-19 15:07）

- `npm run build`（tsc）✅ 通过，无 TypeScript 错误；
- 重启方式：kill `node <workspace>/sjtu-mcp\dist\index.js` + kill 使用 `%LOCALAPPDATA%\sjtu-mcp\chrome-profile` 的 Chrome → DSH 自动拉起新进程（实测新 PID 3776，15:06:51），Chrome 懒启动并可复用持久化登录态；
- 冒烟（经真实 DSH MCP 客户端）：`notice_list`(naoce) ✅、`pan_list` ✅、`activity_detail` ✅、`activity_list` ✅、`reimburse_prefill` ✅（§9 全链路）、`reimburse_prefill(openOnly)` ✅、`mail_search(in:drafts)` ✅。

## 16. 证据与产物位置

- 逆向证据（列表/详情/上传对话框 DOM、SPA bundle、接口字符串）：`<workspace>/sjtu-mcp\artifacts\reimburse\`、`artifacts\pan\`、`artifacts\notices\`；
- 预填截图：`%LOCALAPPDATA%\sjtu-mcp\artifacts\reimburse\reimburse-prefill-<timestamp>.png`；
- 临时验证数据已清理（pay 临时目录已删、无测试草稿以外的写入）。

## 9. 致远未来学者报销流程（新增，2026-10-19）

- 完整标准流程已记录到 `docs/reimbursement-workflow.md`：
  1) ZIRC「新增经费发生」→ 导师审批 → 截图「附件1-审批清单」（无须等管理中心）；
  2) AI 报销：上传 PDF 发票 → 每张发票附审批清单（>1000 元另附支付记录）→ 选发票（同类可多张）→ 项目选「致远未来学者」→ 收款方式选「我的银行卡」→ 非发票附件（如打车行程单）→ 摘要格式：`2026致远未来学者计划本人组（顾问导师：导师）成员xxx报xxx费用，用于xxx`。
- ZIRC 系统实测（只读，未提交）：jAccount 已登录（本人 <学号> 某学院），我的项目=2026 年致远未来学者项目（1 个有效），审批管理含「项目经费发生」26 条；内页有 iframe 框架保护，直接内页 URL 会跳回首页。
- `reimburse_prefill` 支持选发票/选经费项目/填摘要并停在提交前；审批清单、支付记录、行程单等附件与多发票勾选尚未自动化（人工完成）。

## 10. ZIRC 工具（2026-10-19 新增）

- 新增 `zirc_project_get`（只读项目信息/tag）与 `zirc_expense_prefill`（预填新增经费发生表单：类型/金额/说明/发票号，停在提交审批前）。
- 已实测：项目 tag 解析成功；预填 0.01 元占位数据返回 `prefilled_awaiting_submit`/`submitted:false`，表单随后关闭，未提交、未产生数据。
- 工具总数：32。
- iframe 保护通过系统自身 `iframe_crmeb_main` 框架加载内页解决（非权限绕过）。
