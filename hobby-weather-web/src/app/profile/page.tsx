"use client";

import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/lib/useUser";
import { NavBar } from "@/components/NavBar";

export default function ProfilePage() {
  const { user, authLoading } = useUser();

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (authLoading) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        <div className="mx-auto max-w-4xl">Loading...</div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        <div className="mx-auto max-w-4xl">
          <NavBar />
          <h1 className="text-3xl font-bold">Profile</h1>
          <p className="mt-4 rounded-xl bg-slate-900 p-4 text-slate-300">
            Please log in to view your profile.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-4xl">
        <NavBar />

        <h1 className="text-3xl font-bold">Profile</h1>

        <section className="mt-8 rounded-2xl bg-slate-900 p-5 shadow">
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

          <button
            type="button"
            onClick={handleLogout}
            className="mt-6 rounded-lg bg-slate-700 px-4 py-2 font-semibold text-white hover:bg-slate-600"
          >
            Log out
          </button>
        </section>
      </div>
    </main>
  );
}