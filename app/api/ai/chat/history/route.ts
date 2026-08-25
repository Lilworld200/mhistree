import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { getOrCreateDefaultPatientId } from "@/lib/supabase/patient-helper";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  let patientId = searchParams.get("patient_id");

  try {
    const supabase = createAdminSupabaseClient();

    if (!patientId) {
      patientId = await getOrCreateDefaultPatientId(supabase);
    }

    if (!patientId) {
      return NextResponse.json({
        success: true,
        sessions: [],
        messages: {},
      });
    }

    // 1. Fetch chat sessions ordered by updated_at descending
    const { data: dbSessions, error: sessError } = await supabase
      .from("chat_sessions")
      .select("*")
      .eq("patient_id", patientId)
      .order("updated_at", { ascending: false });

    if (sessError) {
      console.error("[Chat History API Sessions Error]:", sessError);
      return NextResponse.json({ error: sessError.message }, { status: 500 });
    }

    if (!dbSessions || dbSessions.length === 0) {
      return NextResponse.json({
        success: true,
        sessions: [],
        messages: {},
      });
    }

    const sessionIds = dbSessions.map((s) => s.id);

    // 2. Fetch all messages for these sessions ordered by created_at ascending
    const { data: dbMessages, error: msgError } = await supabase
      .from("chat_messages")
      .select("*")
      .in("session_id", sessionIds)
      .order("created_at", { ascending: true });

    if (msgError) {
      console.error("[Chat History API Messages Error]:", msgError);
      return NextResponse.json({ error: msgError.message }, { status: 500 });
    }

    // 3. Map dbSessions to frontend ChatSession objects
    const sessions = dbSessions.map((s) => ({
      id: s.id,
      title: s.title || "New conversation",
      group: s.session_group || "Today",
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    }));

    // 4. Map dbMessages to Record<sessionId, ChatMessage[]>
    const messages: Record<
      string,
      Array<{
        id: string;
        role: "user" | "ai" | "sys";
        text: string;
        mem?: boolean;
      }>
    > = {};

    sessionIds.forEach((sid) => {
      messages[sid] = [];
    });

    (dbMessages || []).forEach((m) => {
      if (!messages[m.session_id]) {
        messages[m.session_id] = [];
      }
      messages[m.session_id].push({
        id: m.id,
        role: m.role === "user" ? "user" : m.role === "system" ? "sys" : "ai",
        text: m.content,
      });
    });

    return NextResponse.json({
      success: true,
      sessions,
      messages,
    });
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err.message : "Failed to fetch chat history";
    console.error("[Chat History API Exception]:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
