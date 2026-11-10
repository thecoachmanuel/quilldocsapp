import { db, DEFAULT_CONTACT_INFO } from "@/db";
import { getUserSessionWithRBAC } from "@/lib/auth-rbac";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const contactInfoSchema = z.object({
  email: z.string().email("Please provide a valid support email"),
  phone: z.string().min(5, "Phone number is too short").max(50),
  address: z.string().min(5, "Address is too short").max(200),
  hours: z.string().min(3, "Hours info is too short").max(100),
});

export async function GET() {
  try {
    const info = (await db.contactInfo.findFirst()) || DEFAULT_CONTACT_INFO;
    return NextResponse.json({ contactInfo: info });
  } catch (error) {
    console.error("Error retrieving contact info:", error);
    return NextResponse.json({ contactInfo: DEFAULT_CONTACT_INFO });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getUserSessionWithRBAC();
    if (!session.isAdmin) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = contactInfoSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { email, phone, address, hours } = parsed.data;

    const updated = await db.contactInfo.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        email,
        phone,
        address,
        hours,
      },
      update: {
        email,
        phone,
        address,
        hours,
      },
    });

    return NextResponse.json({ success: true, contactInfo: updated });
  } catch (error) {
    console.error("Error updating contact info:", error);
    return NextResponse.json({ error: "Failed to update contact info" }, { status: 500 });
  }
}

