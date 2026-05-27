"use client";

import { usePathname, useParams } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumb() {
  const pathname = usePathname();
  const params = useParams();

  if (pathname === "/") return null;

  const segments = pathname.split("/").filter(Boolean);
  const items: BreadcrumbItem[] = [{ label: "Home", href: "/" }];

  const entityLabels: Record<string, string> = {
    dashboard: "Dashboard",
    uploads: "Uploaded Files",
    graph: "Graph",
    user: "User",
    role: "Role",
    policy: "Policy",
    group: "Group",
  };

  // Map entity type route segments to their param keys
  const entityParamKeys: Record<string, string> = {
    user: "userId",
    role: "roleId",
    policy: "policyId",
    group: "groupId",
  };

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const isLast = i === segments.length - 1;

    if (entityLabels[seg]) {
      const href = "/" + segments.slice(0, i + 1).join("/");
      items.push({ label: entityLabels[seg], href: isLast ? undefined : href });
    } else {
      // Unknown segment — likely a dynamic param value (e.g., user ID, role ID)
      // Try to find the param value from the route params
      const paramKey = entityParamKeys[segments[i - 1]] || Object.keys(params)[0];
      const paramValue = params[paramKey] as string | undefined;
      items.push({ label: paramValue || seg });
    }
  }

  return (
    <nav className="flex items-center text-sm text-muted-foreground mb-6">
      {items.map((item, i) => (
        <span key={i} className="flex items-center">
          {i > 0 && <ChevronRight className="h-4 w-4 mx-2 text-muted-foreground/50" />}
          {i === 0 && <Home className="h-3.5 w-3.5 mr-1.5" />}
          {item.href ? (
            <Link
              href={item.href}
              className="hover:text-foreground transition-colors"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-foreground font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
