"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { TableRow } from "@/components/ui/table";

interface ClickableTableRowProps {
  href: string;
  children: ReactNode;
}

export function ClickableTableRow({ href, children }: ClickableTableRowProps) {
  const router = useRouter();

  const open = () => router.push(href);

  return (
    <TableRow
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      }}
      className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {children}
    </TableRow>
  );
}
