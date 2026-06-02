import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";

interface BreadcrumbItem {
  label: string;
  href?: string;
  key: string;
}

const ENTITY_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  uploads: "Uploaded Files",
  graph: "Graph",
  findings: "Findings",
  diff: "Diff",
  user: "User",
  role: "Role",
  policy: "Policy",
  group: "Group",
};

const ENTITY_PARAM_KEYS: Record<string, string> = {
  user: "userId",
  role: "roleId",
  policy: "policyId",
  group: "groupId",
};

export function Breadcrumb() {
  const pathname = usePathname();
  const params = useParams();

  if (pathname === "/") return null;

  const segments = pathname.split("/").filter(Boolean);
  const items: BreadcrumbItem[] = [{ label: "Home", href: "/", key: "home" }];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const currentPath = `/${segments.slice(0, i + 1).join("/")}`;

    if (ENTITY_LABELS[seg]) {
      const isLast = i === segments.length - 1;
      items.push({
        label: ENTITY_LABELS[seg],
        href: isLast ? undefined : currentPath,
        key: currentPath,
      });
    } else {
      const paramKey = ENTITY_PARAM_KEYS[segments[i - 1]] || Object.keys(params)[0];
      const paramValue = params[paramKey] as string | undefined;
      items.push({
        label: paramValue || seg,
        key: `${currentPath}:${paramValue || seg}`,
      });
    }
  }

  return (
    <nav className="flex items-center text-sm text-muted-foreground mb-6">
      {items.map((item, position) => (
        <span key={item.key} className="flex items-center">
          {position > 0 && <ChevronRight className="size-4 mx-2 text-muted-foreground/50" />}
          {position === 0 && <Home className="size-3.5 mr-1.5" />}
          {item.href ? (
            <Link href={item.href} className="hover:text-foreground transition-colors">
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
