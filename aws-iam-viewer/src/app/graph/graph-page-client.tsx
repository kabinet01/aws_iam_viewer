"use client";

import dynamic from "next/dynamic";
import { Breadcrumb } from "@/components/breadcrumb";
import { Network } from "lucide-react";

const GraphClient = dynamic(() => import("./graph-client"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <Network className="size-12 mx-auto mb-4 text-muted-foreground animate-pulse" />
        <p className="text-muted-foreground">Loading graph…</p>
      </div>
    </div>
  ),
});

export default function GraphPageClient() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Breadcrumb />
      <GraphClient />
    </div>
  );
}
