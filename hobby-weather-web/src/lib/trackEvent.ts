import { supabase } from "@/lib/supabaseClient";

export async function trackEvent(
  userId: string | null | undefined,
  eventName: string,
  eventData: Record<string, unknown> = {}
) {
  if (!userId) return;

  try {
    await supabase.from("app_events").insert({
      user_id: userId,
      event_name: eventName,
      event_data: eventData,
    });
  } catch (error) {
    console.error("Could not track event:", error);
  }
}