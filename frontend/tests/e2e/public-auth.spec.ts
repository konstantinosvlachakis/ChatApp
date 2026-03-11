import { devices, expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const screenshotsDir = path.resolve(__dirname, "../../docs/screenshots");
const appOrigin = "http://127.0.0.1:3000";
const apiOrigin = "http://127.0.0.1:8000";

const mockUser = {
  id: 7,
  user_id: 7,
  username: "dinos",
  native_language: "Greek",
  base_translate_language: "english",
  languages_practicing: ["english", "french"],
  profile_image_url: `${appOrigin}/logo192.png`,
};

const mockConversations = [
  {
    id: 42,
    sender: {
      id: 7,
      username: "dinos",
      profile_image_url: `${appOrigin}/logo192.png`,
      is_online: true,
    },
    receiver: {
      id: 12,
      username: "maya",
      profile_image_url: `${appOrigin}/logo192.png`,
      is_online: true,
    },
    updated_at: "2026-03-11T19:21:00Z",
    unread_count: 2,
    last_message: {
      id: 502,
      text: "I can help you with the itinerary tonight.",
      status: "read",
      sender: {
        id: 12,
        username: "maya",
      },
      timestamp: "2026-03-11T19:21:00Z",
    },
  },
  {
    id: 51,
    sender: {
      id: 22,
      username: "leo",
      profile_image_url: `${appOrigin}/logo192.png`,
      is_online: false,
    },
    receiver: {
      id: 7,
      username: "dinos",
      profile_image_url: `${appOrigin}/logo192.png`,
      is_online: true,
    },
    updated_at: "2026-03-10T18:10:00Z",
    unread_count: 0,
    last_message: {
      id: 701,
      text: "Send me the phrases you want to practise.",
      status: "delivered",
      sender: {
        id: 7,
        username: "dinos",
      },
      timestamp: "2026-03-10T18:10:00Z",
    },
  },
];

const mockConversationDetail = {
  id: 42,
  sender: mockConversations[0].sender,
  receiver: mockConversations[0].receiver,
  updated_at: mockConversations[0].updated_at,
  messages: [],
};

const mockMessagesPage = {
  messages: [
    {
      id: 500,
      text: "I found a quiet cafe near Syntagma if you want a good place to study.",
      sender: {
        id: 12,
        username: "maya",
      },
      timestamp: "2026-03-11T19:15:00Z",
      can_translate: true,
      reactions: [],
      current_user_reaction: null,
    },
    {
      id: 501,
      text: "Perfect. I also want to practise ordering in Greek before the trip.",
      sender: {
        id: 7,
        username: "dinos",
      },
      timestamp: "2026-03-11T19:17:00Z",
      can_translate: false,
      reactions: [
        {
          id: 1,
          user_id: 12,
          username: "maya",
          emoji: "👍",
        },
      ],
      current_user_reaction: null,
      status: "read",
    },
    {
      id: 502,
      text: "I can help you with the itinerary tonight.",
      sender: {
        id: 12,
        username: "maya",
      },
      timestamp: "2026-03-11T19:21:00Z",
      can_translate: true,
      reactions: [
        {
          id: 2,
          user_id: 7,
          username: "dinos",
          emoji: "❤️",
        },
      ],
      current_user_reaction: "❤️",
    },
  ],
  pagination: {
    page: 1,
    has_next: false,
  },
};

const saveScreenshot = async (page: Page, name: string) => {
  fs.mkdirSync(screenshotsDir, { recursive: true });
  await page.screenshot({
    path: path.join(screenshotsDir, name),
    fullPage: true,
  });
};

const installMockChatTransport = async (page: Page) => {
  await page.addInitScript(
    ({ user }) => {
      window.localStorage.setItem("accessToken", "playwright-token");
      window.sessionStorage.setItem("accessToken", "playwright-token");
      window.localStorage.setItem("refreshToken", "playwright-refresh");
      window.sessionStorage.setItem("refreshToken", "playwright-refresh");
      window.localStorage.setItem(
        "user_profile_cache:v1",
        JSON.stringify({
          user,
          cachedAt: Date.now(),
          token: "playwright-token",
        })
      );

      class MockNotification {
        static permission = "denied";
        static requestPermission() {
          return Promise.resolve("denied");
        }
        constructor(_title: string, _options?: NotificationOptions) {}
        close() {}
      }

      class MockWebSocket {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;
        readyState = MockWebSocket.OPEN;
        onopen: ((event?: Event) => void) | null = null;
        onmessage: ((event: MessageEvent) => void) | null = null;
        onclose: ((event?: CloseEvent) => void) | null = null;
        onerror: ((event?: Event) => void) | null = null;
        constructor(_url: string) {
          queueMicrotask(() => this.onopen?.());
        }
        send(_data?: string) {}
        close() {
          this.readyState = MockWebSocket.CLOSED;
          this.onclose?.();
        }
        addEventListener(type: string, handler: EventListener) {
          if (type === "open") queueMicrotask(() => handler(new Event("open")));
        }
        removeEventListener() {}
      }

      Object.defineProperty(window, "Notification", {
        configurable: true,
        writable: true,
        value: MockNotification,
      });

      Object.defineProperty(window, "WebSocket", {
        configurable: true,
        writable: true,
        value: MockWebSocket,
      });
    },
    { user: mockUser }
  );

  await page.route(`${apiOrigin}/api/profile/`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockUser),
    });
  });

  await page.route(`${apiOrigin}/api/conversations/`, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockConversations),
      });
      return;
    }

    await route.fulfill({ status: 200, body: "{}" });
  });

  await page.route(`${apiOrigin}/api/conversations/42/`, async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockConversationDetail),
      });
      return;
    }

    await route.fulfill({ status: 200, body: "{}" });
  });

  await page.route(`${apiOrigin}/api/conversations/42/read/`, async (route) => {
    await route.fulfill({ status: 200, body: "{}" });
  });

  await page.route(`${apiOrigin}/api/conversations/42/messages/**`, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockMessagesPage),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 999,
        text: "Mock sent message",
        timestamp: "2026-03-11T19:25:00Z",
        sender: {
          id: 7,
          username: "dinos",
        },
        status: "sent",
      }),
    });
  });
};

