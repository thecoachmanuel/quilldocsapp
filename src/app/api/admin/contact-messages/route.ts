import { db } from "@/db";
import { getUserSessionWithRBAC } from "@/lib/auth-rbac";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await getUserSessionWithRBAC();
    if (!session.isAdmin) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const messages = await db.contactMessage.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({ messages });
  } catch (error) {
    console.error("Error fetching admin contact messages:", error);
    return NextResponse.json({ error: "Failed to fetch contact messages" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getUserSessionWithRBAC();
    if (!session.isAdmin) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const { id, status } = await req.json();
    if (!id || !status) {
      return NextResponse.json({ error: "Missing required parameters: id, status" }, { status: 400 });
    }

    const updated = await db.contactMessage.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json({ success: true, message: updated });
  } catch (error) {
    console.error("Error updating contact message status:", error);
    return NextResponse.json({ error: "Failed to update contact message" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getUserSessionWithRBAC();
    if (!session.isAdmin) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing required message id" }, { status: 400 });
    }

    await db.contactMessage.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting contact message:", error);
    return NextResponse.json({ error: "Failed to delete contact message" }, { status: 500 });
  }
}

