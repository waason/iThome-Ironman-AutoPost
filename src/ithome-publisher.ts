import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  chromium,
  type BrowserContext,
  type Page,
} from "playwright";

import type { AutomationMode, AutomationTarget } from "./automation.js";
import { markdownSourcesMatch } from "./markdown.js";
import { findPublishedArticleInRss } from "./rss.js";

const READ_ONLY_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const ITHOME_ORIGIN = "https://ithelp.ithome.com.tw";

export type AutomationAction =
  | "idle"
  | "create-draft"
  | "save-draft"
  | "publish";

export interface AutomationRequestPolicy {
  mode: AutomationMode;
  action: AutomationAction;
  createUrl: string;
  draftId: number | undefined;
}

export interface AutomationRequest extends AutomationRequestPolicy {
  method: string;
  requestUrl: string;
}

export interface AutomationRunOptions {
  mode: AutomationMode;
  requestedDate: string;
  storageStatePath: string;
  headless: boolean;
}

export type RssVerificationStatus = "not-applicable" | "pending" | "verified";

export interface AutomationReceipt {
  mode: AutomationMode;
  status: "saved" | "published" | "already-published";
  requestedDate: string;
  seriesKey: string;
  signupId: number;
  day: number;
  draftId: number | null;
  publicUrl: string | null;
  rssVerification: RssVerificationStatus;
  warnings: string[];
  articleSha256: string;
  completedAt: string;
  githubRunId: string | null;
  receiptPath: string;
  screenshotPath: string;
}

export interface PublishedArticleFinalizationDependencies {
  writeReceipt: (
    rssVerification: RssVerificationStatus,
    warnings: string[],
  ) => Promise<AutomationReceipt>;
  waitForRss: () => Promise<boolean>;
  reportWarning: (message: string) => void;
}

export type ExistingArticleReference =
  | { kind: "draft"; url: string }
  | { kind: "published"; url: string };

interface DraftResolution {
  kind: "draft";
  draftId: number;
}

interface PublishedResolution {
  kind: "published";
  publicUrl: string;
}

interface DraftCheckpoint {
  requestedDate: string;
  seriesKey: string;
  signupId: number;
  day: number;
  draftId: number;
  createUrl: string;
  createdAt: string;
  githubRunId: string | null;
}

interface BlockedRequest {
  method: string;
  url: string;
  reason: string;
}

interface PolicyState {
  current: AutomationRequestPolicy;
}

/**
 * 依發布順序逐一儲存或發布文章；任一系列失敗時立即停止後續系列。
 */
