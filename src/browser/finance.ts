import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright-core';
import { broker } from './broker.js';
import { loadConfig } from '../core/config.js';
import { SourceError } from '../core/tool.js';

/**
 * Field-level prefill for the SJTU finance SPA (AI 自助报销 / finance-claim).
 *
 * Reverse-engineered structure (2026-10-19, verified against the live app):
 *   https://apply.jdcw.sjtu.edu.cn/finance-claim/ui/home
 *   - 发票管理 button opens an ElDialog listing the user's available invoices
 *     (search box: 可通过开票单位、发票金额、标签、分享人进行搜索).
 *     Rows are `.el-table__row`; select via `.el-checkbox__inner`; commit via 保存.
 *   - 上传发票 inside that dialog exposes a hidden `input[type=file]`
 *     (accept=".pdf,.jpg,.jpeg,.png,.gif") -> server OCR (/invoice/ocr).
 *   - 报销项目 is a button.pc-picker-card that opens a full-screen picker
 *     ("选择授权项目"); each project is a `label.el-checkbox[aria-label]`;
 *     select it, the amount is auto-allocated, then 保存.
 *   - 摘要 textarea lives in a .el-form-item whose label text is 摘要.
 *   - 提交预约单 performs the real submit. THIS MODULE NEVER CLICKS IT.
 */

export const FINANCE_FORM_URL = 'https://apply.jdcw.sjtu.edu.cn/finance-claim/ui/home';

const STEP_TIMEOUT_MS = 15_000;

export interface ReimbursePrefillInput {
  /** Local PDF/image invoice files to upload (OCR) before selecting. */
  invoiceFiles?: string[];
  /** Keyword used in the invoice list search box (seller / amount / tag). */
  invoiceQuery?: string;
  /** Select every invoice row matching `invoiceQuery` (default: first match only). */
  selectAllMatches?: boolean;
  /** 经费/项目 keyword (project name, project code, or finance code). */
  fundingSource?: string;
  /** 摘要 (short description). */
  description?: string;
  /** Skip UI automation; only open the page (legacy behaviour). */
  openOnly?: boolean;
}

export interface ReimbursePrefillResult {
  status:
    | 'prefilled_awaiting_submit'
    | 'partially_prefilled'
    | 'opened_for_manual_prefill'
    | 'auth_required';
  url: string;
  screenshot: string | null;
  submitted: false;
  invoice: {
    query: string | null;
    selected: string[];
    uploaded: string[];
    listCount: number | null;
  };
  project: {
    query: string | null;
    selected: string | null;
    available: string[];
  };
  description: { filled: boolean; value: string | null };
  total: string | null;
  warnings: string[];
  needsManual: string[];
  nextSteps: string[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function artifactsDir(): string {
  const dir = path.join(loadConfig().dataDir, 'artifacts', 'reimburse');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function bodyText(page: Page): Promise<string> {
  return page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
}

/** Extract the trailing "合计 ¥xx·N 张发票" summary if present. */
function readTotal(text: string): string | null {
  const line = text.split('\n').find((entry) => entry.includes('合计') && entry.includes('发票'));
  return line ? line.trim().slice(0, 120) : null;
}

/**
 * Find (or create) the finance form page. Reuses a single tab so repeated tool
 * calls do not spawn a new tab each time.
 */
async function openFormPage(): Promise<Page> {
  const context = await broker.start();
  for (const page of context.pages()) {
    if (!page.isClosed() && page.url().startsWith('https://apply.jdcw.sjtu.edu.cn/finance-claim/')) {
      await page.bringToFront().catch(() => undefined);
      await page
        .goto(FINANCE_FORM_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 })
        .catch(() => undefined);
      return page;
    }
  }
  const page = await context.newPage();
  await page.bringToFront().catch(() => undefined);
  await page
    .goto(FINANCE_FORM_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    .catch(() => undefined);
  return page;
}

async function waitForFormReady(page: Page): Promise<boolean> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const url = page.url();
    if (url.includes('jaccount.sjtu.edu.cn') || url.includes('/login')) return false;
    const ready = await page
      .locator('button:has-text("发票管理")')
      .first()
      .isVisible()
      .catch(() => false);
    if (ready) return true;
    await sleep(500);
  }
  return false;
}

async function ensureClaimFormPage(
  warnings: string[],
): Promise<{ page: Page; authRequired: boolean }> {
  const page = await openFormPage();
  const ready = await waitForFormReady(page);
  if (ready) return { page, authRequired: false };
  const url = page.url();
  const text = await bodyText(page);
  if (url.includes('jaccount') || /统一身份认证|登录/.test(text.slice(0, 500))) {
    return { page, authRequired: true };
  }
  throw new SourceError('报销页面未加载出「发票管理」（页面结构可能改版）', {
    code: 'SOURCE_CHANGED',
    hint: `当前 URL: ${url}`,
  });
}

/** Wait until the invoice dialog closes (保存 clicked) or timeout. */
async function waitInvoiceDialogClosed(page: Page): Promise<void> {
  const deadline = Date.now() + STEP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const open = await page
      .locator('.el-dialog:visible')
      .count()
      .catch(() => 0);
    if (open === 0) return;
    await sleep(400);
  }
}

