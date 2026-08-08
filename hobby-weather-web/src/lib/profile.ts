import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

export type UserProfile = {
  user_id: string;
  display_name: string | null;
  onboarding_complete: boolean | null;
  onboarding_completed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type SupabaseLikeError = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

function formatSupabaseError(error: unknown) {
  if (!error) {
    return "Unknown Supabase error.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object") {
    const typedError = error as SupabaseLikeError;

    return [
      typedError.message ? `Message: ${typedError.message}` : null,
      typedError.details ? `Details: ${typedError.details}` : null,
      typedError.hint ? `Hint: ${typedError.hint}` : null,
      typedError.code ? `Code: ${typedError.code}` : null,
    ]
      .filter(Boolean)
      .join(" | ");
  }

  return String(error);
}

export function getFallbackDisplayName(user: User | null | undefined) {
  if (!user) {
    return "there";
  }

  const metadataName =
    user.user_metadata?.display_name ||
    user.user_metadata?.full_name ||
    user.user_metadata?.name;

  if (typeof metadataName === "string" && metadataName.trim() !== "") {
    return metadataName.trim();
  }

  const emailPrefix = user.email?.split("@")[0];

  if (emailPrefix) {
    return emailPrefix
      .replace(/[._-]+/g, " ")
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  return "there";
}

export async function getOrCreateProfile(
  user: User,
  preferredDisplayName?: string
) {
  const { data: existingProfile, error: selectError } = await supabase
    .from("profiles")
    .select("user_id,display_name,onboarding_complete,onboarding_completed_at,created_at,updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Could not select profile. ${formatSupabaseError(selectError)}`);
  }

  if (existingProfile) {
    return existingProfile as unknown as UserProfile;
  }

  const displayName =
    preferredDisplayName?.trim() || getFallbackDisplayName(user);

  const { data: insertedProfile, error: insertError } = await supabase
    .from("profiles")
    .insert({
      user_id: user.id,
      display_name: displayName,
    })
    .select("user_id,display_name,onboarding_complete,onboarding_completed_at,created_at,updated_at")
    .single();

  if (insertError) {
    throw new Error(`Could not insert profile. ${formatSupabaseError(insertError)}`);
  }

  return insertedProfile as unknown as UserProfile;
}

export async function updateProfileDisplayName(
  userId: string,
  displayName: string
) {
  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        user_id: userId,
        display_name: displayName.trim(),
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id",
      }
    )
    .select("user_id,display_name,created_at,updated_at")
    .single();

  if (error) {
    throw new Error(`Could not update profile. ${formatSupabaseError(error)}`);
  }

  return data as unknown as UserProfile;
}