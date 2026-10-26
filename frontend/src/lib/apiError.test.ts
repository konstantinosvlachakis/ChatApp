import {
  ApiError,
  apiErrorFromResponse,
  getErrorMessage,
  parseRetryAfterMs,
  toApiError,
} from "./apiError";

describe("ApiError normalisation", () => {
  test("reads the backend envelope", () => {
    const error = toApiError({
      isAxiosError: true,
      response: {
        status: 403,
        data: { error: "You are not a participant in this conversation.", code: "not_participant" },
        headers: { "x-request-id": "req-1" },
      },
    });
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(403);
    expect(error.code).toBe("not_participant");
    expect(error.message).toBe("You are not a participant in this conversation.");
    expect(error.requestId).toBe("req-1");
    expect(error.retryable).toBe(false);
  });

  test("keeps validation details, the raw body and the 500 request id", () => {
    const invalid = apiErrorFromResponse(400, {
      error: "name: This field is required.",
      code: "invalid",
      details: { name: ["This field is required."] },
      already_translated: true,
    });
    expect(invalid.details).toEqual({ name: ["This field is required."] });
    expect((invalid.data as { already_translated: boolean }).already_translated).toBe(true);

    const server = apiErrorFromResponse(500, {
      error: "Something went wrong on our side. Please try again.",
      code: "server_error",
      request_id: "abc123",
    });
    expect(server.requestId).toBe("abc123");
    expect(server.code).toBe("server_error");
  });

  test("falls back to legacy keys and then friendly text per status", () => {
    expect(apiErrorFromResponse(401, { message: "No active account", code: "no_active_account" }).message).toBe(
      "No active account"
    );
    expect(apiErrorFromResponse(429, { detail: "Slow down." }).message).toBe("Slow down.");
    const html = apiErrorFromResponse(502, "<html>Bad gateway</html>");
    expect(html.message).toBe("The service is temporarily unavailable. Please try again.");
    expect(html.code).toBe("upstream_error");
    expect(html.retryable).toBe(true);
    expect(apiErrorFromResponse(404, null).code).toBe("not_found");
  });

  test("reads Retry-After from the header or the envelope", () => {
    expect(apiErrorFromResponse(429, { error: "x", code: "throttled" }, { "retry-after": "7" }).retryAfterMs).toBe(7000);
    expect(apiErrorFromResponse(429, { error: "x", code: "throttled", retry_after: 3 }).retryAfterMs).toBe(3000);
    expect(parseRetryAfterMs("garbage")).toBeNull();
    expect(parseRetryAfterMs(new Date(10_000).toUTCString(), 4_000)).toBe(6000);
  });

  test("maps transport failures", () => {
    const network = toApiError({ isAxiosError: true, code: "ERR_NETWORK", message: "Network Error" });
    expect(network.code).toBe("network_error");
    expect(network.status).toBe(0);
    expect(network.retryable).toBe(true);

    expect(toApiError({ isAxiosError: true, code: "ECONNABORTED" }).code).toBe("timeout");
    expect(toApiError({ name: "CanceledError", code: "ERR_CANCELED" }).code).toBe("aborted");
    expect(toApiError(new Error("boom")).code).toBe("unknown");
  });

  test("uses the offline message when the browser is offline", () => {
    const spy = jest.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    try {
      expect(toApiError({ isAxiosError: true, code: "ERR_NETWORK" }).message).toMatch(/offline/i);
    } finally {
      spy.mockRestore();
    }
  });

  test("getErrorMessage prefers API text, then the fallback for unknown errors", () => {
    expect(getErrorMessage(apiErrorFromResponse(400, { error: "Bad email", code: "invalid" }))).toBe("Bad email");
    expect(getErrorMessage(new Error("internal"), "Could not save.")).toBe("Could not save.");
  });
});
