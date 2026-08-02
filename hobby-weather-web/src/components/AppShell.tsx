import { NavBar } from "@/components/NavBar";

export function AppShell({
  children,
  maxWidth = "max-w-5xl",
}: {
  children: React.ReactNode;
  maxWidth?: string;
}) {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-5 text-white sm:px-6 lg:px-8">
      <div className={`mx-auto ${maxWidth}`}>
        <NavBar />

        {children}
      </div>
    </main>
  );
}