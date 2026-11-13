import { NextResponse } from "next/server";
import { resolveServerGeoCurrency } from "@/lib/geo-currency";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const geo = await resolveServerGeoCurrency();
  return NextResponse.json(geo, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

