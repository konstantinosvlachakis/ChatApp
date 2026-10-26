import { ApiError } from "./apiError";
import { createApiClient, getRetryDelayMs, type HttpRequestConfig } from "./apiClient";
import { getConnectivityState, resetConnectivity } from "./connectivity";

const httpError = (status: number, data: unknown = {}, headers: Record<string, string> = {}) => ({
  isAxiosError: true,
  response: { status, data, headers },
});

const setup = (responses: Array<unknown>) => {
  const calls: HttpRequestConfig[] = [];
  const transport = jest.fn(async (config: HttpRequestConfig) => {
    calls.push(config);
    const next = responses.shift();
    if (next instanceof Error || (next && (next as { isAxiosError?: boolean }).isAxiosError)) throw next;
    return { data: next };
  });
  const sleep = jest.fn(() => Promise.resolve());
  const client = createApiClient({ transport, sleep, random: () => 1 });
  return { client, transport, sleep, calls };
};

describe("API client retry policy", () => {
  beforeEach(() => resetConnectivity());

  test("retries a GET on 503 with exponential backoff, then succeeds", async () => {
    const { client, transport, sleep } = setup([httpError(503), httpError(503), { ok: true }]);
    await expect(client.get("/api/profile/")).resolves.toEqual({ ok: true });
    expect(transport).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((call) => (call as unknown[])[0])).toEqual([500, 1000]);
  });

  test("gives up after 3 attempts with a normalised error", async () => {
    const { client, transport } = setup([
      httpError(503, { error: "down", code: "service_unavailable" }),
      httpError(503, { error: "down", code: "service_unavailable" }),
      httpError(503, { error: "down", code: "service_unavailable" }),
      { never: true },
    ]);
    const error = (await client.get("/api/x/").catch((err) => err)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("service_unavailable");
    expect(transport).toHaveBeenCalledTimes(3);
    expect(getConnectivityState().apiFailureStreak).toBe(3);
  });

  test("never retries a POST", async () => {
    const { client, transport, sleep } = setup([httpError(503), { ok: true }]);
    await expect(client.post("/api/conversations/", { participant: "a" })).rejects.toMatchObject({
      status: 503,
    });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  test("does not retry a GET on a 4xx", async () => {
    const { client, transport } = setup([httpError(404, { error: "Not found.", code: "not_found" })]);
    await expect(client.get("/api/nope/")).rejects.toMatchObject({ code: "not_found" });
    expect(transport).toHaveBeenCalledTimes(1);
    // The server answered, so it is reachable.
    expect(getConnectivityState().apiFailureStreak).toBe(0);
  });

  test("respects Retry-After on 429 and gives up when it is too long", async () => {
    const { client, sleep } = setup([httpError(429, {}, { "retry-after": "2" }), { ok: 1 }]);
    await client.get("/api/x/");
    expect(sleep).toHaveBeenCalledWith(2000, undefined);

    const long = setup([httpError(429, {}, { "retry-after": "120" }), { ok: 1 }]);
    await expect(long.client.get("/api/x/")).rejects.toMatchObject({ code: "throttled" });
    expect(long.transport).toHaveBeenCalledTimes(1);
  });

  test("retries network errors and resets the failure streak on success", async () => {
    const { client } = setup([{ isAxiosError: true, code: "ERR_NETWORK" }, { ok: 1 }]);
    await client.get("/api/x/");
    expect(getConnectivityState().apiFailureStreak).toBe(0);
  });

  test("passes timeouts and stops on abort", async () => {
    const controller = new AbortController();
    const { client, calls } = setup([{ ok: 1 }]);
    await client.get("/api/x/", { timeoutMs: 1234, signal: controller.signal });
    expect(calls[0].timeout).toBe(1234);
    expect(calls[0].signal).toBe(controller.signal);

    controller.abort();
    const aborted = setup([{ ok: 1 }]);
    await expect(aborted.client.get("/api/x/", { signal: controller.signal })).rejects.toMatchObject({
      code: "aborted",
    });
    expect(aborted.transport).not.toHaveBeenCalled();
  });

  test("uploads use the longer timeout and are not retried", async () => {
    const { client, calls, transport } = setup([httpError(504)]);
    await expect(client.upload("/api/x/", new FormData(), { method: "PATCH" })).rejects.toBeInstanceOf(ApiError);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].timeout).toBe(60_000);
  });

  test("backoff has jitter and a cap", () => {
    const error = new ApiError({ status: 503, code: "x", message: "x", retryable: true });
    expect(getRetryDelayMs(1, error, () => 0)).toBe(250);
    expect(getRetryDelayMs(1, error, () => 1)).toBe(500);
    expect(getRetryDelayMs(10, error, () => 1)).toBe(5000);
    const fatal = new ApiError({ status: 400, code: "invalid", message: "x" });
    expect(getRetryDelayMs(1, fatal)).toBeNull();
  });
});
