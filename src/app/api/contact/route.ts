import { db } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const contactFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().email("Please provide a valid email address"),
  subject: z.string().max(150).optional().default("General Inquiry"),
  message: z.string().min(10, "Message must be at least 10 characters").max(4000),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = contactFormSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { name, email, subject, message } = parsed.data;

    const savedMessage = await db.contactMessage.create({
      data: {
        name,
        email,
        subject: subject || "General Inquiry",
        message,
        status: "UNREAD",
      },
    });

    return NextResponse.json({
      success: true,
      message: "Your message has been received! Our support team will get back to you shortly.",
      id: savedMessage.id,
    });
  } catch (error) {
    console.error("Error submitting contact form:", error);
    return NextResponse.json(
      { error: "Failed to send message. Please try again." },
      { status: 500 }
    );
  }
}