export async function runAutomationWithPlaywright(
  targets: AutomationTarget[],
  options: AutomationRunOptions,
): Promise<AutomationReceipt[]> {
  const browser = await chromium.launch({ headless: options.headless });
  const context = await browser.newContext({
    storageState: options.storageStatePath,
    viewport: { width: 1440, height: 1000 },
  });
  const policyState: PolicyState = {
    current: {
      mode: options.mode,
      action: "idle",
      createUrl: "https://ithelp.ithome.com.tw/invalid-create-url",
      draftId: undefined,
    },
  };
  const blockedRequests: BlockedRequest[] = [];

  await installAutomationNetworkGuard(context, policyState, blockedRequests);

  try {
    const receipts: AutomationReceipt[] = [];

    for (const target of targets) {
      policyState.current = {
        mode: options.mode,
        action: "idle",
        createUrl: target.createUrl,
        draftId: target.knownDraftId,
      };
      const blockedCountBeforeTarget = blockedRequests.length;
      const existingPublication = await fetchPublishedArticle(target);
      const page = await context.newPage();
      try {
        if (existingPublication !== undefined) {
          await gotoAndAssertOk(
            page,
            existingPublication.url,
            target.seriesKey,
          );
          await verifyPublicArticle(
            page,
            target,
            existingPublication.url,
            existingPublication.title,
          );
          assertNoBlockedProtectedMutations(
            blockedRequests.slice(blockedCountBeforeTarget),
          );
          await captureSuccessScreenshot(page, target);

          const receipt = await createAndWriteReceipt(target, options, {
            status: "already-published",
            draftId: readArticleId(existingPublication.url),
            publicUrl: existingPublication.url,
            rssVerification: "verified",
            warnings: [],
          });
          receipts.push(receipt);
          continue;
        }

        const resolution = await resolveArticle(page, target, policyState);
        if (resolution.kind === "published") {
          if (page.url() !== resolution.publicUrl) {
            await gotoAndAssertOk(page, resolution.publicUrl, target.seriesKey);
          }
          await verifyPublicArticle(page, target, resolution.publicUrl);
          assertNoBlockedProtectedMutations(
            blockedRequests.slice(blockedCountBeforeTarget),
          );
          await captureSuccessScreenshot(page, target);

          const warning =
            `${target.seriesKey} 已由個人文章列表確認公開，但系列 RSS 尚未同步`;
          console.warn(`::warning title=iThome RSS 延遲::${warning}`);
          const receipt = await createAndWriteReceipt(target, options, {
            status: "already-published",
            draftId: readArticleId(resolution.publicUrl),
            publicUrl: resolution.publicUrl,
            rssVerification: "pending",
            warnings: [warning],
          });
          receipts.push(receipt);
          continue;
        }

        const { draftId } = resolution;
        policyState.current.draftId = draftId;
        await writeDraftCheckpoint(target, options, draftId);
        await assertDraftIdentity(page, target, draftId);
        await fillDraftFields(page, target);
        await saveDraft(page, target, draftId, policyState);
        await reopenAndVerifySavedDraft(page, target, draftId, policyState);

        if (options.mode === "publish") {
          const publicUrl = await publishDraft(page, target, draftId, policyState);
          await verifyPublicArticle(page, target, publicUrl);

          assertNoBlockedProtectedMutations(
            blockedRequests.slice(blockedCountBeforeTarget),
          );
          await captureSuccessScreenshot(page, target);

          const warning =
            `${target.seriesKey} 已公開，但 60 秒內未能從系列 RSS 驗證文章`;
          const receipt = await finalizePublishedArticle(warning, {
            writeReceipt: (rssVerification, warnings) =>
              createAndWriteReceipt(target, options, {
                status: "published",
                draftId,
                publicUrl,
                rssVerification,
                warnings,
              }),
            waitForRss: () => waitForRssPublication(target, publicUrl),
            reportWarning: (message) => {
              console.warn(`::warning title=iThome RSS 延遲::${message}`);
            },
          });
          receipts.push(receipt);
          continue;
        }

        assertNoBlockedProtectedMutations(
          blockedRequests.slice(blockedCountBeforeTarget),
        );
        await captureSuccessScreenshot(page, target);

        const receipt = await createAndWriteReceipt(target, options, {
          status: "saved",
          draftId,
          publicUrl: null,
          rssVerification: "not-applicable",
          warnings: [],
        });
        receipts.push(receipt);
      } catch (error) {
        await captureFailureScreenshot(page, target);
        throw error;
      } finally {
        policyState.current.action = "idle";
        await page.close({ runBeforeUnload: false });
      }
    }

    return receipts;
  } finally {
    await context.close();
    await browser.close();
  }
}

/**
 * 僅放行當前系列、當前草稿與當前動作需要的請求。
 */
