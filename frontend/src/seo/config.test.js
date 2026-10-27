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
