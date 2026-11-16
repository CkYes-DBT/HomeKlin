import type { CardData } from "./card-input";

// Paying by card in the browser: Midtrans' own script (midtrans-new-3ds.min.js, the Sandbox copy) swaps
// the card for a one-time token, so the number never reaches HomeKlin's server, and shows the bank's
// 3-D Secure step. It needs the public client key (MIDTRANS_CLIENT_KEY, safe to show in a page), which
// the server hands to the page. The script is loaded only when the customer picks "Kartu".
// Sources: https://docs.midtrans.com/docs/core-api-card-payment-integration and
// https://docs.midtrans.com/reference/getting-the-card-token (MidtransNew3ds.getCardToken, .authenticate)

const scriptUrl = "https://api.sandbox.midtrans.com/v2/assets/js/midtrans-new-3ds.min.js";

type Handlers = { onSuccess?: (response: Record<string, unknown>) => void; onFailure?: (response: Record<string, unknown>) => void; onPending?: (response: Record<string, unknown>) => void };

type MidtransNew3ds = {
  getCardToken: (card: CardData, handlers: Handlers) => void;
  authenticate: (redirectUrl: string, handlers: Handlers & { performAuthentication: (url: string) => void }) => void;
};

declare global {
  interface Window {
    MidtransNew3ds?: MidtransNew3ds;
  }
}

let loading: Promise<MidtransNew3ds> | null = null;

/** Loads Midtrans' card script once; rejects when it cannot be loaded (offline, blocked). */
export function loadCardScript(clientKey: string): Promise<MidtransNew3ds> {
  if (window.MidtransNew3ds) return Promise.resolve(window.MidtransNew3ds);
  loading ??= new Promise<MidtransNew3ds>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = "midtrans-script";
    script.src = scriptUrl;
    script.dataset.environment = "sandbox";
    script.dataset.clientKey = clientKey;
    script.onload = () => (window.MidtransNew3ds ? resolve(window.MidtransNew3ds) : reject(new Error("unavailable")));
    script.onerror = () => reject(new Error("unavailable"));
    document.head.append(script);
  }).catch((error: unknown) => {
    // A failed load may be tried again by the next press.
    loading = null;
    document.getElementById("midtrans-script")?.remove();
    throw error;
  });
  return loading;
}

export type CardError = "card_invalid" | "card_unavailable";

/** The one-time token for a card. Rejects with "card_invalid" (Midtrans did not accept the card) or "card_unavailable". */
export async function getCardToken(clientKey: string, card: CardData): Promise<string> {
  let midtrans: MidtransNew3ds;
  try {
    midtrans = await loadCardScript(clientKey);
  } catch {
    throw new Error("card_unavailable" satisfies CardError);
  }
  return new Promise<string>((resolve, reject) => {
    midtrans.getCardToken(card, {
      onSuccess: (response) => (typeof response.token_id === "string" ? resolve(response.token_id) : reject(new Error("card_unavailable"))),
      onFailure: () => reject(new Error("card_invalid" satisfies CardError)),
    });
  });
}

/**
 * Shows the bank's 3-D Secure page (the caller puts the address in a frame) and says how it ended. The
 * order's status still comes only from Midtrans' signed notification; this only closes the frame.
 */
export function authenticateCard(redirectUrl: string, show: (url: string) => void): Promise<"success" | "failure" | "pending"> {
  const midtrans = window.MidtransNew3ds;
  if (!midtrans) return Promise.resolve("failure");
  return new Promise((resolve) => {
    midtrans.authenticate(redirectUrl, {
      performAuthentication: show,
      onSuccess: () => resolve("success"),
      onFailure: () => resolve("failure"),
      onPending: () => resolve("pending"),
    });
  });
}
