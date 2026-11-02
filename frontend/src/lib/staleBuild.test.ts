import { isChunkLoadError, reloadForNewBuild } from "./staleBuild";

describe("stale build recovery", () => {
  const originalLocation = window.location;
  let reload: jest.Mock;

  beforeEach(() => {
    window.sessionStorage.clear();
    reload = jest.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, reload },
    });
  });

  afterAll(() => {
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  it("recognises chunk load failures", () => {
    const chunkError = Object.assign(new Error("Loading chunk 452 failed."), { name: "ChunkLoadError" });
    expect(isChunkLoadError(chunkError)).toBe(true);
    expect(isChunkLoadError(new Error("Loading CSS chunk 12 failed"))).toBe(true);
    expect(isChunkLoadError(new Error("Something else"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });

  it("reloads once, then not again within the guard window", () => {
    expect(reloadForNewBuild(1_000_000)).toBe(true);
    expect(reloadForNewBuild(1_010_000)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads again after the guard window", () => {
    expect(reloadForNewBuild(1_000_000)).toBe(true);
    expect(reloadForNewBuild(1_040_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