async function openInvoiceDialog(page: Page): Promise<boolean> {
  const button = page.locator('button', { hasText: '发票管理' }).first();
  if (!(await button.isVisible().catch(() => false))) return false;
  await button.click({ timeout: 8_000 }).catch(() => undefined);
  const deadline = Date.now() + STEP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const visible = await page
      .locator('.el-dialog:visible')
      .first()
      .isVisible()
      .catch(() => false);
    if (visible) return true;
    await sleep(300);
  }
  return false;
}

interface InvoiceRow {
  index: number;
  text: string;
  checked: boolean;
}

async function readInvoiceRows(page: Page): Promise<InvoiceRow[]> {
  const dialog = page.locator('.el-dialog:visible').last();
  const rows = dialog.locator('.el-table__row');
  const count = await rows.count().catch(() => 0);
  const out: InvoiceRow[] = [];
  for (let i = 0; i < count; i += 1) {
    const row = rows.nth(i);
    const text = (await row.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    const checked = await row
      .locator('input.el-checkbox__original')
      .first()
      .isChecked()
      .catch(() => false);
    out.push({ index: i, text, checked });
  }
  return out;
}

/** Upload invoice files through the dialog's hidden `input[type=file]`. */
async function uploadInvoices(page: Page, files: string[], warnings: string[]): Promise<string[]> {
  const uploaded: string[] = [];
  for (const file of files) {
    if (!fs.existsSync(file)) {
      warnings.push(`发票文件不存在，已跳过上传：${file}`);
      continue;
    }
    const stat = fs.statSync(file);
    if (!stat.isFile()) {
      warnings.push(`不是普通文件，已跳过上传：${file}`);
      continue;
    }
    const uploadButton = page.locator('.el-dialog:visible button', { hasText: '上传发票' }).last();
    const input = page.locator('.el-dialog:visible input[type=file]').first();
    const hasInput = await input.count().catch(() => 0);
    if (hasInput === 0) {
      warnings.push('未找到「上传发票」的文件输入框，跳过上传');
      break;
    }
    await uploadButton.click({ timeout: 8_000 }).catch(() => undefined);
    await input.setInputFiles(file).catch((error: unknown) => {
      warnings.push(`上传失败：${path.basename(file)}（${error instanceof Error ? error.message : String(error)}）`);
    });
    uploaded.push(path.basename(file));
    // OCR can take a few seconds; wait for the dialog list to refresh.
    const before = (await readInvoiceRows(page)).length;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      await sleep(800);
      const after = (await readInvoiceRows(page)).length;
      if (after !== before) break;
    }
  }
  return uploaded;
}