test.describe("Public auth pages", () => {
  test("captures desktop login state", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText("Email is required.")).toBeVisible();
    await expect(page.getByText("Password is required.")).toBeVisible();

    await saveScreenshot(page, "login-desktop.png");
  });

  test("captures desktop register state", async ({ page }) => {
    await page.goto("/register");

    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await page.locator("#username").fill("e2e_user");
    await page.locator("#email").fill("e2e@example.com");
    await page.locator("#date-of-birth").click();
    await page.getByRole("button", { name: "Use latest allowed" }).click();
    await page.locator("#native-language").selectOption("French");
    await page.locator("#password").fill("StrongPass1!");
    await page.locator("#confirm-password").fill("StrongPass1!");
    await expect(page.getByText("Strong password")).toBeVisible();

    await saveScreenshot(page, "register-desktop.png");
  });

  test("captures mobile login state", async ({ browser }) => {
    const context = await browser.newContext({
      ...devices["iPhone 13"],
    });
    const page = await context.newPage();

    await page.goto("http://127.0.0.1:3000/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();

    await saveScreenshot(page, "login-mobile.png");
    await context.close();
  });

  test("captures desktop chat state", async ({ page }) => {
    await installMockChatTransport(page);
    await page.goto("/conversations/42");

    await expect(page.getByRole("heading", { name: "maya" })).toBeVisible();
    await expect(
      page
        .getByText("I can help you with the itinerary tonight.")
        .nth(1)
    ).toBeVisible();
    await expect(page.getByPlaceholder("Type your message...")).toBeVisible();

    await saveScreenshot(page, "chat-desktop.png");
  });

  test("captures mobile chat state", async ({ browser }) => {
    const context = await browser.newContext({
      ...devices["iPhone 13"],
    });
    const page = await context.newPage();

    await installMockChatTransport(page);
    await page.goto(`${appOrigin}/conversations/42`);

    await expect(page.getByRole("heading", { name: "maya" })).toBeVisible();
    await expect(page.getByPlaceholder("Type your message...")).toBeVisible();

    await saveScreenshot(page, "chat-mobile.png");
    await context.close();
  });
});
