"use client";

import { NavBar } from "@/components/NavBar";
import { useUser } from "@/lib/useUser";

export default function PlannerPage() {
  const { user, authLoading } = useUser();

  if (authLoading) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        <div className="mx-auto max-w-4xl">
          <p className="text-slate-300">Loading...</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        <div className="mx-auto max-w-4xl">
          <NavBar />

          <h1 className="text-3xl font-bold">Planner</h1>

          <p className="mt-4 rounded-xl bg-slate-900 p-4 text-slate-300">
            Please log in on the Home page to use the Planner.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-4xl">
        <NavBar />

        <h1 className="text-3xl font-bold">Planner</h1>

        <p className="mt-2 text-slate-300">
          Planner recommendations will go here. For now, use the Plans page to create and manage plans.
        </p>

        <section className="mt-8 rounded-2xl bg-slate-900 p-5 shadow">
          <h2 className="text-xl font-semibold">Next step</h2>

          <p className="mt-2 text-slate-300">
            This page is ready for the recommendation/planner UI once cached predictions are connected.
          </p>
        </section>
      </div>
    </main>
  );
}