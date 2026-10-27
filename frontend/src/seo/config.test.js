import { buildHeadTags, DEFAULT_OG_IMAGE } from "./config";

describe("link preview tags", () => {
  it("uses an absolute PNG preview image, not the favicon", () => {
    expect(DEFAULT_OG_IMAGE).toMatch(/^https:\/\/.+\/og-image\.png$/);
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
