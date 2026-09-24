export interface PublishedArticleEvidence {
  title: string;
  url: string;
}

/**
 * 從 RSS 的 item 節點尋找精準標題，避免把 channel 標題誤判成已發布文章。
 */
export function findPublishedArticleInRss(
  rssXml: string,
  expectedTitle: string,
): PublishedArticleEvidence | undefined {
  const itemPattern = /<item\b[^>]*>([\s\S]*?)<\/item>/giu;
  const expectedDay = readDayPrefix(expectedTitle);

  for (const match of rssXml.matchAll(itemPattern)) {
    const itemXml = match[1];
    if (itemXml === undefined) {
      continue;
    }

    const title = readElementText(itemXml, "title");
    const link = readElementText(itemXml, "link");
    const itemDay = title === undefined ? undefined : readDayPrefix(title);
    const matchesExpectedArticle =
      title === expectedTitle ||
      (expectedDay !== undefined && itemDay === expectedDay);
    if (!matchesExpectedArticle || title === undefined || link === undefined) {
      continue;
    }

    const url = new URL(link);
    url.search = "";
    url.hash = "";
    if (
      url.origin !== "https://ithelp.ithome.com.tw" ||
      !/^\/articles\/\d+$/u.test(url.pathname)
    ) {
      continue;
    }

    return { title, url: url.href };
  }

  return undefined;
}

function readDayPrefix(title: string): number | undefined {
  const match = /^\s*Day\s*0*(\d{1,2})(?=\s|[:：｜|])/iu.exec(title);
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

function readElementText(xml: string, tagName: string): string | undefined {
  const pattern = new RegExp(
    `<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`,
    "iu",
  );
  const match = pattern.exec(xml);
  const rawValue = match?.[1];
  if (rawValue === undefined) {
    return undefined;
  }

  const cdataMatch = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/u.exec(rawValue);
  return decodeXmlEntities(cdataMatch?.[1] ?? rawValue).trim();
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&#(\d+);/gu, (_, codePoint: string) =>
      String.fromCodePoint(Number(codePoint)))
    .replace(/&#x([\da-f]+);/giu, (_, codePoint: string) =>
      String.fromCodePoint(Number.parseInt(codePoint, 16)));
}