export function assertAutomationRequestAllowed(
  request: AutomationRequest,
): void {
  const method = request.method.toUpperCase();
  const url = new URL(request.requestUrl);
  const createUrl = new URL(request.createUrl);
  const isCreateEndpoint =
    url.origin === ITHOME_ORIGIN &&
    /^\/\d{4}ironman\/create\/\d+$/u.test(url.pathname);

  if (isCreateEndpoint) {
    if (request.action !== "create-draft") {
      throw new Error("尚未授權建立草稿");
    }

    if (method !== "GET" || url.href !== createUrl.href) {
      throw new Error("建立草稿網址不在白名單");
    }

    return;
  }

  if (READ_ONLY_HTTP_METHODS.has(method)) {
    return;
  }

  const draftId = request.draftId;
  const expectedUrl = draftId === undefined
    ? undefined
    : request.action === "save-draft"
      ? `${ITHOME_ORIGIN}/articles/${draftId}/draft`
      : request.action === "publish" && request.mode === "publish"
        ? `${ITHOME_ORIGIN}/articles/${draftId}/publish`
        : undefined;

  if (
    method !== "POST" ||
    expectedUrl === undefined ||
    url.href !== expectedUrl
  ) {
    throw new Error("寫入請求不在目前動作白名單");
  }
}

/**
 * 分辨會改變 iThome 文章或鐵人賽草稿狀態的端點。
 */
export function isProtectedIthomeMutation(
  method: string,
  requestUrl: string,
): boolean {
  const url = new URL(requestUrl);
  if (url.origin !== ITHOME_ORIGIN) {
    return false;
  }

  if (/^\/\d{4}ironman\/create\/\d+$/u.test(url.pathname)) {
    return method.toUpperCase() === "GET";
  }

  return (
    !READ_ONLY_HTTP_METHODS.has(method.toUpperCase()) &&
    /^\/articles\/\d+\/(?:draft|publish)$/u.test(url.pathname)
  );
}

async function installAutomationNetworkGuard(
  context: BrowserContext,
  policyState: PolicyState,
  blockedRequests: BlockedRequest[],
): Promise<void> {
  await context.route("**/*", async (route) => {
    const request = route.request();
    try {
      assertAutomationRequestAllowed({
        ...policyState.current,
        method: request.method(),
        requestUrl: request.url(),
      });
      await route.continue();
    } catch (error) {
      blockedRequests.push({
        method: request.method(),
        url: request.url(),
        reason: toErrorMessage(error),
      });
      await route.abort("blockedbyclient");
    }
  });
}

async function resolveArticle(
  page: Page,
  target: AutomationTarget,
  policyState: PolicyState,
): Promise<DraftResolution | PublishedResolution> {
  await gotoAndAssertOk(page, target.userArticlesUrl, target.seriesKey);
  const existingArticle = await findExistingArticleReference(
    page,
    target,
    target.knownDraftId === undefined,
  );
  if (existingArticle?.kind === "published") {
    return {
      kind: "published",
      publicUrl: existingArticle.url,
    };
  }
  if (existingArticle?.kind === "draft") {
    if (page.url() !== existingArticle.url) {
      await gotoAndAssertOk(page, existingArticle.url, target.seriesKey);
    }
    return { kind: "draft", draftId: readDraftId(page.url()) };
  }

  if (target.knownDraftId !== undefined) {
    await gotoAndAssertOk(page, target.entryUrl, target.seriesKey);
    return { kind: "draft", draftId: target.knownDraftId };
  }

  policyState.current.action = "create-draft";
  try {
    await gotoAndAssertOk(page, target.createUrl, target.seriesKey);
  } finally {
    policyState.current.action = "idle";
  }

  return { kind: "draft", draftId: readDraftId(page.url()) };
}

