import {
  resolveArticleForDay,
  validateArticle,
  type ArticleDocument,
} from "./article.js";
import type { PublisherConfig, SeriesConfig } from "./config.js";
import { getCampaignDay } from "./schedule.js";

export interface PublicationItem {
  series: SeriesConfig;
  article: ArticleDocument;
}

export interface SkippedSeries {
  seriesKey: string;
  reason: string;
}

export interface PublicationError {
  seriesKey: string;
  messages: string[];
}

export interface PublicationPlan {
  day: number | null;
  ready: PublicationItem[];
  skipped: SkippedSeries[];
  errors: PublicationError[];
}

export interface ArchiveValidationResult {
  validated: Array<{ seriesKey: string; articleCount: number }>;
  skipped: SkippedSeries[];
  errors: PublicationError[];
}

/**
 * 產生當日發布計畫。此函式只讀取並驗證文章，不會連線或發布到 iThome。
 */
export async function createPublicationPlan(
  config: PublisherConfig,
  instant: Date,
): Promise<PublicationPlan> {
  const day = getCampaignDay({
    instant,
    startDate: config.campaign.startDate,
    timeZone: config.campaign.timeZone,
    totalDays: config.campaign.totalDays,
  });
  const plan: PublicationPlan = {
    day,
    ready: [],
    skipped: [],
    errors: [],
  };

  if (day === null) {
    return plan;
  }

  for (const series of config.series) {
    if (!series.ready) {
      plan.skipped.push({
        seriesKey: series.key,
        reason: "系列尚未完成，ready=false",
      });
      continue;
    }

    if (day > series.totalDays) {
      plan.skipped.push({
        seriesKey: series.key,
        reason: `系列已於 Day ${series.totalDays} 完成`,
      });
      continue;
    }

    try {
      const article = await resolveArticleForDay(series.articleRoot, day);
      const issues = validateArticle(article);

      if (issues.length > 0) {
        plan.errors.push({
          seriesKey: series.key,
          messages: issues.map((issue) => issue.message),
        });
        continue;
      }

      plan.ready.push({ series, article });
    } catch (error) {
      plan.errors.push({
        seriesKey: series.key,
        messages: [toErrorMessage(error)],
      });
    }
  }

  return plan;
}

/**
 * 驗證所有已就緒系列的完整連載內容，不會處理 ready=false 的系列。
 */
export async function validateReadyArchives(
  config: PublisherConfig,
): Promise<ArchiveValidationResult> {
  const result: ArchiveValidationResult = {
    validated: [],
    skipped: [],
    errors: [],
  };

  for (const series of config.series) {
    if (!series.ready) {
      result.skipped.push({
        seriesKey: series.key,
        reason: "系列尚未完成，ready=false",
      });
      continue;
    }

    const messages: string[] = [];
    let articleCount = 0;

    for (let day = 1; day <= series.totalDays; day += 1) {
      try {
        const article = await resolveArticleForDay(series.articleRoot, day);
        const issues = validateArticle(article);

        if (issues.length === 0) {
          articleCount += 1;
          continue;
        }

        messages.push(
          ...issues.map((issue) => `Day ${day}：${issue.message}`),
        );
      } catch (error) {
        messages.push(`Day ${day}：${toErrorMessage(error)}`);
      }
    }

    if (messages.length > 0) {
      result.errors.push({
        seriesKey: series.key,
        messages,
      });
      continue;
    }

    result.validated.push({
      seriesKey: series.key,
      articleCount,
    });
  }

  return result;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
