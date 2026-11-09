import { buildHeadTags, buildSeoModel, DEFAULT_OG_IMAGE, serializeJsonLd } from "./config";

describe("link preview tags", () => {
  it("uses an absolute PNG preview image, not the favicon", () => {
    expect(DEFAULT_OG_IMAGE).toMatch(/^https:\/\/.+\/og-image\.png(\?v=\d+)?$/);
  });

  it("emits a large-image card with size and alt text", () => {
    const head = buildHeadTags("/");
    expect(head).toContain(`<meta property="og:image" content="${DEFAULT_OG_IMAGE}" />`);
    expect(head).toContain('<meta property="og:image:width" content="1200" />');
    expect(head).toContain('<meta property="og:image:height" content="630" />');
    expect(head).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(head).toMatch(/<meta property="og:image:alt" content="[^"]+" \/>/);
  });
});

describe("password reset pages", () => {
  it("are noindex and keep the emailed token out of the canonical URL", () => {
    const head = buildHeadTags("/reset-password/MQ/abc-123");
    expect(head).toContain('<meta name="robots" content="noindex,nofollow" />');
    expect(head).not.toContain("abc-123");
    expect(buildHeadTags("/forgot-password")).toContain(
      '<meta name="robots" content="noindex,nofollow" />'
    );
  });
});

const structuredDataFrom = (head) => {
  const match = head.match(/<script type="application\/ld\+json" data-seo="structured-data">([\s\S]*?)<\/script>/);
  return JSON.parse(match[1]);
};
const typesIn = (data) => data["@graph"].map((node) => node["@type"]);

describe("landing pages", () => {
  test.each([
    ["/", ["Organization", "WebSite", "SoftwareApplication", "WebPage", "FAQPage"]],
    ["/how-it-works", ["Organization", "WebSite", "SoftwareApplication", "WebPage", "BreadcrumbList"]],
    ["/exchange/english-spanish", ["Organization", "WebSite", "SoftwareApplication", "WebPage", "BreadcrumbList", "FAQPage"]],
    ["/exchange/greek-spanish", ["Organization", "WebSite", "SoftwareApplication", "WebPage", "BreadcrumbList", "FAQPage"]],
    ["/exchange/italian-english", ["Organization", "WebSite", "SoftwareApplication", "WebPage", "BreadcrumbList", "FAQPage"]],
  ])("%s is indexable with its own canonical and parseable JSON-LD", (path, types) => {
    const head = buildHeadTags(path);
    expect(head).toContain('<meta name="robots" content="index,follow" />');
    expect(head).toContain(`<link rel="canonical" href="https://www.langvoyage.com${path}" />`);
    expect(typesIn(structuredDataFrom(head))).toEqual(types);
  });

  test("titles and descriptions differ per page", () => {
    const paths = ["/", "/how-it-works", "/exchange/english-spanish", "/exchange/greek-spanish", "/exchange/italian-english"];
    const models = paths.map((path) => buildSeoModel(path));
    expect(new Set(models.map((model) => model.title)).size).toBe(paths.length);
    expect(new Set(models.map((model) => model.description)).size).toBe(paths.length);
  });

  test("pair breadcrumbs go Home → pair", () => {
    const graph = buildSeoModel("/exchange/greek-spanish").structuredData["@graph"];
    const breadcrumb = graph.find((node) => node["@type"] === "BreadcrumbList");
    expect(breadcrumb.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: "https://www.langvoyage.com/" },
      {
        "@type": "ListItem",
        position: 2,
        name: "Greek–Spanish exchange",
        item: "https://www.langvoyage.com/exchange/greek-spanish",
      },
    ]);
  });

  test("the app is described as a free web EducationalApplication", () => {
    const app = buildSeoModel("/").structuredData["@graph"].find((node) => node["@type"] === "SoftwareApplication");
    expect(app).toMatchObject({
      applicationCategory: "EducationalApplication",
      operatingSystem: "Web",
      offers: { "@type": "Offer", price: "0" },
    });
  });

  test("a trailing slash keeps the canonical without it; unknown pairs are noindex", () => {
    expect(buildHeadTags("/exchange/italian-english/")).toContain(
      '<link rel="canonical" href="https://www.langvoyage.com/exchange/italian-english" />'
    );
    expect(buildHeadTags("/exchange/nope")).toContain('<meta name="robots" content="noindex,nofollow" />');
  });
});

describe("serializeJsonLd", () => {
  test("can't close the script element or break out of it", () => {
    const lineSeparator = String.fromCharCode(0x2028);
    const text = `</script><script>alert(1)</script> & <!-- ${lineSeparator}`;
    const out = serializeJsonLd({ text });
    expect(out).not.toMatch(/[<>&]/);
    expect(out).not.toContain(lineSeparator);
    expect(JSON.parse(out)).toEqual({ text });
  });
});
