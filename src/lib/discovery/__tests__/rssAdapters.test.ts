import { describe, it, expect } from "vitest";
import { parseRssItems } from "../rssAdapters";

describe("parseRssItems", () => {
  it("extracts items with title/link/pubDate/description", () => {
    const xml = `<rss><channel>
      <item>
        <title><![CDATA[Acme: Senior Engineer]]></title>
        <link>https://example.com/jobs/1</link>
        <pubDate>Wed, 12 May 2026 14:00:00 +0000</pubDate>
        <description><![CDATA[<p>Remote engineering role</p>]]></description>
        <category>Programming</category>
      </item>
      <item>
        <title>Globex: Data Scientist</title>
        <link>https://example.com/jobs/2</link>
        <pubDate>Tue, 11 May 2026 09:00:00 +0000</pubDate>
        <description>ML role</description>
      </item>
    </channel></rss>`;

    const items = parseRssItems(xml);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("Acme: Senior Engineer");
    expect(items[0].link).toBe("https://example.com/jobs/1");
    expect(items[0].category).toBe("Programming");
    expect(items[1].title).toBe("Globex: Data Scientist");
  });

  it("returns empty array when no items", () => {
    expect(parseRssItems("<rss><channel></channel></rss>")).toHaveLength(0);
  });

  it("handles CDATA wrappers and HTML entities", () => {
    const xml = `<rss><item>
      <title><![CDATA[Title]]></title>
      <link>https://example.com</link>
    </item></rss>`;
    const items = parseRssItems(xml);
    expect(items[0].title).toBe("Title");
  });
});
