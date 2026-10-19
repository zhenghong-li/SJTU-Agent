import fs from 'node:fs';
import path from 'node:path';
import { broker } from '../browser/broker.js';
import { openInner } from '../browser/zirc.js';
import { loadConfig } from '../core/config.js';
import { SourceError } from '../core/tool.js';

const PROJECT_INDEX = '/Projectsmy/indexmy/';
const DETAIL_TAG_RE = /\/Projects\/detail\/tag\/([A-Za-z0-9]+)/;

export interface ZircProjectRef {
  tag: string;
  projectCode: string;
  rowText: string;
}

export async function resolveProject(
  projectCode = 'ZIRC2026-08',
): Promise<ZircProjectRef> {
  const { frame } = await openInner(PROJECT_INDEX);
  await frame.waitForTimeout(4000);
  const info = await frame.evaluate((code) => {
    const row = [...document.querySelectorAll('tr')].find((candidate) =>
      (candidate.textContent ?? '').includes(code),
    );
    if (!row) return null;
    const clickable = [...row.querySelectorAll('button, a, [onclick]')]
      .map((el) => el.getAttribute('onclick') ?? el.getAttribute('href') ?? '')
      .find((value) => value.includes('/Projects/detail/tag/'));
    return {
      open: clickable ?? '',
      rowText: (row.textContent ?? '').replace(/\s+/g, ' ').slice(0, 200),
    };
  }, projectCode);
  if (!info) {
    throw new SourceError(`在「我的项目」中找不到项目 ${projectCode}`, {
      code: 'NOT_FOUND',
      hint: '确认项目编号或先在 ZIRC 系统查看项目列表',
    });
  }
  const match = info.open.match(DETAIL_TAG_RE);
  if (!match) {
    throw new SourceError('未能从项目行解析详情 tag', {
      code: 'SOURCE_CHANGED',
      hint: 'ZIRC 项目列表按钮结构可能已改版',
    });
  }
  return { tag: match[1], projectCode, rowText: info.rowText };
}

export interface ZircExpenseInput {
  projectCode?: string;
  projectTag?: string;
  type: string;
  amount: number;
  description: string;
  invoiceNo?: string;
}

export interface ZircExpenseResult {
  status: 'prefilled_awaiting_submit';
  projectTag: string;
  fields: {
    type: string;
    amount: string;
    description: string;
    invoiceNo: string;
  };
  budgetText: string;
  screenshotPath: string;
  submitted: false;
  note: string;
}

/** Fill the ZIRC 「新增经费发生」 dialog and stop before 「提交审批」. */
export async function prefillExpense(
  input: ZircExpenseInput,
): Promise<ZircExpenseResult> {
  const tag = input.projectTag ?? (await resolveProject(input.projectCode)).tag;
  const { page, frame } = await openInner(`/Projects/editjf/tag/${tag}`);
  await frame.waitForTimeout(2500);

  try {
    await frame.waitForSelector('select[name="name"]', { timeout: 10_000 });
  } catch {
    throw new SourceError('「新增经费发生」表单未打开（可能被弹窗拦截或页面改版）', {
      code: 'SOURCE_CHANGED',
      hint: '可用浏览器手动确认表单入口',
    });
  }

  try {
    await frame.selectOption('select[name="name"]', { value: input.type });
  } catch {
    await frame.selectOption('select[name="name"]', { label: input.type });
  }
  await frame.fill('input[name="je"]', String(input.amount));
  await frame.fill('textarea[name="comment"]', input.description);
  if (input.invoiceNo) {
    await frame.fill('input[name="fph"]', input.invoiceNo);
  }

  const budgetText = await frame.evaluate(() => {
    const dialog = document.querySelector('.modal-content, .layui-layer, body');
    return (dialog?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .match(/当前剩余预算[^。]{0,160}/)?.[0] ?? '';
  });

  const dir = path.join(loadConfig().dataDir, 'artifacts', 'zirc');
  fs.mkdirSync(dir, { recursive: true });
  const screenshotPath = path.join(dir, `zirc-expense-prefill-${new Date().toISOString().replace(/[:.]/g, '-')}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);

  return {
    status: 'prefilled_awaiting_submit',
    projectTag: tag,
    fields: {
      type: input.type,
      amount: String(input.amount),
      description: input.description,
      invoiceNo: input.invoiceNo ?? '',
    },
    budgetText,
    screenshotPath,
    submitted: false,
    note: '已填好 ZIRC「新增经费发生」表单，停在「提交审批」前；请本人核对后点击提交，MCP 不会提交。',
  };
}
