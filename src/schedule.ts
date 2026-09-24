const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export interface CampaignDayOptions {
  instant: Date;
  startDate: string;
  timeZone: string;
  totalDays: number;
}

/**
 * 依指定時區換算連載 Day。活動期間以外回傳 null，避免排程誤發。
 */
export function getCampaignDay(options: CampaignDayOptions): number | null {
  const currentDate = toDateParts(options.instant, options.timeZone);
  const startDate = parseIsoDate(options.startDate);
  const dayOffset = Math.round(
    (toUtcMidnight(currentDate) - toUtcMidnight(startDate)) /
      MILLISECONDS_PER_DAY,
  );
  const campaignDay = dayOffset + 1;

  if (campaignDay < 1 || campaignDay > options.totalDays) {
    return null;
  }

  return campaignDay;
}

interface DateParts {
  year: number;
  month: number;
  day: number;
}

function toDateParts(instant: Date, timeZone: string): DateParts {
  if (Number.isNaN(instant.getTime())) {
    throw new Error("執行時間不是有效日期");
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(instant);

  return {
    year: readDatePart(parts, "year"),
    month: readDatePart(parts, "month"),
    day: readDatePart(parts, "day"),
  };
}

function readDatePart(
  parts: Intl.DateTimeFormatPart[],
  type: "year" | "month" | "day",
): number {
  const value = parts.find((part) => part.type === type)?.value;
  if (value === undefined) {
    throw new Error(`無法取得日期欄位：${type}`);
  }

  return Number.parseInt(value, 10);
}

function parseIsoDate(value: string): DateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    throw new Error(`日期格式必須是 YYYY-MM-DD：${value}`);
  }

  const year = match[1];
  const month = match[2];
  const day = match[3];
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`無法解析日期：${value}`);
  }

  const result = {
    year: Number.parseInt(year, 10),
    month: Number.parseInt(month, 10),
    day: Number.parseInt(day, 10),
  };

  const normalized = new Date(toUtcMidnight(result));
  if (
    normalized.getUTCFullYear() !== result.year ||
    normalized.getUTCMonth() + 1 !== result.month ||
    normalized.getUTCDate() !== result.day
  ) {
    throw new Error(`日期不存在：${value}`);
  }

  return result;
}

function toUtcMidnight(value: DateParts): number {
  return Date.UTC(value.year, value.month - 1, value.day);
}
