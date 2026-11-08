import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { GSI_SCRIPT_SRC, GoogleSignInButton, resetGoogleIdentityForTests } from "./googleIdentity";

const gsiScripts = () => Array.from(document.querySelectorAll(`script[src="${GSI_SCRIPT_SRC}"]`)) as HTMLScriptElement[];

describe("GoogleSignInButton", () => {
  const originalClientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;

  beforeEach(() => {
    resetGoogleIdentityForTests();
    gsiScripts().forEach((script) => script.remove());
    delete window.google;
  });

  afterEach(() => {
    if (originalClientId === undefined) delete process.env.REACT_APP_GOOGLE_CLIENT_ID;
    else process.env.REACT_APP_GOOGLE_CLIENT_ID = originalClientId;
  });

  test("renders nothing and loads no script without a client id", () => {
    delete process.env.REACT_APP_GOOGLE_CLIENT_ID;
    const { container } = render(<GoogleSignInButton onCredential={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
    expect(gsiScripts()).toHaveLength(0);
  });

  test("loads the GIS script once, renders Google's button and forwards the credential", async () => {
    process.env.REACT_APP_GOOGLE_CLIENT_ID = "client-id";
    const onCredential = jest.fn();
    let callback: ((response: { credential?: string }) => void) | undefined;
    const googleId = {
      initialize: jest.fn((config) => {
        callback = config.callback;
      }),
      renderButton: jest.fn(),
    };

    render(
      <>
        <GoogleSignInButton onCredential={onCredential} />
        <GoogleSignInButton onCredential={onCredential} text="signin_with" />
      </>
    );
    expect(gsiScripts()).toHaveLength(1);

    window.google = { accounts: { id: googleId } };
    act(() => {
      gsiScripts()[0].onload?.(new Event("load"));
    });

    await waitFor(() => expect(googleId.renderButton).toHaveBeenCalledTimes(2));
    expect(googleId.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: "client-id", ux_mode: "popup", auto_select: false, itp_support: true })
    );
    expect(googleId.renderButton.mock.calls[0][1]).toMatchObject({ text: "continue_with", shape: "pill", width: 320 });

    callback?.({ credential: "id-token" });
    expect(onCredential).toHaveBeenCalledWith("id-token");
  });

  test("shows a short message when the script fails to load", async () => {
    process.env.REACT_APP_GOOGLE_CLIENT_ID = "client-id";
    render(<GoogleSignInButton onCredential={jest.fn()} />);
    act(() => {
      gsiScripts()[0].onerror?.(new Event("error"));
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Google sign-in couldn't load");
    // The failed tag is removed so a later mount can retry.
    expect(gsiScripts()).toHaveLength(0);
  });
});
