import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("user_id");

  if (!userId) {
    return NextResponse.json(
      { error: "user_id parameter is required" },
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
