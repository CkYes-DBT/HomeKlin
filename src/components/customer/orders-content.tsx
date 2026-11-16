import { CircleAlert } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/auth/dal";
import { listMyOrders, type CustomerOrder } from "@/lib/booking/orders";
import { getCatalogServices, getServiceAreas } from "@/lib/catalog/cached";
import type { Service, ServiceArea } from "@/lib/catalog/catalog";
import { readPaymentState } from "@/lib/payment/state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseBookedOrderId, parseOpenedOrderId } from "./booking-query";
import { flowOutlineButton } from "./flow-styles";
import { BackToList, OrderDetails } from "./order-details";
import { OrdersOverview } from "./orders-overview";
import { PaymentConfirmed, PaymentStep } from "./payment-step";
import { cameBackFromPayment } from "./payment-query";
import { ServiceDuration } from "./service-duration";

type SearchParams = Record<string, string | string[] | undefined>;

/** What the customer's orders pages read: their orders, the catalog's names and who is signed in. */
export async function readCustomerOrders(): Promise<
  { orders: CustomerOrder[]; services: Service[]; areas: ServiceArea[]; account: { name: string; email: string } } | null
> {
  try {
    const client = await createSupabaseServerClient({ writeCookies: false });
    const [orders, services, areas, user, claims] = await Promise.all([
      listMyOrders(client),
      getCatalogServices(),
      getServiceAreas(),
      getCurrentUser(),
      client.auth.getClaims(),
    ]);
    const email = claims.data?.claims.email;
    return { orders, services, areas, account: { name: user?.fullName ?? "", email: typeof email === "string" ? email : "" } };
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return null;
  }
}

// The content of /orders for a signed-in customer, inside the page's role check (D5 after the
// Customer-* mocks). Without an order in the address: "Pesanan Anda" (./orders-overview.tsx). Right
// after booking (/orders?booked=<order id>, where the order actions send the customer) it is step 3,
// the payment (./payment-step.tsx), and once Midtrans' signed notification has marked it paid, the
// confirmation; Midtrans sends the customer back to the same address. An order opened from the list is
// /orders?order=<order id>, the order's own page (./order-details.tsx). Everything is read with the
// customer's own session through listMyOrders, which returns only their own orders and never the
// agency, so another customer's id in the address finds nothing and falls back to the list.
export async function OrdersContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const locale = await getLocale();
  const bookedId = parseBookedOrderId(params);
  const wantedId = bookedId ?? parseOpenedOrderId(params);

  const read = await readCustomerOrders();
  if (!read) return <OrdersContentUnavailable />;
  const { orders, services, areas, account } = read;

  // One clock for the whole page: whether a recording is still kept, and its countdown (T15).
  const now = new Date();
  // A service switched off since booking is no longer in the catalog; the order keeps its price.
  const serviceOf = (order: CustomerOrder) => services.find((candidate) => candidate.id === order.serviceId);
  const serviceName = (order: CustomerOrder) => serviceOf(order)?.name[locale];

  const order = orders.find((candidate) => candidate.id === wantedId);
  if (order) {
    const areaName = areas.find((candidate) => candidate.id === order.areaId)?.name[locale] ?? order.areaId;
    if (bookedId) {
      // The method already charged for a waiting order, so a reload shows the same account number or QR code.
      const details = order.status === "pending_payment" ? await readPaymentState(await createSupabaseServerClient({ writeCookies: false }), order.id) : null;
      return (
        <div className="flex flex-col gap-4">
          <BackToList />
          {order.status === "paid" ? (
            <PaymentConfirmed order={order} serviceName={serviceName(order)} areaName={areaName} />
          ) : (
            <PaymentStep order={order} serviceName={serviceName(order)} areaName={areaName} cameBackFromPayment={cameBackFromPayment(params)} details={details} />
          )}
        </div>
      );
    }
    const service = serviceOf(order);
    return (
      <OrderDetails
        order={order}
        serviceName={service?.name[locale]}
        duration={service ? <ServiceDuration minutes={service.durationMinutes} /> : undefined}
        areaName={areaName}
        now={now}
      />
    );
  }
  return <OrdersOverview orders={orders} serviceName={serviceName} account={account} now={now} />;
}

export async function OrdersContentUnavailable() {
  const t = await getTranslations("OrderConfirmation");
  return (
    <EmptyState tone="forest" icon={CircleAlert} title={t("errorTitle")}>
      {t("errorBody")}
      <span className="mt-4 flex justify-center">
        {/* A plain link on purpose: a full page load reads the order again. */}
        <a href="" className={flowOutlineButton}>
          {t("retry")}
        </a>
      </span>
    </EmptyState>
  );
}
