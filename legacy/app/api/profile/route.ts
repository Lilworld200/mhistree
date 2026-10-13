import { NextRequest, NextResponse } from "next/server";
import {
  createAdminSupabaseClient,
  createServerSupabaseClient,
} from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  let userId = searchParams.get("user_id");

  if (!userId || userId === "default") {
    try {
      const authClient = await createServerSupabaseClient();
      const {
        data: { user },
      } = await authClient.auth.getUser();
      if (user) {
        userId = user.id;
      }
    } catch (authErr) {
      console.error("[Profile API auth user fallback error]:", authErr);
    }
  }

  if (!userId || userId === "default") {
    return NextResponse.json(
      {
        error:
          "user_id parameter is required and user is not session-authenticated",
      },
      { status: 400 },
    );
  }

  try {
    const supabase = createAdminSupabaseClient();

    const [userRes, profileRes, memoriesRes, medsRes] = await Promise.all([
      supabase.from("users").select("*").eq("id", userId).maybeSingle(),
      supabase
        .from("health_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("health_memories")
        .select("*")
        .eq("patient_id", userId)
        .order("created_at", { ascending: false }),
      supabase
        .from("medications")
        .select("*")
        .eq("patient_id", userId)
        .eq("status", "active"),
    ]);

    if (userRes.error) {
      console.error("[Profile API Error - Users]:", userRes.error);
      return NextResponse.json(
        { error: userRes.error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      user: userRes.data || null,
      profile: profileRes.data || null,
      memories: memoriesRes.data || [],
      medications: medsRes.data || [],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Profile fetch failed";
    console.error("[Profile API Exception]:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
