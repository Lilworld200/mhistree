import { createAdminSupabaseClient } from "@/lib/supabase/server";

export async function getOrCreateDefaultPatientId(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
): Promise<string | null> {
  try {
    const { data: existing, error: findError } = await supabase
      .from("users")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (findError) {
      console.error("[Default Patient Lookup Error]:", findError);
    }

    if (existing?.id) {
      return existing.id;
    }

    // Auto-create default patient user if table is empty
    const { data: newUser, error: createError } = await supabase
      .from("users")
      .insert({
        first_name: "Demo",
        last_name: "Patient",
        email: "patient@mhistree.com",
      })
      .select("id")
      .single();

    if (createError) {
      console.error("[Default Patient Creation Error]:", createError);
      return null;
    }

    return newUser.id;
  } catch (err) {
    console.error("[getOrCreateDefaultPatientId Exception]:", err);
    return null;
  }
}
