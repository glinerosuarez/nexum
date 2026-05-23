import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfileInfo } from "@/lib/dashboard-data";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { DashboardUserContext } from "@/components/dashboard/DashboardUserContext";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const profile = await getProfileInfo(user.id);
  const userMeta = {
    name: profile?.full_name ?? user.email?.split("@")[0] ?? "Usuario",
    email: profile?.email ?? user.email ?? null,
    role: profile?.job_title ?? null,
  };

  return (
    <DashboardUserContext value={userMeta}>
      <div className="flex min-h-screen bg-canvas">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </DashboardUserContext>
  );
}