async function findExistingArticleReference(
  page: Page,
  target: AutomationTarget,
  includeBlankDrafts: boolean,
): Promise<ExistingArticleReference | undefined> {
  const links = page.getByRole("link", {
    name: target.articleTitle,
    exact: true,
  });
  const count = await links.count();
  const matchingUrls: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const href = (await links.nth(index).getAttribute("href"))?.trim();
    if (href !== undefined) {
      matchingUrls.push(href);
    }
  }

  const exactReference = selectExistingArticleReference(
    matchingUrls,
    target.seriesKey,
  );
  if (exactReference !== undefined || !includeBlankDrafts) {
    return exactReference;
  }

  const blankDraftLinks = page.getByRole("link", {
    name: "(沒有標題)",
    exact: true,
  });
  const blankDraftUrls: string[] = [];
  const blankDraftCount = await blankDraftLinks.count();
  for (let index = 0; index < blankDraftCount; index += 1) {
    const href = (await blankDraftLinks.nth(index).getAttribute("href"))?.trim();
    if (href === undefined) {
      continue;
    }

    const url = new URL(href, ITHOME_ORIGIN);
    if (/^\/articles\/\d+\/draft$/u.test(url.pathname)) {
      blankDraftUrls.push(url.href);
    }
  }

  const matchingBlankDraftUrls: string[] = [];
  for (const draftUrl of [...new Set(blankDraftUrls)]) {
    await gotoAndAssertOk(page, draftUrl, target.seriesKey);
    if (await isDraftPageForTarget(page, target)) {
      matchingBlankDraftUrls.push(draftUrl);
    }
  }

  if (matchingBlankDraftUrls.length > 1) {
    throw new Error(
      `${target.seriesKey} 有多個符合系列與 Day 的空白草稿，已停止自動選擇`,
    );
  }

  const matchingBlankDraftUrl = matchingBlankDraftUrls[0];
  return matchingBlankDraftUrl === undefined
    ? undefined
    : { kind: "draft", url: matchingBlankDraftUrl };
}

/**
 * 從個人文章列表的同標題連結辨識既有公開文或草稿；公開文優先，避免補償排程重複發布。
 */
export function selectExistingArticleReference(
  hrefs: string[],
  seriesKey: string,
): ExistingArticleReference | undefined {
  const matchingDraftUrls = new Set<string>();
  const matchingPublicUrls = new Set<string>();

  for (const href of hrefs) {
    const url = new URL(href, ITHOME_ORIGIN);
    if (url.origin !== ITHOME_ORIGIN) {
      continue;
    }
    if (/^\/articles\/\d+\/draft$/u.test(url.pathname)) {
      matchingDraftUrls.add(url.href);
    }
    if (/^\/articles\/\d+$/u.test(url.pathname)) {
      matchingPublicUrls.add(url.href);
    }
  }

  if (matchingPublicUrls.size > 1) {
    throw new Error(`${seriesKey} 有多個同標題公開文章，已停止自動選擇`);
  }
  const matchingPublicUrl = [...matchingPublicUrls][0];
  if (matchingPublicUrl !== undefined) {
    return { kind: "published", url: matchingPublicUrl };
  }

  if (matchingDraftUrls.size > 1) {
    throw new Error(`${seriesKey} 有多個同標題草稿，已停止自動選擇`);
  }
  const matchingDraftUrl = [...matchingDraftUrls][0];
  return matchingDraftUrl === undefined
    ? undefined
    : { kind: "draft", url: matchingDraftUrl };
}

async function gotoAndAssertOk(
  page: Page,
  url: string,
  seriesKey: string,
): Promise<void> {
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  if (
    response === null ||
    response.status() < 200 ||
    response.status() >= 400
  ) {
    throw new Error(
      `無法開啟 ${seriesKey} 頁面：HTTP ${response?.status() ?? "未知"}`,
    );
  }
}

async function assertDraftIdentity(
  page: Page,
  target: AutomationTarget,
  draftId: number,
): Promise<void> {
  const expectedUrl = `${ITHOME_ORIGIN}/articles/${draftId}/draft`;
  if (page.url() !== expectedUrl) {
    throw new Error(`草稿網址不符：預期 ${expectedUrl}，實際 ${page.url()}`);
  }

  await assertExactTextVisible(page, target.category, "系列分類");
  await assertExactTextVisible(page, target.expectedSeriesTitle, "系列題目");
  if (!(await isChallengeDayVisible(page, target.day))) {
    throw new Error(`${target.seriesKey} 草稿挑戰日不符：Day ${target.day}`);
  }

  const draftForm = page.locator(`form[action="${expectedUrl}"]`);
  const publishButton = page.locator(
    `button[formaction="${ITHOME_ORIGIN}/articles/${draftId}/publish"]`,
  );
  if ((await draftForm.count()) !== 1 || (await publishButton.count()) !== 1) {
    throw new Error("iThome 草稿表單端點不符，頁面結構可能已變更");
  }
}

