import path from "node:path";

import type { PublisherConfig } from "./config.js";
import {
  createPublicationPlan,
  type SkippedSeries,
} from "./publication-plan.js";

export type AutomationMode = "save-draft" | "publish";

export interface AutomationTarget {
  day: number;
  seriesKey: string;
  signupId: number;
  knownDraftId?: number;
  entryUrl: string;
  createUrl: string;
  category: string;
  expectedSeriesTitle: string;
  articleTitle: string;
  articleBody: string;
  publicSeriesUrl: string;
  rssUrl: string;
  userArticlesUrl: string;
  screenshotPath: string;
  receiptPath: string;
}

export interface AutomationPlan {
  day: number;
  targets: AutomationTarget[];
  skipped: SkippedSeries[];
}

export interface PublishWindowOptions {
  requestedDate: string;
  publishTime: string;
  timeZone: string;
  now: Date;
}

/**
 * 建立當日儲存或發布計畫。Day 1 使用既有草稿，後續 Day 使用正式系列建立入口。
 */
export async function createAutomationPlan(
  config: PublisherConfig,
  instant: Date,
  selectedSeriesKeys?: string[],
): Promise<AutomationPlan> {
  const publicationPlan = await createPublicationPlan(config, instant);

  if (publicationPlan.day === null) {
    throw new Error("指定日期不在連載期間內");
  }

  if (publicationPlan.errors.length > 0) {
    const messages = publicationPlan.errors.flatMap((error) =>
      error.messages.map((message) => `${error.seriesKey}：${message}`),
    );
    throw new Error(`自動化前驗證失敗：${messages.join("；")}`);
  }

  const selectedKeys = validateSelectedSeriesKeys(
    config,
    selectedSeriesKeys,
  );
  const day = publicationPlan.day;
  const dayLabel = day.toString().padStart(2, "0");
  const publicationDateParts = getZonedDateTimeParts(
    instant,
    config.campaign.timeZone,
  );
  const publicationDate = [
    publicationDateParts.year,
    publicationDateParts.month,
    publicationDateParts.day,
  ].join("-");
  const targets = publicationPlan.ready
    .filter(
      (item) => selectedKeys === undefined || selectedKeys.has(item.series.key),
    )
    .map((item): AutomationTarget => {
      const createUrl = config.campaign.createUrlTemplate.replace(
        "{signupId}",
        item.series.signupId.toString(),
      );
      const common = {
        day,
        seriesKey: item.series.key,
        signupId: item.series.signupId,
        entryUrl: day === 1
          ? `https://ithelp.ithome.com.tw/articles/${item.series.day1DraftId}/draft`
          : createUrl,
        createUrl,
        category: item.series.category,
        expectedSeriesTitle: item.series.expectedTitle,
        articleTitle: item.article.title,
        articleBody: item.article.body,
        publicSeriesUrl: `https://ithelp.ithome.com.tw/users/${config.campaign.authorId}/ironman/${item.series.signupId}`,
        rssUrl: `https://ithelp.ithome.com.tw/rss/series/${item.series.signupId}`,
        userArticlesUrl: `https://ithelp.ithome.com.tw/users/${config.campaign.authorId}/articles`,
        screenshotPath: path.join(
          "output",
          "playwright",
          `${publicationDate}-${item.series.key}-day-${dayLabel}-automation.png`,
        ),
        receiptPath: path.join(
          "output",
          "receipts",
          `${publicationDate}-${item.series.key}-day-${dayLabel}.json`,
        ),
      };

      return day === 1
        ? { ...common, knownDraftId: item.series.day1DraftId }
        : common;
    });

  if (targets.length === 0) {
    throw new Error("沒有可處理的已就緒系列");
  }

  return {
    day,
    targets,
    skipped: publicationPlan.skipped,
  };
}

/**
 * 正式發布必須使用台灣當天日期，且不得早於設定的發布時間。
 */
export function assertPublishWindow(options: PublishWindowOptions): void {
  const parts = getZonedDateTimeParts(options.now, options.timeZone);
  const currentDate = `${parts.year}-${parts.month}-${parts.day}`;

  if (currentDate !== options.requestedDate) {
    throw new Error(
      `發布日期必須是台灣當天：預期 ${currentDate}，收到 ${options.requestedDate}`,
    );
  }

  const [publishHour, publishMinute] = options.publishTime
    .split(":")
    .map(Number);
  if (publishHour === undefined || publishMinute === undefined) {
    throw new Error(`無效發布時間：${options.publishTime}`);
  }

  const currentMinutes = Number(parts.hour) * 60 + Number(parts.minute);
  const publishMinutes = publishHour * 60 + publishMinute;
  if (currentMinutes < publishMinutes) {
    throw new Error(
      `尚未到發布時間：${options.timeZone} ${options.publishTime}`,
    );
  }
}

function validateSelectedSeriesKeys(
  config: PublisherConfig,
  selectedSeriesKeys?: string[],
): Set<string> | undefined {
  if (selectedSeriesKeys === undefined) {
    return undefined;
  }

  const selectedKeys = new Set(selectedSeriesKeys);
  const configuredKeys = new Set(config.series.map((series) => series.key));
  const unknownKeys = [...selectedKeys].filter((key) => !configuredKeys.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(`找不到指定系列：${unknownKeys.join("、")}`);
  }

  return selectedKeys;
}

function getZonedDateTimeParts(
  instant: Date,
  timeZone: string,
): Record<"year" | "month" | "day" | "hour" | "minute", string> {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const values = Object.fromEntries(
    formatter
      .formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  for (const key of ["year", "month", "day", "hour", "minute"] as const) {
    if (values[key] === undefined) {
      throw new Error(`無法取得 ${timeZone} 的 ${key}`);
    }
  }

  return values as Record<
    "year" | "month" | "day" | "hour" | "minute",
    string
  >;
}
