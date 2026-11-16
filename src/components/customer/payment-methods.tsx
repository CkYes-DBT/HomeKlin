"use client";

import { Building2, Check, CreditCard, QrCode, ShieldCheck, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { banks, type Bank } from "@/lib/payment/methods";
import { formatCardNumber, formatExpiry, type CardFields } from "./card-input";
import { flowCardTitle, flowInput } from "./flow-styles";

export type MethodKey = "qris" | "bank" | "card";

type Props = {
  method: MethodKey;
  onMethod: (method: MethodKey) => void;
  bank: Bank;
  onBank: (bank: Bank) => void;
  card: CardFields;
  onCard: (card: CardFields) => void;
  /** Cards need Midtrans' public client key; without it the option is left out. */
  cardAvailable: boolean;
  disabled: boolean;
};

const icons: Record<MethodKey, LucideIcon> = { qris: QrCode, bank: Building2, card: CreditCard };

// The ways to pay on the payment step (mocks Customer-Payment and Phone-Payment): QRIS, a bank's virtual
// account with the bank to choose, and a card. One is chosen with a radio button; a bank shows its
// banks as chips and a card shows its three fields. The card fields belong to no form and have no
// `name`: what is typed stays in this browser until Midtrans' script swaps it for a token
// (midtrans-card.ts), and the fields are emptied once that is done.
export function PaymentMethods({ method, onMethod, bank, onBank, card, onCard, cardAvailable, disabled }: Props) {
  const t = useTranslations("PaymentChooser");
  const keys: MethodKey[] = cardAvailable ? ["qris", "bank", "card"] : ["qris", "bank"];

  return (
    <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-3">
      <legend className={`${flowCardTitle} mb-3`}>{t("methodsTitle")}</legend>
      {keys.map((key) => {
        const Icon = icons[key];
        return (
          <div
            key={key}
            className="rounded-lg bg-card inset-ring-[1.5px] inset-ring-transparent transition-shadow duration-150 ease-out-quart has-[input[name=method]:checked]:inset-ring-2 has-[input[name=method]:checked]:inset-ring-primary has-[input[name=method]:focus-visible]:outline-2 has-[input[name=method]:focus-visible]:outline-offset-2 has-[input[name=method]:focus-visible]:outline-focus"
          >
            <label className="relative flex min-h-touch cursor-pointer items-center gap-4 p-4 md:px-6 md:py-5 has-disabled:cursor-not-allowed has-disabled:opacity-60">
              <input
                type="radio"
                name="method"
                value={key}
                checked={method === key}
                onChange={() => onMethod(key)}
                className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-lg opacity-0 disabled:cursor-not-allowed"
              />
              <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-md bg-lime-wash text-on-lime-wash">
                <Icon className="size-5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold text-ink">{t(`methods.${key}.title`)}</span>
                <span className="text-sm text-ink-muted">{t(`methods.${key}.body`)}</span>
              </span>
              <span
                aria-hidden="true"
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-field text-on-primary inset-ring-[1.5px] inset-ring-border-control transition-colors duration-150 ease-out-quart peer-checked:bg-primary peer-checked:inset-ring-primary"
              >
                {method === key ? <Check className="size-3.5" strokeWidth={3} /> : null}
              </span>
            </label>

            {key === "bank" && method === "bank" ? (
              <fieldset className="flex flex-col gap-3 px-4 pb-5 md:px-6">
                <legend className="mb-3 text-sm font-semibold text-ink">{t("bankLegend")}</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {banks.map((option) => (
                    <label
                      key={option}
                      className="relative flex min-h-touch cursor-pointer items-center justify-center gap-1.5 rounded-full bg-card px-4 text-sm font-semibold text-ink inset-ring-[1.5px] inset-ring-outline transition-colors duration-150 ease-out-quart hover:bg-sunken active:bg-lime-wash has-checked:bg-primary has-checked:text-on-primary has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus has-disabled:cursor-not-allowed has-disabled:opacity-60"
                    >
                      <input
                        type="radio"
                        name="bank"
                        value={option}
                        checked={bank === option}
                        onChange={() => onBank(option)}
                        className="peer absolute inset-0 z-10 size-full cursor-pointer appearance-none rounded-full opacity-0 disabled:cursor-not-allowed"
                      />
                      <Check className="hidden size-4 shrink-0 peer-checked:block" strokeWidth={2.5} aria-hidden="true" />
                      {t(`banks.${option}`)}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}

            {key === "card" && method === "card" ? (
              <div className="flex flex-col gap-4 px-4 pb-5 md:px-6">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="card-number" className="text-sm font-semibold text-ink">
                    {t("card.number")}
                  </label>
                  <input
                    id="card-number"
                    type="text"
                    inputMode="numeric"
                    autoComplete="cc-number"
                    placeholder="4811 1111 1111 1114"
                    value={card.number}
                    onChange={(event) => onCard({ ...card, number: formatCardNumber(event.target.value) })}
                    className={`${flowInput} min-h-13 tabular-nums`}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="card-expiry" className="text-sm font-semibold text-ink">
                      {t("card.expiry")}
                    </label>
                    <input
                      id="card-expiry"
                      type="text"
                      inputMode="numeric"
                      autoComplete="cc-exp"
                      placeholder="12/28"
                      value={card.expiry}
                      onChange={(event) => onCard({ ...card, expiry: formatExpiry(event.target.value) })}
                      className={`${flowInput} min-h-13 tabular-nums`}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="card-cvv" className="text-sm font-semibold text-ink">
                      {t("card.cvv")}
                    </label>
                    <input
                      id="card-cvv"
                      type="password"
                      inputMode="numeric"
                      autoComplete="cc-csc"
                      maxLength={4}
                      placeholder="123"
                      value={card.cvv}
                      onChange={(event) => onCard({ ...card, cvv: event.target.value.replace(/\D/g, "") })}
                      className={`${flowInput} min-h-13 tabular-nums`}
                    />
                  </div>
                </div>
                <p className="flex items-start gap-2.5 text-sm text-ink-muted">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>{t("card.secure")}</span>
                </p>
                <p className="rounded-sm bg-warning-surface px-3 py-2 text-sm text-warning">{t("card.test")}</p>
              </div>
            ) : null}
          </div>
        );
      })}
    </fieldset>
  );
}
