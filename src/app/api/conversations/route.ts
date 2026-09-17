import { NextResponse } from "next/server";

import { db } from "../../../lib/db";
import {
  ExecutiveAuthenticationError,
  resolveAuthenticatedExecutiveContext
} from "../../../lib/auth/executive-session-context";

const MAX_RESULTS = 30;

export async function GET(request: Request) {
  try {
    const auth = await resolveAuthenticatedExecutiveContext(request);

    const conversations = await db.executiveConversation.findMany({
      where: {
        userId: auth.actorUserId,
        organizationId: auth.organizationId
      },
      orderBy: { updatedAt: "desc" },
      take: MAX_RESULTS,
      select: { id: true, createdAt: true, updatedAt: true }
    });

    return NextResponse.json(
      {
        ok: true,
        conversations: conversations.map((conversation) => ({
          id: conversation.id,
          title: new Date(conversation.createdAt).toLocaleString("tr-TR", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit"
          }),
          lastMessageAt: conversation.updatedAt.toISOString()
        }))
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof ExecutiveAuthenticationError) {
      return NextResponse.json(
        { ok: false, code: error.code },
        { status: error.status, headers: { "Cache-Control": "no-store" } }
      );
    }

    throw error;
  }
}
