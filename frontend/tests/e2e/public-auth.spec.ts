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

const mockViewerUser = {
  id: 12,
  user_id: 12,
  username: "maya",
  native_language: "Spanish",
  base_translate_language: "english",
  languages_practicing: ["greek", "english"],
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

const mockCoachReply = {
  reply:
    "Privet! Excellent idea. Tell me one thing you would say first when meeting a friend at a cafe.",
  target_language: "russian",
  native_language: "Greek",
  mode: "casual_chat",
};

const saveScreenshot = async (page: Page, name: string) => {
  fs.mkdirSync(screenshotsDir, { recursive: true });
  await page.screenshot({
    path: path.join(screenshotsDir, name),
    fullPage: true,
  });
};

const getSocketMessages = async (page: Page, urlPart: string) =>
  page.evaluate((targetUrlPart) => {
    const socketApi = (window as typeof window & {
      __mockSocketApi?: {
        getSentMessages: (match: string) => string[];
      };
    }).__mockSocketApi;

    return socketApi?.getSentMessages(targetUrlPart) || [];
  }, urlPart);

const installMockChatTransport = async (
  page: Page,
  options: {
    user?: typeof mockUser;
    conversations?: typeof mockConversations;
    conversationDetail?: typeof mockConversationDetail;
    messagesPage?: typeof mockMessagesPage;
  } = {}
) => {
  const {
    user = mockUser,
    conversations = mockConversations,
    conversationDetail = mockConversationDetail,
    messagesPage = mockMessagesPage,
  } = options;

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

      const socketRegistry = new Map<
        string,
        Set<{
          readyState: number;
          onmessage: ((event: MessageEvent) => void) | null;
          onclose: ((event?: CloseEvent) => void) | null;
        }>
      >();
      const sentMessages = new Map<string, string[]>();

      const registerSocket = (url: string, socket: MockWebSocket) => {
        const sockets = socketRegistry.get(url) || new Set();
        sockets.add(socket);
        socketRegistry.set(url, sockets);
      };

      const unregisterSocket = (url: string, socket: MockWebSocket) => {
        const sockets = socketRegistry.get(url);
        if (!sockets) return;
        sockets.delete(socket);
        if (sockets.size === 0) {
          socketRegistry.delete(url);
        }
      };

      class MockWebSocket {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;
        url: string;
        readyState = MockWebSocket.OPEN;
        onopen: ((event?: Event) => void) | null = null;
        onmessage: ((event: MessageEvent) => void) | null = null;
        onclose: ((event?: CloseEvent) => void) | null = null;
        onerror: ((event?: Event) => void) | null = null;
        constructor(url: string) {
          this.url = url;
          registerSocket(url, this);
          queueMicrotask(() => this.onopen?.());
        }
        send(data?: string) {
          if (!data) return;
          const messages = sentMessages.get(this.url) || [];
          messages.push(data);
          sentMessages.set(this.url, messages);
        }
        close() {
          this.readyState = MockWebSocket.CLOSED;
          unregisterSocket(this.url, this);
          this.onclose?.();
        }
        addEventListener(type: string, handler: EventListener) {
          if (type === "open") queueMicrotask(() => handler(new Event("open")));
        }
        removeEventListener() {}
      }

      Object.defineProperty(window, "__mockSocketApi", {
        configurable: true,
        writable: true,
        value: {
          emit(targetUrlPart: string, payload: unknown) {
            for (const [url, sockets] of socketRegistry.entries()) {
              if (!url.includes(targetUrlPart)) continue;
              for (const socket of sockets) {
                if (socket.readyState !== MockWebSocket.OPEN) continue;
                socket.onmessage?.(
                  new MessageEvent("message", {
                    data: JSON.stringify(payload),
                  })
                );
              }
            }
          },
          getConnectionCount(targetUrlPart: string) {
            let count = 0;
            for (const [url, sockets] of socketRegistry.entries()) {
              if (url.includes(targetUrlPart)) {
                count += sockets.size;
              }
            }
            return count;
          },
          getSentMessages(targetUrlPart: string) {
            const matches: string[] = [];
            for (const [url, messages] of sentMessages.entries()) {
              if (url.includes(targetUrlPart)) {
                matches.push(...messages);
              }
            }
            return matches;
          },
        },
      });

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
    { user }
  );

  await page.route(`${apiOrigin}/api/profile/`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(user),
    });
  });

  await page.route(`${apiOrigin}/api/conversations/`, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(conversations),
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
        body: JSON.stringify(conversationDetail),
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
        body: JSON.stringify(messagesPage),
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

  await page.route(`${apiOrigin}/api/coach/chat/`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockCoachReply),
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

  test("captures desktop coach chat state", async ({ page }) => {
    await installMockChatTransport(page);
    await page.goto("/conversations/coach");

    await expect(page.getByRole("heading", { name: "Lumi" })).toBeVisible();
    await page.getByRole("button", { name: "Correct my last sentence and explain why." }).click();
    await expect(page.getByText(/Privet! Excellent idea\./).last()).toBeVisible();
    await expect(page.getByRole("button", { name: "Show coach tools" })).toBeVisible();

    await saveScreenshot(page, "coach-desktop.png");
  });

  test("captures mobile coach chat state", async ({ browser }) => {
    const context = await browser.newContext({
      ...devices["iPhone 13"],
    });
    const page = await context.newPage();

    await installMockChatTransport(page);
    await page.goto(`${appOrigin}/conversations/coach`);

    await expect(page.getByRole("heading", { name: "Lumi" })).toBeVisible();
    await page.getByRole("button", { name: "Correct my last sentence and explain why." }).click();
    await expect(page.getByText(/Privet! Excellent idea\./).last()).toBeVisible();

    await saveScreenshot(page, "coach-mobile.png");
    await context.close();
  });

  test("stops typing when the chat input is cleared", async ({ page }) => {
    await installMockChatTransport(page);
    await page.goto("/conversations/42");

    const composer = page.getByPlaceholder("Type your message...");
    await expect(composer).toBeVisible();

    await composer.fill("Practising Greek");
    await expect
      .poll(async () => {
        const messages = await getSocketMessages(page, "/ws/socket-server/42/");
        return messages.some((message) => JSON.parse(message).type === "user_typing");
      })
      .toBeTruthy();

    await composer.clear();
    await expect
      .poll(async () => {
        const messages = await getSocketMessages(page, "/ws/socket-server/42/");
        return messages.some(
          (message) => JSON.parse(message).type === "user_stopped_typing"
        );
      })
      .toBeTruthy();
  });

  test("announces typing on load when the composer already has draft text", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("chat:draft:42", "This is still in progress");
    });

    await installMockChatTransport(page);
    await page.goto("/conversations/42");

    await expect
      .poll(async () => {
        const messages = await getSocketMessages(page, "/ws/socket-server/42/");
        return messages.some((message) => JSON.parse(message).type === "user_typing");
      })
      .toBeTruthy();
  });

  test("does not show typing indicator for the current user's own typing events", async ({
    page,
  }) => {
    await installMockChatTransport(page);
    await page.goto("/conversations/42");

    await expect(page.getByRole("heading", { name: "maya" })).toBeVisible();
    await expect(page.getByText("Typing...")).toHaveCount(0);

    await page.evaluate(() => {
      const socketApi = (window as typeof window & {
        __mockSocketApi?: {
          emit: (match: string, payload: unknown) => void;
        };
      }).__mockSocketApi;

      socketApi?.emit("/ws/socket-server/42/", {
        type: "user_typing",
        senderId: 7,
      });
      socketApi?.emit("/ws/presence/", {
        type: "typing_status",
        conversation_id: 42,
        sender_id: 7,
        is_typing: true,
      });
    });

    await expect(page.getByText("Typing...")).toHaveCount(0);

    await page.evaluate(() => {
      const socketApi = (window as typeof window & {
        __mockSocketApi?: {
          emit: (match: string, payload: unknown) => void;
        };
      }).__mockSocketApi;

      socketApi?.emit("/ws/socket-server/42/", {
        type: "user_typing",
        senderId: 12,
      });
    });

    await expect(page.getByText("Typing...")).toBeVisible();
  });

  test("removes the online dot after logout presence update", async ({ browser }) => {
    const context = await browser.newContext();
    const viewerPage = await context.newPage();
    const actorPage = await context.newPage();
    let offlineRequestCount = 0;

    await installMockChatTransport(viewerPage, { user: mockViewerUser });
    await installMockChatTransport(actorPage, { user: mockUser });

    await actorPage.route(`${apiOrigin}/api/presence/offline/`, async (route) => {
      offlineRequestCount += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });

    await Promise.all([
      viewerPage.goto(`${appOrigin}/conversations/42`),
      actorPage.goto(`${appOrigin}/conversations/42`),
    ]);

    await expect(viewerPage.getByRole("heading", { name: "dinos" })).toBeVisible();
    await expect
      .poll(() =>
        viewerPage.evaluate(() => {
          const socketApi = (window as typeof window & {
            __mockSocketApi?: {
              getConnectionCount: (match: string) => number;
            };
          }).__mockSocketApi;

          return socketApi?.getConnectionCount("/ws/presence/") || 0;
        })
      )
      .toBeGreaterThan(0);

    const onlineDot = viewerPage.getByLabel("User online");
    await expect
      .poll(async () => {
        await viewerPage.evaluate(() => {
          const socketApi = (window as typeof window & {
            __mockSocketApi?: {
              emit: (match: string, payload: unknown) => void;
            };
          }).__mockSocketApi;

          socketApi?.emit("/ws/presence/", {
            type: "presence_update",
            user_id: 7,
            is_online: true,
          });
        });

        return viewerPage.locator('[aria-label="User online"]').count();
      })
      .toBe(1);

    await actorPage.getByRole("button", { name: /profile avatar dinos/i }).click();
    await actorPage.getByRole("menuitem", { name: "Sign out" }).click();

    await expect
      .poll(() => offlineRequestCount)
      .toBe(1);

    await viewerPage.evaluate(() => {
      const socketApi = (window as typeof window & {
        __mockSocketApi?: {
          emit: (match: string, payload: unknown) => void;
        };
      }).__mockSocketApi;

      socketApi?.emit("/ws/presence/", {
        type: "presence_update",
        user_id: 7,
        is_online: false,
      });
    });

    await expect(onlineDot).toBeHidden();
    await context.close();
  });

  test("coach quick starts hide after conversation begins and return on new conversation", async ({
    page,
  }) => {
    await installMockChatTransport(page);
    await page.goto("/conversations/coach");

    const quickStart = page.getByRole("button", {
      name: "Correct my last sentence and explain why.",
    });
    await expect(quickStart).toBeVisible();

    await quickStart.click();
    await expect(page.getByText(/Privet! Excellent idea\./).last()).toBeVisible();
    await expect(quickStart).toBeHidden();

    await page.getByRole("button", { name: "Show coach tools" }).click();
    await page.getByRole("button", { name: "New conversation" }).click();

    await expect(page.getByRole("button", { name: "Correct my last sentence and explain why." })).toBeVisible();
  });
});
