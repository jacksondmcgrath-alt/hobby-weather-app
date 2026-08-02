"use client";

import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/lib/useUser";
import { PageHeader, Card, Button } from "@/components/ui";

export default function ProfilePage() {
  const { user, authLoading } = useUser();

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
        <PageHeader title="Profile" />

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
        title="Profile"
        description="View your account information and sign out."
      />

      <Card className="mt-8">
        <h2 className="text-xl font-semibold">Account</h2>

        <div className="mt-4 grid gap-3 text-sm text-slate-300">
          <div>
            <span className="font-semibold text-white">Email:</span>{" "}
            {user.email}
          </div>

          <div>
            <span className="font-semibold text-white">User ID:</span>{" "}
            {user.id}
          </div>

          <div>
            <span className="font-semibold text-white">Auth provider:</span>{" "}
            {user.app_metadata?.provider ?? "unknown"}
          </div>
        </div>

        <div className="mt-6">
          <Button onClick={handleLogout} variant="secondary">
            Log out
          </Button>
        </div>
      </Card>
    </>
  );
}