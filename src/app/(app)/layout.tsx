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
      <main className="flex-1 ml-[220px] px-10 py-10 max-w-[900px]">
        {children}
      </main>
    </div>
  );
}