async function selectInvoices(
  page: Page,
  query: string,
  selectAllMatches: boolean,
  warnings: string[],
): Promise<{ selected: string[]; listCount: number | null }> {
  const search = page.locator('.el-dialog:visible input').first();
  if (await search.count().catch(() => 0)) {
    await search.fill('').catch(() => undefined);
    await search.fill(query).catch(() => undefined);
    await page.waitForTimeout(2_000);
  } else {
    warnings.push('未找到发票搜索框，改为直接在全部发票中匹配');
  }

  let rows = await readInvoiceRows(page);
  const matching = rows.filter((row) => row.text.includes(query));
  if (matching.length === 0) {
    warnings.push(`未找到匹配「${query}」的发票（列表共 ${rows.length} 张），跳过发票选择`);
    return { selected: [], listCount: rows.length };
  }
  const toSelect = selectAllMatches ? matching : matching.slice(0, 1);
  const selected: string[] = [];
  for (const row of toSelect) {
    const target = page.locator('.el-dialog:visible .el-table__row').nth(row.index);
    if (!(await target.locator('input.el-checkbox__original').isChecked().catch(() => false))) {
      await target.locator('.el-checkbox__inner').first().click({ timeout: 5_000 }).catch(() => undefined);
      await page.waitForTimeout(300);
    }
    const stillChecked = await target
      .locator('input.el-checkbox__original')
      .isChecked()
      .catch(() => false);
    if (stillChecked) selected.push(row.text);
  }
  if (selected.length === 0) warnings.push('发票勾选未生效，可能列表已刷新，请手动勾选');

  await page
    .locator('.el-dialog:visible button', { hasText: '保存' })
    .last()
    .click({ timeout: 8_000 })
    .catch(() => undefined);
  await waitInvoiceDialogClosed(page);
  await page.waitForTimeout(1_500);

  rows = rows.filter((row) => row.text.includes(query));
  return { selected, listCount: rows.length };
}

/** Select 报销项目 (经费项目). Returns the aria-label of the selected project. */
async function selectProject(
  page: Page,
  fundingSource: string | undefined,
  warnings: string[],
): Promise<{ selected: string | null; available: string[] }> {
  const picker = page.locator('button.pc-picker-card').first();
  const enabled = await picker.isVisible().catch(() => false);
  if (!enabled) {
    warnings.push('未找到「报销项目」选择卡片，跳过项目预填');
    return { selected: null, available: [] };
  }
  if (await picker.evaluate((el) => el.classList.contains('is-disabled')).catch(() => false)) {
    warnings.push('「报销项目」不可选（通常需要先选择发票），跳过项目预填');
    return { selected: null, available: [] };
  }
  await picker.click({ timeout: 8_000 }).catch(() => undefined);

  const overlay = page.locator('.el-overlay.el-modal-dialog:visible').last();
  const deadline = Date.now() + STEP_TIMEOUT_MS;
  let opened = false;
  while (Date.now() < deadline) {
    const text = (await overlay.innerText().catch(() => '')).slice(0, 400);
    if (text.includes('选择授权项目') || text.includes('添加非授权项目')) {
      opened = true;
      break;
    }
    await sleep(300);
  }
  if (!opened) {
    warnings.push('项目选择器未打开，跳过项目预填');
    return { selected: null, available: [] };
  }

  const readLabels = async (): Promise<string[]> =>
    overlay
      .locator('label.el-checkbox[aria-label]')
      .evaluateAll((nodes) =>
        nodes
          .filter((node) => {
            const el = node as HTMLElement;
            return el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0;
          })
          .map((node) => node.getAttribute('aria-label') ?? ''),
      )
      .catch(() => []);

  const isChecked = async (label: string): Promise<boolean> =>
    overlay
      .locator(`label.el-checkbox[aria-label=${JSON.stringify(label)}] input.el-checkbox__original`)
      .first()
      .isChecked()
      .catch(() => false);

  /** Tick a project row and confirm the checkbox actually flipped. */
  const tickProject = async (label: string): Promise<boolean> => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (await isChecked(label)) return true;
      await overlay
        .locator(`label.el-checkbox[aria-label=${JSON.stringify(label)}] .el-checkbox__inner`)
        .first()
        .click({ timeout: 5_000 })
        .catch(() => undefined);
      await page.waitForTimeout(700);
      if (await isChecked(label)) return true;
    }
    return false;
  };

  const search = overlay.locator('input').first();
  const hasSearch = (await search.count().catch(() => 0)) > 0;
  let available = (await readLabels()).filter(Boolean);

  if (fundingSource && hasSearch) {
    await search.fill('').catch(() => undefined);
    await search.fill(fundingSource).catch(() => undefined);
    await page.waitForTimeout(1_800);
    const filtered = (await readLabels()).filter(Boolean);
    if (filtered.length > 0) available = filtered;
    else warnings.push(`项目搜索「${fundingSource}」无结果，改为在全部项目中匹配`);
  }

  if (available.length === 0) {
    warnings.push('没有可用的报销项目，请手动选择');
    await overlay
      .locator('button', { hasText: '取消' })
      .last()
      .click({ timeout: 5_000 })
      .catch(() => undefined);
    return { selected: null, available };
  }

  // Prefer a label that actually contains the requested funding source.
  const ranked = fundingSource
    ? [...available.filter((label) => label.includes(fundingSource)), ...available.filter((label) => !label.includes(fundingSource))]
    : available;
  let chosen: string | null = null;
  for (const candidate of ranked) {
    if (await tickProject(candidate)) {
      chosen = candidate;
      break;
    }
  }
  if (!chosen) {
    warnings.push('报销项目勾选未生效，请手动选择');
    await overlay
      .locator('button', { hasText: '取消' })
      .last()
      .click({ timeout: 5_000 })
      .catch(() => undefined);
    return { selected: null, available: available.map((label) => label.replace(/^取消?选择/, '')) };
  }

  // The right panel should now show the selected project instead of the empty hint.
  const panelText = (await overlay.innerText().catch(() => '')).replace(/\s+/g, ' ');
  if (panelText.includes('请从左侧勾选报销项目')) {
    warnings.push('项目已勾选但金额分配面板未出现，继续尝试保存');
  }
  await overlay
    .locator('button', { hasText: '保存' })
    .last()
    .click({ timeout: 8_000 })
    .catch(() => undefined);

  // Verify the picker really closed; a validation toast means 保存 was rejected.
  let closed = false;
  const closeDeadline = Date.now() + 10_000;
  while (Date.now() < closeDeadline) {
    const stillOpen = await page
      .locator('.el-overlay.el-modal-dialog:visible')
      .last()
      .innerText()
      .then((text) => text.includes('选择授权项目') || text.includes('添加非授权项目'))
      .catch(() => false);
    if (!stillOpen) {
      closed = true;
      break;
    }
    await page.waitForTimeout(400);
  }
  if (!closed) {
    warnings.push('「报销项目」保存未通过（可能提示请选择报销项目），请手动选择');
    await overlay
      .locator('button', { hasText: '取消' })
      .last()
      .click({ timeout: 5_000 })
      .catch(() => undefined);
    return { selected: null, available: available.map((label) => label.replace(/^取消?选择/, '')) };
  }

  const chosenName = chosen.replace(/^取消?选择/, '');
  await page.waitForTimeout(1_500);
  // Confirm the form card now displays the project code/name.
  const formText = (await bodyText(page)).replace(/\s+/g, ' ');
  const code = /[A-Z]{2,}\d{4}[-/]\d+/.exec(chosenName)?.[0];
  if (!(code ? formText.includes(code) : formText.includes(chosenName))) {
    warnings.push('表单未显示所选报销项目，请核对');
  }
  return { selected: chosenName, available: available.map((label) => label.replace(/^取消?选择/, '')) };
}

