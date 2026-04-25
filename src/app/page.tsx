import { auth } from "@/auth";
import { redirect } from "next/navigation";
import SignInButtons from "@/components/SignInButtons";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  if (session?.user) {
    if (!session.user.isApproved) redirect("/approval-pending");
    redirect("/translation");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[--background]">
      <div className="w-full max-w-sm border border-[--border] rounded-lg p-10 bg-[--card]">
        <h1
          className="text-2xl font-normal text-[--foreground] mb-1"
          style={{ fontFamily: "'Charter', 'Georgia', serif" }}
        >
          Work OS
        </h1>
        <p className="text-sm text-[--muted-foreground] mb-8">AI Powered Productivity Platform</p>
        <SignInButtons />
      </div>
    </main>
  );
}
