import crypto from "crypto";
import { db } from "@/db";

function cleanEnv(value?: string): string {
  return value ? value.replace(/^['"]|['"]$/g, "").trim() : "";
}

export function isPaystackConfigured(): boolean {
  const key = cleanEnv(process.env.PAYSTACK_SECRET_KEY);
  return Boolean(
    key &&
      (key.startsWith("sk_test_") || key.startsWith("sk_live_")) &&
      !key.includes("<your")
  );
}

export function getPaystackSecretKey(): string {
  return cleanEnv(process.env.PAYSTACK_SECRET_KEY);
}

export function getPaystackPublicKey(): string {
  return cleanEnv(process.env.PAYSTACK_PUBLIC_KEY);
}

/**
 * Standard monthly Pro plan price in Kobo (Default: ₦18,000 = 1,800,000 kobo)
 */
export const PAYSTACK_PRO_AMOUNT_KOBO =
  Number(process.env.PAYSTACK_PRO_AMOUNT_KOBO) || 1800000;

/**
 * Standard monthly Pro plan price in USD cents (Default: $14 = 1,400 cents)
 */
export const PAYSTACK_PRO_AMOUNT_USD_CENTS =
  Number(process.env.PAYSTACK_PRO_AMOUNT_USD_CENTS) || 1400;

export type PaystackCurrency = "NGN" | "USD";

export interface InitializePaystackParams {
  email: string;
  amountSubunits?: number;
  amountKobo?: number;
  fallbackAmountKobo?: number;
  currency?: PaystackCurrency;
  callbackUrl: string;
  userId: string;
  planSlug?: string;
  planName?: string;
}

async function requestPaystackInitialize(
  secretKey: string,
  payload: Record<string, unknown>
) {
  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);
  return { res, data };
}

function buildPaystackInitError(status: number, message?: string): Error {
  const baseMsg = message || `Paystack initialization failed (HTTP ${status}).`;
  if (status === 401) {
    return new Error(
      `Paystack rejected PAYSTACK_SECRET_KEY (${baseMsg}). Check your live/test secret key in environment variables.`
    );
  }
  return new Error(baseMsg);
}

/**
 * Initializes a checkout session with Paystack in NGN or USD (when enabled on Paystack).
 * Supports Nigerian local methods in NGN and international cards / Apple Pay in USD,
 * falling back to NGN international card checkout only if USD currency is rejected by the key.
 */
export async function initializePaystackTransaction(
  params: InitializePaystackParams
) {
  const secretKey = getPaystackSecretKey();
  if (!secretKey) {
    throw new Error("Paystack secret key is not configured.");
  }

  const email = params.email?.trim();
  if (!email) {
    throw new Error("A valid user email is required to initialize Paystack checkout.");
  }

  const requestedCurrency: PaystackCurrency =
    params.currency === "USD" ? "USD" : "NGN";
  const primaryAmount = Math.round(
    params.amountSubunits ??
      params.amountKobo ??
      (requestedCurrency === "USD"
        ? PAYSTACK_PRO_AMOUNT_USD_CENTS
        : PAYSTACK_PRO_AMOUNT_KOBO)
  );

  const baseMetadata = {
    userId: params.userId,
    planSlug: params.planSlug || "pro",
    billingCurrency: requestedCurrency,
    custom_fields: [
      {
        display_name: "Plan",
        variable_name: "plan",
        value: `QuillDocs ${params.planName || "Pro"} (Monthly)`,
      },
      {
        display_name: "User ID",
        variable_name: "user_id",
        value: params.userId,
      },
    ],
  };

  let { res, data } = await requestPaystackInitialize(secretKey, {
    email,
    amount: primaryAmount,
    currency: requestedCurrency,
    callback_url: params.callbackUrl,
    metadata: baseMetadata,
  });

  const msgText = String(data?.message || "");
  const isCurrencyRejection =
    (!res.ok || !data?.status) &&
    requestedCurrency === "USD" &&
    Boolean(params.fallbackAmountKobo && params.fallbackAmountKobo > 0) &&
    (res.status === 400 ||
      /currency|not supported|invalid currency|merchant/i.test(msgText));

  let settledCurrency: PaystackCurrency = requestedCurrency;

  if (isCurrencyRejection) {
    console.warn(
      `[paystack] USD currency rejected by Paystack (${msgText}); retrying international checkout in NGN.`
    );
    settledCurrency = "NGN";
    const fallbackRes = await requestPaystackInitialize(secretKey, {
      email,
      amount: Math.round(params.fallbackAmountKobo!),
      currency: "NGN",
      callback_url: params.callbackUrl,
      metadata: {
        ...baseMetadata,
        billingCurrency: "NGN",
        requestedCurrency: "USD",
      },
    });
    res = fallbackRes.res;
    data = fallbackRes.data;
  }

  if (!res.ok || !data?.status || !data?.data?.authorization_url) {
    throw buildPaystackInitError(res.status, data?.message);
  }

  return {
    authorization_url: data.data.authorization_url as string,
    access_code: data.data.access_code as string,
    reference: data.data.reference as string,
    currency: settledCurrency,
  };
}

/**
 * Verifies a transaction reference directly against Paystack's API.
 */
export async function verifyPaystackTransaction(reference: string) {
  const secretKey = getPaystackSecretKey();
  if (!secretKey) {
    throw new Error("Paystack secret key is not configured.");
  }

  const res = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    }
  );

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.status) {
    throw new Error(
      data?.message || `Failed to verify Paystack transaction (HTTP ${res.status}).`
    );
  }

  return data.data;
}

/**
 * Validates the HMAC SHA-512 signature sent with Paystack webhooks.
 */
export function verifyPaystackSignature(
  rawBody: string,
  signature: string
): boolean {
  const secretKey = getPaystackSecretKey();
  if (!secretKey || !signature) return false;

  const hash = crypto
    .createHmac("sha512", secretKey)
    .update(rawBody)
    .digest("hex");

  return hash === signature;
}

/**
 * Grants or extends 30-day Pro access in the database upon successful payment.
 */
export async function grantUserProAccess(
  userId: string,
  reference: string,
  customerCode?: string,
  planSlug?: string
) {
  const existingUser = await db.user.findFirst({
    where: { id: userId },
  });

  if (!existingUser) {
    console.warn(`[paystack] User not found for ID: ${userId}`);
    return null;
  }

  const normalizedSubId = reference.startsWith("paystack_")
    ? reference
    : `paystack_${reference}`;

  // Prevent double-crediting 30 days if both callback verification and webhook fire for the same reference
  if (existingUser.subscriptionId === normalizedSubId) {
    return existingUser;
  }

  const currentEnd =
    existingUser.currentPeriodEnd &&
    new Date(existingUser.currentPeriodEnd).getTime() > Date.now()
      ? new Date(existingUser.currentPeriodEnd).getTime()
      : Date.now();

  const newPeriodEnd = new Date(currentEnd + 30 * 24 * 60 * 60 * 1000);
  const targetPlanSlug =
    planSlug && planSlug !== "free" ? planSlug : "pro";

  const updatedUser = await db.user.update({
    where: { id: userId },
    data: {
      planPriceId: targetPlanSlug,
      subscriptionId: normalizedSubId,
      customerId:
        customerCode ||
        existingUser.customerId ||
        `cus_ps_${userId.slice(0, 8)}`,
      currentPeriodEnd: newPeriodEnd,
    },
  });

  console.log(
    `[paystack] Upgraded user ${userId} to ${targetPlanSlug} until ${newPeriodEnd.toISOString()}`
  );
  return updatedUser;
}