/** Fill 摘要 (short description). */
async function fillDescription(page: Page, value: string): Promise<boolean> {
  return page
    .evaluate((text: string) => {
      const textareas = Array.from(document.querySelectorAll('textarea')).filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0,
      );
      for (const area of textareas) {
        let current: HTMLElement | null = area as HTMLElement;
        for (let depth = 0; depth < 8 && current; depth += 1) {
          if ((current.innerText ?? '').includes('摘要')) {
            const setter = Object.getOwnPropertyDescriptor(
              window.HTMLTextAreaElement.prototype,
              'value',
            )?.set;
            if (!setter) return false;
            setter.call(area, text);
            area.dispatchEvent(new Event('input', { bubbles: true }));
            area.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
          current = current.parentElement;
        }
      }
      return false;
    }, value)
    .catch(() => false);
}

async function takeScreenshot(page: Page): Promise<string | null> {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(artifactsDir(), `reimburse-prefill-${stamp}.png`);
    await page.screenshot({ path: file, fullPage: false });
    return file;
  } catch {
    return null;
  }
}

export async function prefillReimbursement(
  input: ReimbursePrefillInput,
): Promise<ReimbursePrefillResult> {
  const warnings: string[] = [];
  const { page, authRequired } = await ensureClaimFormPage(warnings);
  if (authRequired) {
    throw new SourceError('报销页面需要 jAccount 登录（浏览器会话已失效）', {
      code: 'AUTH_REQUIRED',
      userAction: '运行 auth_login 完成登录后重试 reimburse_prefill',
    });
  }
  return prefillReimbursementOnPage(page, input);
}

