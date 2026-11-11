import { closeSocketQuietly, getReconnectDelayMs } from "./reconnect";

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

describe("closeSocketQuietly", () => {
  const fakeSocket = (readyState: number) =>
    ({ readyState, close: jest.fn(), onopen: null, onmessage: () => {}, onerror: () => {} }) as unknown as WebSocket;

  it("waits for a connecting socket to open before closing it (no browser warning)", () => {
    const socket = fakeSocket(WebSocket.CONNECTING);
    closeSocketQuietly(socket);
    expect(socket.close).not.toHaveBeenCalled();
    expect(socket.onmessage).toBeNull();
    (socket.onopen as () => void)();
    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it("closes an open socket now and ignores closed or missing ones", () => {
    const open = fakeSocket(WebSocket.OPEN);
    closeSocketQuietly(open);
    expect(open.close).toHaveBeenCalledTimes(1);
    const closed = fakeSocket(WebSocket.CLOSED);
    closeSocketQuietly(closed);
    expect(closed.close).not.toHaveBeenCalled();
    expect(() => closeSocketQuietly(null)).not.toThrow();
  });
});
