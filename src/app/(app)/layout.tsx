import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Nav from "@/components/Nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/");
  if (!session.user.isApproved) redirect("/approval-pending");

  return (
    <div className="min-h-screen flex">
      <Nav />
      <main className="flex-1 md:ml-[220px] px-4 py-6 md:px-10 md:py-10 max-w-[900px] pb-24 md:pb-10">
        {children}
      </main>
    </div>
  );
}
