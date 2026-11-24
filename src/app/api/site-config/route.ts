import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DEFAULT_CONFIG, SiteConfig } from "@/lib/site-config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("app_settings")
      .select("value, updated_at")
      .eq("key", "site_config")
      .maybeSingle();

    if (error || !data?.value) {
      return NextResponse.json(
        { success: true, config: DEFAULT_CONFIG, updatedAt: null },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    let parsed: Partial<SiteConfig> | null = null;
    try {
      parsed = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
    } catch {
      parsed = null;
    }

    const config: SiteConfig = {
      ...DEFAULT_CONFIG,
      ...(parsed || {}),
    };

    return NextResponse.json(
      {
        success: true,
        config,
        updatedAt: data.updated_at || null,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch {
    return NextResponse.json(
      { success: true, config: DEFAULT_CONFIG, updatedAt: null },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
