import { headers } from "next/headers";
import {
  grantUserProAccess,
  verifyPaystackSignature,
} from "@/lib/paystack";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = headers().get("x-paystack-signature") || "";

    if (!verifyPaystackSignature(rawBody, signature)) {
      console.warn("[paystack webhook] Invalid signature rejected.");
      return new Response("Invalid signature", { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const eventType = payload.event;
    const eventData = payload.data;

    console.log(`[paystack webhook] Received event: ${eventType}`);

    if (eventType === "charge.success") {
      const userId =
        eventData?.metadata?.userId ||
        eventData?.metadata?.user_id ||
        eventData?.metadata?.custom_fields?.find(
          (f: any) => f.variable_name === "user_id"
        )?.value;

      const reference = eventData?.reference;
      const customerCode = eventData?.customer?.customer_code;

      if (userId && reference) {
        await grantUserProAccess(userId, reference, customerCode);
        console.log(
          `[paystack webhook] Successfully granted PRO access to user ${userId} for ref ${reference}`
        );
      } else {
        console.warn(
          "[paystack webhook] charge.success missing userId or reference in metadata:",
          eventData
        );
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[paystack webhook] Error handling webhook:", err);
    return new Response(
      `Webhook Error: ${err?.message || "Internal Server Error"}`,
      { status: 400 }
    );
  }
}

