import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { guardAdmin } from "@/components/dashboard/data";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await guardAdmin();
  return (
    <>
      <AdminSectionNav />
      {children}
    </>
  );
}
