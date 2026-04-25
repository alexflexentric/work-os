import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { sendWelcomeEmail } from "@/lib/email";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "alex@flexentric.com";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user || session.user.email !== ADMIN_EMAIL) redirect("/");

  const pending = await prisma.user.findMany({
    where: { isApproved: false },
    orderBy: { createdAt: "asc" },
  });

  async function approveUser(formData: FormData) {
    "use server";
    const userId = formData.get("userId") as string;
    const user = await prisma.user.update({
      where: { id: userId },
      data: { isApproved: true },
    });
    if (user.email) {
      await sendWelcomeEmail(user.email, user.name ?? undefined);
    }
    revalidatePath("/admin");
  }

  return (
    <div className="min-h-screen bg-[--background] p-10">
      <div className="max-w-xl mx-auto space-y-6">
        <h1 className="text-3xl font-normal text-[--foreground]" style={{ fontFamily: "'Charter', 'Georgia', serif" }}>
          Pending approvals
        </h1>
        {pending.length === 0 ? (
          <p className="text-sm text-[--muted-foreground] border border-[--border] rounded-lg p-6">
            No pending users.
          </p>
        ) : (
          <ul className="border border-[--border] rounded-lg overflow-hidden divide-y divide-[--border]">
            {pending.map((user: typeof pending[number]) => (
              <li key={user.id} className="flex items-center justify-between bg-[--card] px-5 py-4">
                <div>
                  <p className="text-sm font-medium text-[--foreground]">{user.name ?? "—"}</p>
                  <p className="text-xs text-[--muted-foreground] font-mono mt-0.5">{user.email}</p>
                  <p className="text-xs text-[--muted-foreground] mt-0.5">
                    Signed up {user.createdAt.toLocaleDateString()}
                  </p>
                </div>
                <form action={approveUser}>
                  <input type="hidden" name="userId" value={user.id} />
                  <button
                    type="submit"
                    className="text-sm font-medium px-4 py-2 rounded-lg border border-[--border] text-[--foreground] hover:bg-[--muted] transition-colors"
                  >
                    Approve
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
