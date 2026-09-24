import { readFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

export interface CampaignConfig {
  id: string;
  templateMode: boolean;
  authorId: number;
  startDate: string;
  totalDays: number;
  timeZone: string;
  publishTime: string;
  cron: string;
  createUrlTemplate: string;
}

export interface SeriesConfig {
  key: string;
  displayName: string;
  signupId: number;
  category: string;
  expectedTitle: string;
  articleRoot: string;
  totalDays: number;
  day1DraftId: number;
  ready: boolean;
  publishOrder: number;
}

export interface PublisherConfig {
  campaign: CampaignConfig;
  blockedSignupIds: number[];
  series: SeriesConfig[];
}

/**
 * 載入並驗證發布白名單。文章路徑會轉成跨平台可使用的絕對路徑。
 */
export async function loadPublisherConfig(
  configPath: string,
): Promise<PublisherConfig> {
  const raw = parse(await readFile(configPath, "utf8")) as unknown;
  const root = readRecord(raw, "設定根節點");
  const campaign = readCampaign(root.campaign);
  const blockedSignupIds = readPositiveIntegerArray(
    root.blockedSignupIds,
    "blockedSignupIds",
  );
  const rawSeries = readArray(root.series, "series");
  const projectRoot = path.dirname(path.dirname(path.resolve(configPath)));
  const series = rawSeries.map((entry, index) =>
    readSeries(entry, index, projectRoot),
  );

  assertUnique(blockedSignupIds, "封鎖系列 ID");
  assertUnique(
    series.map((item) => item.key),
    "系列 key",
  );
  assertUnique(
    series.map((item) => item.signupId),
    "正式系列 ID",
  );
  assertUnique(
    series.map((item) => item.expectedTitle),
    "系列題目",
  );
  assertUnique(
    series.map((item) => item.day1DraftId),
    "Day 1 草稿 ID",
  );

  for (const item of series) {
    if (blockedSignupIds.includes(item.signupId)) {
      throw new Error(`正式系列 ID 不可出現在封鎖清單：${item.signupId}`);
    }
  }

  const longestSeriesDays = Math.max(...series.map((item) => item.totalDays));
  if (campaign.totalDays !== longestSeriesDays) {
    throw new Error(
      `campaign.totalDays 必須等於最長系列天數：${longestSeriesDays}`,
    );
  }

  return {
    campaign,
    blockedSignupIds,
    series: [...series].sort((left, right) => left.publishOrder - right.publishOrder),
  };
}

function readCampaign(value: unknown): CampaignConfig {
  const campaign = readRecord(value, "campaign");
  const startDate = readString(campaign.startDate, "campaign.startDate");
  const publishTime = readString(campaign.publishTime, "campaign.publishTime");
  const createUrlTemplate = readString(
    campaign.createUrlTemplate,
    "campaign.createUrlTemplate",
  );

  if (!/^\d{4}-\d{2}-\d{2}$/u.test(startDate)) {
    throw new Error("campaign.startDate 必須是 YYYY-MM-DD");
  }

  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(publishTime)) {
    throw new Error("campaign.publishTime 必須是 HH:mm");
  }

  assertCreateUrlTemplate(createUrlTemplate);

  return {
    id: readString(campaign.id, "campaign.id"),
    templateMode: readBoolean(
      campaign.templateMode,
      "campaign.templateMode",
    ),
    authorId: readPositiveInteger(campaign.authorId, "campaign.authorId"),
    startDate,
    totalDays: readPositiveInteger(campaign.totalDays, "campaign.totalDays"),
    timeZone: readString(campaign.timeZone, "campaign.timeZone"),
    publishTime,
    cron: readString(campaign.cron, "campaign.cron"),
    createUrlTemplate,
  };
}

function assertCreateUrlTemplate(value: string): void {
  if ((value.match(/\{signupId\}/gu) ?? []).length !== 1) {
    throw new Error(
      "campaign.createUrlTemplate 必須且只能包含一個 {signupId}",
    );
  }

  const sampleUrl = new URL(value.replace("{signupId}", "1"));
  if (
    sampleUrl.origin !== "https://ithelp.ithome.com.tw" ||
    !/^\/\d{4}ironman\/create\/1$/u.test(sampleUrl.pathname) ||
    sampleUrl.search.length > 0 ||
    sampleUrl.hash.length > 0
  ) {
    throw new Error(
      "campaign.createUrlTemplate 必須是 iThome 的鐵人賽建立文章網址",
    );
  }
}

function readSeries(
  value: unknown,
  index: number,
  projectRoot: string,
): SeriesConfig {
  const field = `series[${index}]`;
  const series = readRecord(value, field);
  const articleRoot = readString(series.articleRoot, `${field}.articleRoot`);

  if (path.isAbsolute(articleRoot)) {
    throw new Error(`${field}.articleRoot 必須使用儲存庫相對路徑`);
  }

  return {
    key: readString(series.key, `${field}.key`),
    displayName: readString(series.displayName, `${field}.displayName`),
    signupId: readPositiveInteger(series.signupId, `${field}.signupId`),
    category: readString(series.category, `${field}.category`),
    expectedTitle: readString(series.expectedTitle, `${field}.expectedTitle`),
    articleRoot: path.resolve(projectRoot, articleRoot),
    totalDays: readPositiveInteger(series.totalDays, `${field}.totalDays`),
    day1DraftId: readPositiveInteger(
      series.day1DraftId,
      `${field}.day1DraftId`,
    ),
    ready: readBoolean(series.ready, `${field}.ready`),
    publishOrder: readPositiveInteger(
      series.publishOrder,
      `${field}.publishOrder`,
    ),
  };
}

function readRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} 必須是物件`);
  }

  return value as Record<string, unknown>;
}

function readArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} 必須是陣列`);
  }

  return value;
}

function readString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} 必須是非空白文字`);
  }

  return value;
}

function readBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${field} 必須是布林值`);
  }

  return value;
}

function readPositiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} 必須是正整數`);
  }

  return value;
}

function readPositiveIntegerArray(value: unknown, field: string): number[] {
  return readArray(value, field).map((item, index) =>
    readPositiveInteger(item, `${field}[${index}]`),
  );
}

function assertUnique<T>(values: T[], label: string): void {
  const uniqueValues = new Set(values);
  if (uniqueValues.size !== values.length) {
    throw new Error(`${label} 不可重複`);
  }
}
