import { redirect } from "next/navigation";
import { projectExists } from "@/lib/dashboard-data";
import {
  isFirebaseAuthError,
  isUnauthorizedProjectAccessError,
} from "@/lib/nexum-api/client";

export const dynamic = "force-dynamic";

interface ProjectLayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

export default async function ProjectLayout({
  children,
  params,
}: ProjectLayoutProps) {
  const { id } = await params;

  let exists = false;
  try {
    exists = await projectExists(id);
  } catch (error) {
    if (isFirebaseAuthError(error)) {
      redirect(`/login?next=${encodeURIComponent(`/dashboard/proyectos/${id}`)}`);
    }
    if (isUnauthorizedProjectAccessError(error)) {
      redirect("/dashboard/proyectos?denied=1");
    }
    throw error;
  }

  return <>{children}</>;
}