async function fillDraftFields(
  page: Page,
  target: AutomationTarget,
): Promise<void> {
  const titleInput = page.locator('input[name="subject"]');
  const codeMirrorRoot = page.locator(".CodeMirror");
  if ((await titleInput.count()) !== 1 || (await codeMirrorRoot.count()) !== 1) {
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
}

async function saveDraft(
  page: Page,
  target: AutomationTarget,
  draftId: number,
  policyState: PolicyState,
): Promise<void> {
  const saveUrl = `${ITHOME_ORIGIN}/articles/${draftId}/draft`;
  const saveButton = page.getByRole("button", {
    name: "儲存草稿",
    exact: true,
  });
  if ((await saveButton.count()) !== 1) {
    throw new Error("找不到唯一的儲存草稿按鈕");
  }

  policyState.current.action = "save-draft";
  try {
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url() === saveUrl && response.request().method() === "POST",
      { timeout: 30_000 },
    );
    await saveButton.click();
    const response = await responsePromise;
    assertWriteResponseSucceeded(response.status(), "儲存草稿", target.seriesKey);
    const responseError = await response.finished();
    if (responseError !== null) {
      throw responseError;
    }
  } finally {
    policyState.current.action = "idle";
  }
}

async function reopenAndVerifySavedDraft(
  page: Page,
  target: AutomationTarget,
  draftId: number,
  policyState: PolicyState,
): Promise<void> {
  const draftUrl = `${ITHOME_ORIGIN}/articles/${draftId}/draft`;
  await gotoAndAssertOk(page, draftUrl, target.seriesKey);
  policyState.current.draftId = draftId;
  await assertDraftIdentity(page, target, draftId);

  const title = await page.locator('input[name="subject"]').inputValue();
  const body = await readCodeMirrorValue(page);
  if (title !== target.articleTitle || !markdownSourcesMatch(body, target.articleBody)) {
    throw new Error(`${target.seriesKey} 儲存後重新讀回的標題或本文不一致`);
  }
}

async function publishDraft(
  page: Page,
  target: AutomationTarget,
  draftId: number,
  policyState: PolicyState,
): Promise<string> {
  const publishUrl = `${ITHOME_ORIGIN}/articles/${draftId}/publish`;
  const publicUrl = `${ITHOME_ORIGIN}/articles/${draftId}`;
  const publishButton = page.locator(`button[formaction="${publishUrl}"]`);
  if ((await publishButton.count()) !== 1) {
    throw new Error("找不到唯一的發表文章按鈕");
  }

  if (!(await publishButton.isVisible())) {
    const toggle = page.locator(".save-group__dropdown-toggle");
    if ((await toggle.count()) !== 1) {
      throw new Error("找不到發布選單按鈕");
    }
    await toggle.click();
    await publishButton.waitFor({ state: "visible", timeout: 5_000 });
  }

  policyState.current.action = "publish";
  try {
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url() === publishUrl && response.request().method() === "POST",
      { timeout: 30_000 },
    );
    const navigationPromise = page.waitForURL(publicUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await publishButton.click();
    const response = await responsePromise;
    assertWriteResponseSucceeded(response.status(), "正式發布", target.seriesKey);
    await navigationPromise;
  } finally {
    policyState.current.action = "idle";
  }

  return publicUrl;
}

