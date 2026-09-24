import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export interface ArticleDocument {
  day: number;
  title: string;
  body: string;
  filePath: string;
}

export interface ArticleValidationIssue {
  code: "relative-image" | "insecure-image";
  message: string;
}

/**
 * 依 Day 尋找唯一文章，並將第一層標題拆成 iThome 標題與本文。
 */
export async function resolveArticleForDay(
  articleRoot: string,
  expectedDay: number,
): Promise<ArticleDocument> {
  assertValidDay(expectedDay);

  const entries = await readdir(articleRoot, { withFileTypes: true });
  const matches = entries.filter(
    (entry) =>
      entry.isFile() &&
      readDayFromFileName(entry.name) === expectedDay,
  );

  if (matches.length === 0) {
    throw new Error(`找不到 Day ${expectedDay} 的文章：${articleRoot}`);
  }

  if (matches.length > 1) {
    const names = matches.map((entry) => entry.name).join("、");
    throw new Error(`Day ${expectedDay} 有多個文章檔案：${names}`);
  }

  const entry = matches[0];
  if (entry === undefined) {
    throw new Error(`找不到 Day ${expectedDay} 的文章：${articleRoot}`);
  }

  const filePath = path.join(articleRoot, entry.name);
  const content = (await readFile(filePath, "utf8"))
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n");
  const firstLineEnd = content.indexOf("\n");
  const firstLine = firstLineEnd === -1 ? content : content.slice(0, firstLineEnd);
  const heading = /^#\s+(.+?)\s*$/.exec(firstLine)?.[1];

  if (heading === undefined) {
    throw new Error(`文章第一行必須是 H1 標題：${filePath}`);
  }

  const headingDay = readDayFromHeading(heading);
  if (headingDay !== expectedDay) {
    throw new Error(
      `檔名與標題 Day 不一致：預期 Day ${expectedDay}，標題是 Day ${headingDay ?? "未知"}`,
    );
  }

  const body = (firstLineEnd === -1 ? "" : content.slice(firstLineEnd + 1)).trimStart();
  if (body.trim().length === 0) {
    throw new Error(`文章本文不可為空白：${filePath}`);
  }

  return {
    day: expectedDay,
    title: heading,
    body,
    filePath,
  };
}

/**
 * 檢查貼到 iThome 後仍能公開讀取的圖片網址。
 */
export function validateArticle(
  article: ArticleDocument,
): ArticleValidationIssue[] {
  const issues: ArticleValidationIssue[] = [];
  const imagePattern = /!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))/gu;

  for (const match of article.body.matchAll(imagePattern)) {
    const imageUrl = match[1] ?? match[2];
    if (imageUrl === undefined || /^https:\/\//iu.test(imageUrl)) {
      continue;
    }

    if (/^http:\/\//iu.test(imageUrl)) {
      issues.push({
        code: "insecure-image",
        message: `圖片必須改用 https:// 網址：${imageUrl}`,
      });
      continue;
    }

    issues.push({
      code: "relative-image",
      message: `圖片必須使用可公開存取的 https:// 網址：${imageUrl}`,
    });
  }

  return issues;
}

function readDayFromFileName(fileName: string): number | null {
  const match = /^Day\s*0?(\d{1,2})(?:\.md|[｜|].*\.md)$/iu.exec(fileName);
  return match?.[1] === undefined ? null : Number.parseInt(match[1], 10);
}

function readDayFromHeading(heading: string): number | null {
  const match = /^Day\s*0?(\d{1,2})\s*[｜|]/u.exec(heading);
  return match?.[1] === undefined ? null : Number.parseInt(match[1], 10);
}

function assertValidDay(day: number): void {
  if (!Number.isInteger(day) || day < 1) {
    throw new Error(`Day 必須是正整數：${day}`);
  }
}
