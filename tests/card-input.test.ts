import { describe, expect, it } from "vitest";
import { formatCardNumber, formatExpiry, parseCard } from "@/components/customer/card-input";
import { isMidtransAddress, readPaymentDetails } from "@/lib/payment/methods";

// The card fields of the payment step (src/components/customer/card-input.ts) and the reading of the
// payment details a page shows (src/lib/payment/methods.ts). The card number only ever lives in the
// browser: these helpers shape it for Midtrans' tokenizer and never send it anywhere.

describe("formatCardNumber", () => {
  it("groups the digits by four and drops everything else", () => {
    expect(formatCardNumber("4811111111111114")).toBe("4811 1111 1111 1114");
    expect(formatCardNumber("4811-1111 abc 11")).toBe("4811 1111 11");
  });

  it("stops at 19 digits, the longest card number", () => {
    expect(formatCardNumber("1".repeat(25)).replaceAll(" ", "")).toHaveLength(19);
  });
});

describe("formatExpiry", () => {
  it("puts the slash in by itself while typing", () => {
    expect(formatExpiry("1")).toBe("1");
    expect(formatExpiry("12")).toBe("12");
    expect(formatExpiry("122")).toBe("12/2");
    expect(formatExpiry("1228")).toBe("12/28");
    expect(formatExpiry("12/28")).toBe("12/28");
    expect(formatExpiry("12282028")).toBe("12/2820");
  });
});

describe("parseCard", () => {
  const good = { number: "4811 1111 1111 1114", expiry: "12/28", cvv: "123" };

  it("makes the fields Midtrans' tokenizer wants: digits only, a two-digit month and a four-digit year", () => {
    expect(parseCard(good)).toEqual({ card_number: "4811111111111114", card_exp_month: "12", card_exp_year: "2028", card_cvv: "123" });
    expect(parseCard({ ...good, expiry: "1/2028" })).toBeNull();
    expect(parseCard({ ...good, expiry: "01/2031" })).toMatchObject({ card_exp_month: "01", card_exp_year: "2031" });
  });

  it("refuses what cannot be a card before asking Midtrans: number length, month 13, a missing CVV", () => {
    expect(parseCard({ ...good, number: "4811 1111" })).toBeNull();
    expect(parseCard({ ...good, expiry: "13/28" })).toBeNull();
    expect(parseCard({ ...good, expiry: "00/28" })).toBeNull();
    expect(parseCard({ ...good, cvv: "12" })).toBeNull();
    expect(parseCard({ ...good, cvv: "12a" })).toBeNull();
  });
});

describe("readPaymentDetails", () => {
  const expiresAt = "2026-11-16T10:45:44.000Z";

  it("reads each kind of details the server keeps", () => {
    expect(readPaymentDetails({ method: "qris", qrUrl: "https://api.sandbox.midtrans.com/v2/qris/a/qr-code", expiresAt })).toEqual({
      method: "qris", qrUrl: "https://api.sandbox.midtrans.com/v2/qris/a/qr-code", expiresAt,
    });
    expect(readPaymentDetails({ method: "bank", bank: "bca", vaNumber: "22129765566838381184611", expiresAt })).toEqual({
      method: "bank", bank: "bca", vaNumber: "22129765566838381184611", expiresAt,
    });
    expect(readPaymentDetails({ method: "bank", bank: "mandiri", billerCode: "70012", billKey: "100921976939", expiresAt })).toEqual({
      method: "bank", bank: "mandiri", billerCode: "70012", billKey: "100921976939", expiresAt,
    });
    expect(readPaymentDetails({ method: "card" })).toEqual({ method: "card" });
  });

  it("shows nothing it cannot trust: no details, an unknown method, a QR code from another site, a missing number", () => {
    expect(readPaymentDetails(null)).toBeNull();
    expect(readPaymentDetails("qris")).toBeNull();
    expect(readPaymentDetails({ method: "cash" })).toBeNull();
    expect(readPaymentDetails({ method: "qris", qrUrl: "https://evil.example/qr", expiresAt })).toBeNull();
    expect(readPaymentDetails({ method: "bank", bank: "bca", expiresAt })).toBeNull();
    expect(readPaymentDetails({ method: "bank", bank: "bca", vaNumber: "12 34; drop table", expiresAt })).toBeNull();
    expect(readPaymentDetails({ method: "bank", bank: "mandiri", vaNumber: "123456", expiresAt })).toBeNull();
  });

  it("drops an expiry that is not a date instead of showing it", () => {
    expect(readPaymentDetails({ method: "bank", bank: "bni", vaNumber: "9882212948834654", expiresAt: "soon" })).toMatchObject({ expiresAt: null });
  });
});

describe("isMidtransAddress", () => {
  it("accepts only https pages of Midtrans (and its older name, Veritrans)", () => {
    expect(isMidtransAddress("https://api.sandbox.midtrans.com/v2/qris/a/qr-code")).toBe(true);
    expect(isMidtransAddress("https://merchants-app.sbx.midtrans.com/v4/qris/gopay/A1/qr-code")).toBe(true);
    expect(isMidtransAddress("https://api.sandbox.veritrans.co.id/v2/token/rba/redirect/x")).toBe(true);
    for (const bad of ["http://api.sandbox.midtrans.com/x", "https://midtrans.com.evil.example/x", "https://evil.example/midtrans.com/", "javascript:alert(1)", "//api.sandbox.midtrans.com/x"]) {
      expect(isMidtransAddress(bad)).toBe(false);
    }
  });
});
