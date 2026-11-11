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

export interface InitializePaystackParams {
  email: string;
  amountKobo?: number;
  callbackUrl: string;
  userId: string;
  planSlug?: string;
}

/**
 * Initializes a checkout session with Paystack.
 * Directly supports NGN cards (Mastercard, Visa, Verve), Bank Transfers,
 * USSD, OPay, and International cards (USD, GBP, EUR Visa/Mastercard/Apple Pay)
 * with automatic FX conversion settling into standard Nigerian bank accounts.
 */
export async function initializePaystackTransaction(
  params: InitializePaystackParams
) {
  const secretKey = getPaystackSecretKey();
  if (!secretKey) {
    throw new Error("Paystack secret key is not configured.");
  }

  const amount = Math.round(params.amountKobo || PAYSTACK_PRO_AMOUNT_KOBO);
  const email = params.email?.trim();

  if (!email) {
    throw new Error("A valid user email is required to initialize Paystack checkout.");
  }

  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount,
      currency: "NGN",
      callback_url: params.callbackUrl,
      metadata: {
        userId: params.userId,
        planSlug: params.planSlug || "pro",
        custom_fields: [
          {
            display_name: "Plan",
            variable_name: "plan",
            value: "QuillDocs Pro (Monthly)",
          },
          {
            display_name: "User ID",
            variable_name: "user_id",
            value: params.userId,
          },
        ],
      },
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.status || !data?.data?.authorization_url) {
    const baseMsg =
      data?.message || `Paystack initialization failed (HTTP ${res.status}).`;
    if (res.status === 401) {
      throw new Error(
        `Paystack rejected PAYSTACK_SECRET_KEY (${baseMsg}). Check your live/test secret key in environment variables.`
      );
    }
    throw new Error(baseMsg);
  }

  return {
    authorization_url: data.data.authorization_url as string,
    access_code: data.data.access_code as string,
    reference: data.data.reference as string,
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
  customerCode?: string
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
  if (existingUser.stripeSubscriptionId === normalizedSubId) {
    return existingUser;
  }

  const currentEnd =
    existingUser.stripeCurrentPeriodEnd &&
    new Date(existingUser.stripeCurrentPeriodEnd).getTime() > Date.now()
      ? new Date(existingUser.stripeCurrentPeriodEnd).getTime()
      : Date.now();

  const newPeriodEnd = new Date(currentEnd + 30 * 24 * 60 * 60 * 1000);

  const updatedUser = await db.user.update({
    where: { id: userId },
    data: {
      stripePriceId: "pro",
      stripeSubscriptionId: normalizedSubId,
      stripeCustomerId:
        customerCode ||
        existingUser.stripeCustomerId ||
        `cus_ps_${userId.slice(0, 8)}`,
      stripeCurrentPeriodEnd: newPeriodEnd,
    },
  });

  console.log(
    `[paystack] Upgraded user ${userId} to PRO until ${newPeriodEnd.toISOString()}`
  );
  return updatedUser;
}

