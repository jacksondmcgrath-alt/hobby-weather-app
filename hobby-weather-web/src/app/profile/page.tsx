"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/lib/useUser";
import {
  getFallbackDisplayName,
  getOrCreateProfile,
  updateProfileDisplayName,
  type UserProfile,
} from "@/lib/profile";
import {
  PageHeader,
  Card,
  Button,
  StatusMessage,
  SectionTitle,
  Badge,
  Panel,
} from "@/components/ui";

type AuthIdentity = {
  id?: string;
  provider?: string;
  identity_data?: Record<string, unknown>;
};

export default function ProfilePage() {
  const { user, authLoading } = useUser();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState("");

  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [linkingGoogle, setLinkingGoogle] = useState(false);

  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const identities = useMemo(() => {
    return ((user as unknown as { identities?: AuthIdentity[] } | null)
      ?.identities ?? []) as AuthIdentity[];
  }, [user]);

  const hasGoogleConnected = identities.some(
    (identity) => identity.provider === "google"
  );

  const primaryProvider =
    user?.app_metadata?.provider ??
    identities[0]?.provider ??
    "unknown";

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setDisplayName("");
      return;
    }

    const currentUser = user;

    async function loadProfile() {
      setLoadingProfile(true);
      setMessage("");
      setErrorMessage("");

      try {
        const loadedProfile = await getOrCreateProfile(currentUser);
        setProfile(loadedProfile);
        setDisplayName(
          loadedProfile.display_name || getFallbackDisplayName(currentUser)
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not load your profile."
        );
        setDisplayName(getFallbackDisplayName(currentUser));
      }

      setLoadingProfile(false);
    }

    loadProfile();
  }, [user]);

  async function handleSaveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user) return;

    const trimmedName = displayName.trim();

    if (!trimmedName) {
      setErrorMessage("Display name cannot be blank.");
      return;
    }

    setSavingProfile(true);
    setMessage("");
    setErrorMessage("");

    try {
      const updatedProfile = await updateProfileDisplayName(
        user.id,
        trimmedName
      );

      // Also update Supabase auth metadata as a useful fallback.
      const { error: metadataError } = await supabase.auth.updateUser({
        data: {
          display_name: trimmedName,
        },
      });

      if (metadataError) {
        console.warn("Profile saved, but auth metadata was not updated:", metadataError);
      }

      setProfile(updatedProfile);
      setMessage("Profile updated.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not update your profile."
      );
    }

    setSavingProfile(false);
  }

  async function handleLinkGoogle() {
    setLinkingGoogle(true);
    setMessage("");
    setErrorMessage("");

    const { error } = await supabase.auth.linkIdentity({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/profile`,
      },
    });

    if (error) {
      setErrorMessage(error.message);
      setLinkingGoogle(false);
    }

    // If successful, Supabase redirects away, so no need to set loading false.
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (authLoading) {
    return <p className="text-slate-300">Loading...</p>;
  }

  if (!user) {
    return (
      <>
        <PageHeader
          title="Profile"
          description="Log in to manage your account and connected sign-in methods."
        />

        <Card className="mt-6">
          <p className="text-slate-300">
            Please log in to view your profile.
          </p>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Profile"
        description="Manage your name, account details, and connected sign-in methods."
        action={
          <Button onClick={handleLogout} variant="secondary">
            Log out
          </Button>
        }
      />

      {message && (
        <StatusMessage type="success">
          {message}
        </StatusMessage>
      )}

      {errorMessage && (
        <StatusMessage type="error">
          {errorMessage}
        </StatusMessage>
      )}

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <SectionTitle
            title="Personal profile"
            description="This name is used for greetings and assistant-style recommendations."
          />

          {loadingProfile ? (
            <p className="mt-4 text-slate-300">Loading profile...</p>
          ) : (
            <form onSubmit={handleSaveProfile} className="mt-5 grid gap-4">
              <label className="grid gap-1">
                <span className="text-sm font-medium text-slate-300">
                  Display name
                </span>

                <input
                  type="text"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="What should Hobby Weather call you?"
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none transition focus:border-[rgb(var(--season-rgb))] focus:ring-2 focus:ring-[rgb(var(--season-rgb)_/_0.18)]"
                  required
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={savingProfile}>
                  {savingProfile ? "Saving..." : "Save profile"}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    setDisplayName(
                      profile?.display_name || getFallbackDisplayName(user)
                    )
                  }
                >
                  Reset
                </Button>
              </div>
            </form>
          )}
        </Card>

        <Card>
          <SectionTitle
            title="Sign-in methods"
            description="Connect another login method so your account is easier to access."
          />

          <div className="mt-5 grid gap-3">
            <Panel>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-white">
                    Email
                  </div>
                  <div className="mt-1 text-sm text-slate-400">
                    {user.email ?? "No email found"}
                  </div>
                </div>

                <Badge variant="info">Connected</Badge>
              </div>
            </Panel>

            <Panel>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-semibold text-white">
                    Google
                  </div>
                  <div className="mt-1 text-sm text-slate-400">
                    {hasGoogleConnected
                      ? "Google is connected to this account."
                      : "Link Google for one-click sign in."}
                  </div>
                </div>

                {hasGoogleConnected ? (
                  <Badge variant="good">Connected</Badge>
                ) : (
                  <Button
                    onClick={handleLinkGoogle}
                    disabled={linkingGoogle}
                    variant="secondary"
                  >
                    {linkingGoogle ? "Connecting..." : "Connect Google"}
                  </Button>
                )}
              </div>
            </Panel>
          </div>
        </Card>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle
            title="Account details"
            description="Technical account information for troubleshooting."
          />

          <div className="mt-5 grid gap-3 text-sm text-slate-300">
            <DetailRow label="Email" value={user.email ?? "Unknown"} />
            <DetailRow label="User ID" value={user.id} />
            <DetailRow label="Primary provider" value={String(primaryProvider)} />
            <DetailRow
              label="Profile name"
              value={profile?.display_name ?? "Not saved yet"}
            />
          </div>
        </Card>

        <Card>
          <SectionTitle
            title="Data & privacy"
            description="Your saved locations, plans, logs, preferences, and ratings are tied to your account."
          />

          <div className="mt-5 grid gap-3 text-sm text-slate-300">
            <p>
              Hobby Weather uses your saved data to personalize planning
              recommendations and improve activity scores over time.
            </p>

            <p>
              You can export your data from the Exports page if that page is
              enabled for your account.
            </p>
          </div>
        </Card>
      </section>
    </>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-700/70 bg-white/[0.04] p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>

      <div className="mt-1 break-all font-medium text-white">
        {value}
      </div>
    </div>
  );
}