/**
 * Field-level prefill on an already-open finance form page.
 * Exported separately so the flow can be exercised against a live page
 * (e.g. from a CDP scratch script) without going through the MCP tool.
 */
export async function prefillReimbursementOnPage(
  page: Page,
  input: ReimbursePrefillInput,
): Promise<ReimbursePrefillResult> {
  const warnings: string[] = [];
  const needsManual = ['选择支付信息', '（如需）上传行程单等非发票附件', '勾选「本人已阅读…报销承诺」', '核对后由本人点击「提交预约单」'];
  const nextSteps = ['核对发票、报销项目与摘要', '补充支付信息', '由你本人点击「提交预约单」完成提交（MCP 不会代提交/代支付）'];

  const result: ReimbursePrefillResult = {
    status: 'opened_for_manual_prefill',
    url: page.url(),
    screenshot: null,
    submitted: false,
    invoice: {
      query: input.invoiceQuery ?? null,
      selected: [],
      uploaded: [],
      listCount: null,
    },
    project: { query: input.fundingSource ?? null, selected: null, available: [] },
    description: { filled: false, value: input.description ?? null },
    total: null,
    warnings,
    needsManual,
    nextSteps,
  };

  if (input.openOnly) {
    result.total = readTotal(await bodyText(page));
    result.screenshot = await takeScreenshot(page);
    result.url = page.url();
    return result;
  }

  // --- invoice step -------------------------------------------------------
  const wantsInvoice = Boolean(input.invoiceQuery || (input.invoiceFiles?.length ?? 0) > 0);
  if (wantsInvoice) {
    const dialogOpen = await openInvoiceDialog(page);
    if (!dialogOpen) {
      warnings.push('「发票管理」对话框未打开，跳过发票选择');
    } else {
      if (input.invoiceFiles?.length) {
        result.invoice.uploaded = await uploadInvoices(page, input.invoiceFiles, warnings);
      }
      if (input.invoiceQuery) {
        const selected = await selectInvoices(
          page,
          input.invoiceQuery,
          input.selectAllMatches ?? false,
          warnings,
        );
        result.invoice.selected = selected.selected;
        result.invoice.listCount = selected.listCount;
        if (selected.selected.length > 0) {
          const text = await bodyText(page);
          result.total = readTotal(text);
          if (text.includes('暂无发票')) {
            warnings.push('发票未加入表单（保存后发票列表仍为空），请手动勾选');
            result.invoice.selected = [];
          }
        }
      } else {
        // Uploaded only: close the dialog without selecting.
        await page
          .locator('.el-dialog:visible button', { hasText: '保存' })
          .last()
          .click({ timeout: 8_000 })
          .catch(() => undefined);
        await waitInvoiceDialogClosed(page);
        if (result.invoice.uploaded.length > 0) {
          warnings.push('发票已上传但未指定 invoiceQuery，请手动勾选发票');
        } else {
          warnings.push('未指定 invoiceQuery，未选择发票（可先上传发票再重试）');
        }
      }
    }
  }

  // --- project step -------------------------------------------------------
  if (result.invoice.selected.length > 0) {
    const project = await selectProject(page, input.fundingSource, warnings);
    result.project.selected = project.selected;
    result.project.available = project.available;
  } else if (input.fundingSource) {
    warnings.push('未选中发票，「报销项目」通常不可选，已跳过项目预填');
  }

  // --- description step ---------------------------------------------------
  if (input.description && result.project.selected) {
    result.description.filled = await fillDescription(page, input.description);
    if (!result.description.filled) warnings.push('未找到「摘要」输入框，说明未填写');
  } else if (input.description) {
    warnings.push('未完成发票/项目步骤，说明未填写（避免页面状态不完整时误填）');
  }

  result.total = readTotal(await bodyText(page));
  result.url = page.url();
  result.screenshot = await takeScreenshot(page);

  if (result.invoice.selected.length > 0 && result.project.selected) {
    result.status = 'prefilled_awaiting_submit';
  } else if (result.invoice.selected.length > 0 || result.invoice.uploaded.length > 0) {
    result.status = 'partially_prefilled';
  } else {
    result.status = 'opened_for_manual_prefill';
  }
  return result;
}