async function verifyPublicArticle(
  page: Page,
  target: AutomationTarget,
  publicUrl: string,
  expectedPublicTitle = target.articleTitle,
): Promise<void> {
  if (page.url() !== publicUrl) {
    throw new Error(`正式發布後網址不符：預期 ${publicUrl}，實際 ${page.url()}`);
  }
  await assertExactTextVisible(page, expectedPublicTitle, "公開文章標題");

  const seriesLinks = page.locator(`a[href="${target.publicSeriesUrl}"]`);
  if ((await seriesLinks.count()) < 1) {
    throw new Error(`${target.seriesKey} 公開文章沒有連回正式系列`);
  }
}

async function fetchPublishedArticle(
  target: AutomationTarget,
): Promise<ReturnType<typeof findPublishedArticleInRss>> {
  const response = await fetch(target.rssUrl, {
    method: "GET",
    headers: {
      Accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8",
      "User-Agent":
        "Mozilla/5.0 (compatible; iThomePublicationVerifier/1.0; +https://github.com/eric861129/iThome-Ironman-AutoPost)",
    },
  });
  if (!response.ok) {
    throw new Error(`${target.seriesKey} RSS 讀取失敗：HTTP ${response.status}`);
  }

  return findPublishedArticleInRss(await response.text(), target.articleTitle);
}

async function waitForRssPublication(
  target: AutomationTarget,
  expectedPublicUrl: string,
): Promise<boolean> {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const evidence = await fetchPublishedArticle(target);
      if (evidence?.url === expectedPublicUrl) {
        return true;
      }
    } catch {
      // 公開頁已驗證成功；RSS 的暫時性錯誤交由最終警告回執記錄。
    }
    if (attempt < 12) {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }

  return false;
}

/**
 * 公開頁驗證成功後先保留發布回執，再將 RSS 的最終一致性結果補回同一份回執。
 */
export async function finalizePublishedArticle(
  warningMessage: string,
  dependencies: PublishedArticleFinalizationDependencies,
): Promise<AutomationReceipt> {
  await dependencies.writeReceipt("pending", []);

  if (await dependencies.waitForRss()) {
    return dependencies.writeReceipt("verified", []);
  }

  dependencies.reportWarning(warningMessage);
  return dependencies.writeReceipt("pending", [warningMessage]);
}

