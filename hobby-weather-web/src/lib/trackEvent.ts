import { supabase } from "@/lib/supabaseClient";

export async function trackEvent(
  userId: string | null | undefined,
  eventName: string,
  eventData: Record<string, unknown> = {}
) {
  if (!userId) return;

  const { error } = await supabase.from("app_events").insert({
    user_id: userId,
    event_name: eventName,
    event_data: eventData,
  });

  if (error) {
    console.error("Could not track event:", error.message);
  }
}