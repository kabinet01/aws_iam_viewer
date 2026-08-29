"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Breadcrumb } from "@/components/breadcrumb";
import { useCurrentUpload } from "@/hooks/use-current-upload";
import {
  analyzeSecurityFindings,
  buildAttackPaths,
  downloadTextFile,
  exportFindingsAsCsv,
  exportFindingsAsMarkdown,
  FindingSeverity,
  SecurityFinding,
} from "@/lib/analysis";
import { Download, FileJson, Network, Search, ShieldAlert } from "lucide-react";

const severityOrder: FindingSeverity[] = ["critical", "high", "medium", "low", "info"];

export default function FindingsPage() {
  const { upload, data, isLoading, status, error, reload } = useCurrentUpload();
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<"all" | FindingSeverity>("all");
  const router = useRouter();

  const findings = useMemo(() => (data ? analyzeSecurityFindings(data) : []), [data]);
  const attackPaths = useMemo(() => (data ? buildAttackPaths(data) : []), [data]);

  const filteredFindings = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return findings.filter((finding) => {
      const matchesSeverity = severity === "all" || finding.severity === severity;
      if (!matchesSeverity) return false;
      if (!normalizedQuery) return true;
      return [
        finding.title,
        finding.description,
        finding.entityName,
        finding.category,
        finding.source?.policyName || "",
        finding.evidence.join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [findings, query, severity]);

  const severityCounts = useMemo(() => {
    return severityOrder.reduce<Record<FindingSeverity, number>>((acc, item) => {
      acc[item] = findings.filter((finding) => finding.severity === item).length;
      return acc;
    }, {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    });
  }, [findings]);

  const exportMarkdown = () => {
    downloadTextFile("iam-findings.md", exportFindingsAsMarkdown(filteredFindings), "text/markdown");
  };

  const exportCsv = () => {
    downloadTextFile("iam-findings.csv", exportFindingsAsCsv(filteredFindings), "text/csv");
  };

  const exportJson = () => {
    downloadTextFile("iam-findings.json", JSON.stringify(filteredFindings, null, 2), "application/json");
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <Breadcrumb />
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {["critical", "high", "medium", "low", "info"].map((item) => (
            <Skeleton key={item} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!data || !upload) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Breadcrumb />
        <Alert>
          <ShieldAlert className="size-4" />
          <AlertTitle>{status === "error" ? "Could not load findings" : "No IAM upload available"}</AlertTitle>
          <AlertDescription>
            {status === "error" ? error || "There was a problem loading the current IAM dataset." : "Upload IAM authorization details before reviewing findings."}
          </AlertDescription>
        </Alert>
        <div className="flex gap-2">
          {status === "error" && (
            <Button variant="outline" onClick={() => void reload()}>
              Retry
            </Button>
          )}
          <Button onClick={() => router.push("/")}>Upload IAM Data</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <Breadcrumb />

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Security Findings</h1>
          <p className="text-muted-foreground">Analyzing: {upload.name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportMarkdown}>
            <Download className="size-4 mr-2" />
            Markdown
          </Button>
          <Button variant="outline" onClick={exportCsv}>
            <Download className="size-4 mr-2" />
            CSV
          </Button>
          <Button variant="outline" onClick={exportJson}>
            <FileJson className="size-4 mr-2" />
            JSON
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {severityOrder.map((item) => (
          <Card key={item} className={item === "critical" || item === "high" ? "border-destructive/40" : undefined}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm capitalize">{item}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{severityCounts[item]}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {findings.length === 0 ? (
        <Alert>
          <ShieldAlert className="size-4" />
          <AlertTitle>No findings detected</AlertTitle>
          <AlertDescription>
            No configured local checks matched this IAM export. This is not a proof of least privilege.
          </AlertDescription>
        </Alert>
      ) : (
        <Tabs defaultValue="findings" className="space-y-4">
          <TabsList>
            <TabsTrigger value="findings">Findings</TabsTrigger>
            <TabsTrigger value="paths">Attack Paths</TabsTrigger>
          </TabsList>

          <TabsContent value="findings" className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="flex items-center gap-2 flex-1">
                <Search className="size-4 text-muted-foreground" />
                <Input
                  placeholder="Search findings, entities, policies, evidence..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="max-w-xl"
                />
              </div>
              <Select value={severity} onValueChange={(value) => setSeverity(value as "all" | FindingSeverity)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All severities</SelectItem>
                  {severityOrder.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Findings</CardTitle>
                <CardDescription>{filteredFindings.length} of {findings.length} findings shown</CardDescription>
              </CardHeader>
              <CardContent>
                <Table className="table-fixed min-w-[900px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Severity</TableHead>
                      <TableHead className="w-[38%]">Finding</TableHead>
                      <TableHead className="w-[22%]">Entity</TableHead>
                      <TableHead className="w-[28%]">Evidence</TableHead>
                      <TableHead className="w-24">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredFindings.map((finding) => (
                      <FindingRow key={finding.id} finding={finding} onOpen={() => openEntity(router.push, finding)} />
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="paths" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Network className="size-5" />
                  Attack Paths
                </CardTitle>
                <CardDescription>
                  Principal-to-role paths that end near high-severity findings.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {attackPaths.length > 0 ? (
                  <div className="space-y-3">
                    {attackPaths.slice(0, 50).map((path) => (
                      <div key={path.id} className="border border-border p-4">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <Badge variant={path.severity === "critical" || path.severity === "high" ? "destructive" : "secondary"}>
                            {path.severity}
                          </Badge>
                          <span className="font-semibold">{path.startName}</span>
                          <span className="text-muted-foreground">to</span>
                          <span className="font-semibold">{path.endRoleName}</span>
                        </div>
                        <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
                          {path.steps.map((step) => (
                            <li key={`${path.id}-${step}`}>{step}</li>
                          ))}
                        </ol>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No high-severity attack paths detected.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function FindingRow({ finding, onOpen }: { finding: SecurityFinding; onOpen: () => void }) {
  return (
    <TableRow>
      <TableCell>
        <Badge variant={finding.severity === "critical" || finding.severity === "high" ? "destructive" : "secondary"}>
          {finding.severity}
        </Badge>
      </TableCell>
      <TableCell className="whitespace-normal">
        <div className="font-medium break-words">{finding.title}</div>
        <div className="text-xs text-muted-foreground break-words">{finding.description}</div>
        {finding.source && (
          <div className="text-xs font-mono text-muted-foreground mt-1 break-all">{finding.source.policyName}</div>
        )}
      </TableCell>
      <TableCell className="whitespace-normal">
        <div className="font-medium break-words">{finding.entityName}</div>
        <div className="text-xs text-muted-foreground">{finding.entityType}</div>
      </TableCell>
      <TableCell className="whitespace-normal">
        <div className="text-xs text-muted-foreground line-clamp-3 break-words">{finding.evidence.join(" | ")}</div>
      </TableCell>
      <TableCell>
        {finding.entityType !== "account" && (
          <Button variant="outline" size="sm" onClick={onOpen}>
            Open
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

function openEntity(push: (href: string) => void, finding: SecurityFinding) {
  if (finding.entityType === "user") push(`/user/${finding.entityId}`);
  if (finding.entityType === "role") push(`/role/${finding.entityId}`);
  if (finding.entityType === "group") push(`/group/${finding.entityId}`);
  if (finding.entityType === "policy") push(`/policy/${finding.entityId}`);
}