async function createAndWriteReceipt(
  target: AutomationTarget,
  options: AutomationRunOptions,
  result: Pick<
    AutomationReceipt,
    | "status"
    | "draftId"
    | "publicUrl"
    | "rssVerification"
    | "warnings"
  >,
): Promise<AutomationReceipt> {
  const receiptPath = path.resolve(target.receiptPath);
  const receipt: AutomationReceipt = {
    mode: options.mode,
    status: result.status,
    requestedDate: options.requestedDate,
    seriesKey: target.seriesKey,
    signupId: target.signupId,
    day: target.day,
    draftId: result.draftId,
    publicUrl: result.publicUrl,
    rssVerification: result.rssVerification,
    warnings: result.warnings,
    articleSha256: createArticleSha256(target.articleTitle, target.articleBody),
    completedAt: new Date().toISOString(),
    githubRunId: process.env.GITHUB_RUN_ID ?? null,
    receiptPath,
    screenshotPath: path.resolve(target.screenshotPath),
  };

  await mkdir(path.dirname(receiptPath), { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, undefined, 2)}\n`, "utf8");
  return receipt;
}

async function writeDraftCheckpoint(
  target: AutomationTarget,
  options: AutomationRunOptions,
  draftId: number,
): Promise<void> {
  const checkpointPath = path.resolve(
    target.receiptPath.replace(/\.json$/u, "-checkpoint.json"),
  );
  const checkpoint: DraftCheckpoint = {
    requestedDate: options.requestedDate,
    seriesKey: target.seriesKey,
    signupId: target.signupId,
    day: target.day,
    draftId,
    createUrl: target.createUrl,
    createdAt: new Date().toISOString(),
    githubRunId: process.env.GITHUB_RUN_ID ?? null,
  };

  await mkdir(path.dirname(checkpointPath), { recursive: true });
  await writeFile(
    checkpointPath,
    `${JSON.stringify(checkpoint, undefined, 2)}\n`,
    "utf8",
  );
}

export function createArticleSha256(title: string, body: string): string {
  return createHash("sha256")
    .update(title)
    .update("\0")
    .update(body.replace(/\r\n/gu, "\n").trim())
    .digest("hex");
}

function readDraftId(draftUrl: string): number {
  const match = /^https:\/\/ithelp\.ithome\.com\.tw\/articles\/(\d+)\/draft$/u
    .exec(draftUrl);
  if (match?.[1] === undefined) {
    throw new Error(`建立後沒有進入合法草稿網址：${draftUrl}`);
  }
  return Number(match[1]);
}

function readArticleId(publicUrl: string): number {
  const match = /^https:\/\/ithelp\.ithome\.com\.tw\/articles\/(\d+)$/u
    .exec(publicUrl);
  if (match?.[1] === undefined) {
    throw new Error(`RSS 文章網址格式不符：${publicUrl}`);
  }
  return Number(match[1]);
}

async function readCodeMirrorValue(page: Page): Promise<string> {
  const value = await page.locator(".CodeMirror").evaluate((element) => {
    const host = element as HTMLElement & {
      CodeMirror?: { getValue(): string };
    };
    return host.CodeMirror?.getValue() ?? null;
  });
  if (value === null) {
    throw new Error("找不到 CodeMirror 編輯器實例");
  }
  return value;
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

async function isDraftPageForTarget(
  page: Page,
  target: AutomationTarget,
): Promise<boolean> {
  return (
    /^https:\/\/ithelp\.ithome\.com\.tw\/articles\/\d+\/draft$/u.test(
      page.url(),
    ) &&
    await isExactTextVisible(page, target.category) &&
    await isExactTextVisible(page, target.expectedSeriesTitle) &&
    await isChallengeDayVisible(page, target.day)
  );
}

async function isExactTextVisible(page: Page, text: string): Promise<boolean> {
  const locator = page.getByText(text, { exact: true });
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    if (await locator.nth(index).isVisible()) {
      return true;
    }
  }
  return false;
}

async function isChallengeDayVisible(page: Page, day: number): Promise<boolean> {
  const locator = page.getByText(
    new RegExp(`今天挑戰第\\s*${day}\\s*天`, "u"),
  );
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    if (await locator.nth(index).isVisible()) {
      return true;
    }
  }
  return false;
}

function assertWriteResponseSucceeded(
  status: number,
  action: string,
  seriesKey: string,
): void {
  if (status < 200 || status >= 400) {
    throw new Error(`${seriesKey} ${action}失敗：HTTP ${status}`);
  }
}

function assertNoBlockedProtectedMutations(
  blockedRequests: BlockedRequest[],
): void {
  const protectedRequests = blockedRequests.filter((request) =>
    isProtectedIthomeMutation(request.method, request.url),
  );
  if (protectedRequests.length > 0) {
    throw new Error(
      `偵測到未授權的 iThome 文章異動：${protectedRequests
        .map((request) => `${request.method} ${request.url} (${request.reason})`)
        .join("、")}`,
    );
  }
}

async function captureFailureScreenshot(
  page: Page,
  target: AutomationTarget,
): Promise<void> {
  try {
    const failurePath = path.resolve(
      target.screenshotPath.replace(/\.png$/u, "-failed.png"),
    );
    await mkdir(path.dirname(failurePath), { recursive: true });
    await page.screenshot({ path: failurePath, fullPage: true });
  } catch {
    // 原始錯誤優先；截圖失敗不能覆蓋真正的儲存或發布錯誤。
  }
}

async function captureSuccessScreenshot(
  page: Page,
  target: AutomationTarget,
): Promise<void> {
  const screenshotPath = path.resolve(target.screenshotPath);
  await mkdir(path.dirname(screenshotPath), { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: true });
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
