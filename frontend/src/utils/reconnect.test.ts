import { getReconnectDelayMs } from "./reconnect";

describe("getReconnectDelayMs", () => {
  it("doubles the window per attempt and caps it at 30 s", () => {
    const max = () => 0.999999;
    const min = () => 0;
    expect(getReconnectDelayMs(0, min)).toBe(500);
    expect(getReconnectDelayMs(0, max)).toBe(1000);
    expect(getReconnectDelayMs(1, max)).toBe(2000);
    expect(getReconnectDelayMs(2, max)).toBe(4000);
    expect(getReconnectDelayMs(10, max)).toBe(30000);
    expect(getReconnectDelayMs(10, min)).toBe(15000);
    expect(getReconnectDelayMs(1000, max)).toBe(30000);
  });
});
