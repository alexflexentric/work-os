import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { sendWelcomeEmail } from "@/lib/email";
import { revalidatePath } from "next/cache";

const ADMIN_EMAIL = "alex@fafo-studio.com";

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
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Admin — Pending approvals</h1>
        {pending.length === 0 ? (
          <p className="text-gray-500 bg-white rounded-xl border border-gray-100 p-6 text-center">
            No pending users.
          </p>
        ) : (
          <ul className="space-y-3">
            {pending.map((user) => (
              <li
                key={user.id}
                className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-5 py-4"
              >
                <div>
                  <p className="font-medium text-gray-900">{user.name ?? "—"}</p>
                  <p className="text-sm text-gray-500">{user.email}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Signed up {user.createdAt.toLocaleDateString()}
                  </p>
                </div>
                <form action={approveUser}>
                  <input type="hidden" name="userId" value={user.id} />
                  <button
                    type="submit"
                    className="bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
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
