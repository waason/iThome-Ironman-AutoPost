import path from "node:path";

import type { PublisherConfig } from "./config.js";
import {
  createPublicationPlan,
  type SkippedSeries,
} from "./publication-plan.js";

export interface PreviewTarget {
  seriesKey: string;
  signupId: number;
  draftId: number;
  draftUrl: string;
  category: string;
  expectedSeriesTitle: string;
  articleTitle: string;
  articleBody: string;
  screenshotPath: string;
}

export interface DayOnePreviewPlan {
  day: 1;
  targets: PreviewTarget[];
  skipped: SkippedSeries[];
}

/**
 * 建立 Day 1 預覽內容，只允許使用已登記的既有草稿。
 */
export async function createDayOnePreviewPlan(
  config: PublisherConfig,
  instant: Date,
  selectedSeriesKeys?: string[],
): Promise<DayOnePreviewPlan> {
  const publicationPlan = await createPublicationPlan(config, instant);

  if (publicationPlan.day !== 1) {
    throw new Error(
      `Day 1 預覽只能在活動第一天執行，目前 Day 為 ${publicationPlan.day ?? "活動期間外"}`,
    );
  }

  if (publicationPlan.errors.length > 0) {
    const messages = publicationPlan.errors.flatMap((error) =>
      error.messages.map((message) => `${error.seriesKey}：${message}`),
    );
    throw new Error(`Day 1 預覽前驗證失敗：${messages.join("；")}`);
  }

  const selectedKeys = selectedSeriesKeys
    ? new Set(selectedSeriesKeys)
    : undefined;
  if (selectedKeys !== undefined) {
    const configuredKeys = new Set(config.series.map((series) => series.key));
    const unknownKeys = [...selectedKeys].filter((key) => !configuredKeys.has(key));
    if (unknownKeys.length > 0) {
      throw new Error(`找不到指定系列：${unknownKeys.join("、")}`);
    }
  }

  const targets = publicationPlan.ready
    .filter(
      (item) => selectedKeys === undefined || selectedKeys.has(item.series.key),
    )
    .map((item) => ({
      seriesKey: item.series.key,
      signupId: item.series.signupId,
      draftId: item.series.day1DraftId,
      draftUrl: `https://ithelp.ithome.com.tw/articles/${item.series.day1DraftId}/draft`,
      category: item.series.category,
      expectedSeriesTitle: item.series.expectedTitle,
      articleTitle: item.article.title,
      articleBody: item.article.body,
      screenshotPath: path.join(
        "output",
        "playwright",
        `${config.campaign.startDate}-${item.series.key}-day-01-preview.png`,
      ),
    }));

  if (targets.length === 0) {
    throw new Error("沒有可預覽的已就緒系列");
  }

  return {
    day: 1,
    targets,
    skipped: publicationPlan.skipped,
  };
}
