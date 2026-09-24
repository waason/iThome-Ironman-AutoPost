import { mkdir } from "node:fs/promises";
import path from "node:path";

import { chromium, type BrowserContext, type Page } from "playwright";

import type { PreviewTarget } from "./preview.js";
import { markdownSourcesMatch } from "./markdown.js";

export { markdownSourcesMatch } from "./markdown.js";

const READ_ONLY_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export interface PreviewRunOptions {
  storageStatePath: string;
  headless: boolean;
}

export interface PreviewArtifact {
  seriesKey: string;
  draftId: number;
  screenshotPath: string;
}

interface BlockedRequest {
  method: string;
  url: string;
}

/**
 * 保證預覽模式不會送出可能改變 iThome 狀態的 HTTP 請求。
 */
export function assertPreviewRequestIsReadOnly(method: string): void {
  const normalizedMethod = method.toUpperCase();
  if (!READ_ONLY_HTTP_METHODS.has(normalizedMethod)) {
    throw new Error(`預覽模式封鎖 ${normalizedMethod} 請求`);
  }
}

/**
 * 辨識是否有人嘗試對目前草稿送出寫入請求。
 */
export function isDraftMutationRequest(
  method: string,
  requestUrl: string,
  draftId: number,
): boolean {
  if (READ_ONLY_HTTP_METHODS.has(method.toUpperCase())) {
    return false;
  }

  const url = new URL(requestUrl);
  return (
    url.origin === "https://ithelp.ithome.com.tw" &&
    url.pathname === `/articles/${draftId}/draft`
  );
}

/**
 * 將文章填入既有草稿頁並截圖。頁面關閉時直接丟棄未儲存內容。
 */
export async function runPreviewWithPlaywright(
  targets: PreviewTarget[],
  options: PreviewRunOptions,
): Promise<PreviewArtifact[]> {
  const browser = await chromium.launch({ headless: options.headless });
  const context = await browser.newContext({
    storageState: options.storageStatePath,
    viewport: { width: 1440, height: 1000 },
  });
  const blockedRequests: BlockedRequest[] = [];

  await installReadOnlyNetworkGuard(context, blockedRequests);

  try {
    const artifacts: PreviewArtifact[] = [];

    for (const target of targets) {
      const page = await context.newPage();
      const blockedCountBeforePage = blockedRequests.length;

      try {
        const response = await page.goto(target.draftUrl, {
          waitUntil: "domcontentloaded",
        });

        if (response === null || !response.ok()) {
          throw new Error(
            `無法開啟 ${target.seriesKey} 草稿頁：HTTP ${response?.status() ?? "未知"}`,
          );
        }

        await assertDraftIdentity(page, target);
        await fillPreviewFields(page, target);
        await page.waitForTimeout(1_000);

        const draftMutationRequests = blockedRequests
          .slice(blockedCountBeforePage)
          .filter((request) =>
            isDraftMutationRequest(request.method, request.url, target.draftId),
          );
        if (draftMutationRequests.length > 0) {
          throw new Error(
            `預覽期間偵測到草稿寫入請求：${draftMutationRequests
              .map((request) => `${request.method} ${request.url}`)
              .join("、")}`,
          );
        }

        const screenshotPath = path.resolve(target.screenshotPath);
        await mkdir(path.dirname(screenshotPath), { recursive: true });
        await page.screenshot({ path: screenshotPath, fullPage: true });

        artifacts.push({
          seriesKey: target.seriesKey,
          draftId: target.draftId,
          screenshotPath,
        });
      } finally {
        await page.close({ runBeforeUnload: false });
      }
    }

    return artifacts;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function installReadOnlyNetworkGuard(
  context: BrowserContext,
  blockedRequests: BlockedRequest[],
): Promise<void> {
  await context.route("**/*", async (route) => {
    const request = route.request();

    try {
      assertPreviewRequestIsReadOnly(request.method());
      await route.continue();
    } catch {
      blockedRequests.push({
        method: request.method(),
        url: request.url(),
      });
      await route.abort("blockedbyclient");
    }
  });
}

async function assertDraftIdentity(
  page: Page,
  target: PreviewTarget,
): Promise<void> {
  if (page.url() !== target.draftUrl) {
    throw new Error(
      `草稿網址不符：預期 ${target.draftUrl}，實際 ${page.url()}`,
    );
  }

  await assertExactTextVisible(page, target.category, "系列分類");
  await assertExactTextVisible(
    page,
    target.expectedSeriesTitle,
    "系列題目",
  );

  const saveButton = page.getByRole("button", {
    name: "儲存草稿",
    exact: true,
  });
  const publishButton = page.getByRole("button", {
    name: "發表文章",
    exact: true,
  });

  if ((await saveButton.count()) !== 1 || (await publishButton.count()) !== 1) {
    throw new Error("找不到 iThome 草稿操作按鈕，頁面結構可能已變更");
  }
}

async function fillPreviewFields(
  page: Page,
  target: PreviewTarget,
): Promise<void> {
  const titleInput = page.locator('input[name="subject"]');
  const markdownEditor = page.locator(".CodeMirror textarea");
  const codeMirrorRoot = page.locator(".CodeMirror");

  if (
    (await titleInput.count()) !== 1 ||
    (await markdownEditor.count()) !== 1 ||
    (await codeMirrorRoot.count()) !== 1
  ) {
    throw new Error("iThome 標題或 Markdown 編輯器欄位數量不符");
  }

  await titleInput.fill(target.articleTitle);
  const editorBody = await codeMirrorRoot.evaluate(
    (element, articleBody) => {
      const host = element as HTMLElement & {
        CodeMirror?: {
          getValue(): string;
          setValue(value: string): void;
        };
      };

      if (host.CodeMirror === undefined) {
        return null;
      }

      host.CodeMirror.setValue(articleBody);
      return host.CodeMirror.getValue();
    },
    target.articleBody,
  );

  if ((await titleInput.inputValue()) !== target.articleTitle) {
    throw new Error(`${target.seriesKey} 標題填入後讀回不一致`);
  }

  if (editorBody === null) {
    throw new Error(`${target.seriesKey} 找不到 CodeMirror 編輯器實例`);
  }

  if (!markdownSourcesMatch(editorBody, target.articleBody)) {
    throw new Error(`${target.seriesKey} 本文填入後讀回不一致`);
  }

  await titleInput.click();
}

async function assertExactTextVisible(
  page: Page,
  text: string,
  label: string,
): Promise<void> {
  const locator = page.getByText(text, { exact: true });
  const count = await locator.count();

  for (let index = 0; index < count; index += 1) {
    if (await locator.nth(index).isVisible()) {
      return;
    }
  }

  throw new Error(`${label}不符或不可見：${text}`);
}
