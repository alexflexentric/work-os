import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ApprovalPendingPage() {
  const session = await auth();
  if (!session?.user) redirect("/");
  if (session.user.isApproved) redirect("/home");

  return (
    <main className="min-h-screen flex items-center justify-center bg-[--background]">
      <div className="w-full max-w-sm border border-[--border] rounded-lg p-10 bg-[--card]">
        <h1 className="text-2xl font-normal text-[--foreground] mb-2" style={{ fontFamily: "'Charter', 'Georgia', serif" }}>
          Approval pending
        </h1>
        <p className="text-sm text-[--muted-foreground] mb-8 leading-relaxed">
          Your account is awaiting admin approval. You&apos;ll receive an email once you&apos;re approved.
        </p>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button type="submit" className="text-sm text-[--muted-foreground] hover:text-[--foreground] transition-colors">
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
