"use client";

import { useMemo, useReducer } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Breadcrumb } from "@/components/breadcrumb";
import { diffUploads, downloadTextFile, UploadDiff } from "@/lib/analysis";
import { type UploadMetadata } from "@/lib/indexeddb";
import { useUploadPair } from "@/hooks/use-upload-pair";
import { useUploads } from "@/hooks/use-uploads";
import { formatDateTime } from "@/lib/iam-utils";
import { GitCompare, FileJson } from "lucide-react";

export const metadata = {
  title: "Upload Diff",
  description: "Compare two IAM uploads and review resource, trust, and finding changes.",
};

type DiffState = {
  beforeId: string;
  afterId: string;
};

type DiffAction =
  | { type: "hydrate"; uploads: UploadMetadata[] }
  | { type: "set_before"; beforeId: string }
  | { type: "set_after"; afterId: string };

const initialDiffState: DiffState = {
  beforeId: "",
  afterId: "",
};

function diffReducer(state: DiffState, action: DiffAction): DiffState {
  switch (action.type) {
    case "hydrate": {
      if (state.beforeId || state.afterId) {
        return state;
      }
      return {
        beforeId: action.uploads[1]?.id || action.uploads[0]?.id || "",
        afterId: action.uploads[0]?.id || "",
      };
    }
    case "set_before":
      return { ...state, beforeId: action.beforeId };
    case "set_after":
      return { ...state, afterId: action.afterId };
    default:
      return state;
  }
}

export default function DiffPage() {
  const [state, dispatch] = useReducer(diffReducer, initialDiffState);
  const { uploads: uploadsMap, isLoading: uploadsLoading, error: uploadsError, reload: reloadUploads } = useUploads();
  const router = useRouter();
  const uploads = useMemo(
    () => Object.values(uploadsMap ?? {}).toSorted((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()),
    [uploadsMap]
  );
  const hydratedState = useMemo(() => diffReducer(state, { type: "hydrate", uploads }), [state, uploads]);
  const { beforeUpload, afterUpload, isLoading: pairLoading, error: pairError, reload: reloadPair } = useUploadPair(
    hydratedState.beforeId,
    hydratedState.afterId
  );

  const isLoading = uploadsLoading || pairLoading;
  const error = uploadsError || pairError;

  const diff = useMemo<UploadDiff | null>(() => {
    if (!beforeUpload || !afterUpload || beforeUpload.id === afterUpload.id) return null;
    return diffUploads(beforeUpload.data, afterUpload.data);
  }, [beforeUpload, afterUpload]);

  const exportDiff = () => {
    if (!diff) return;
    downloadTextFile("iam-upload-diff.json", JSON.stringify(diff, null, 2), "application/json");
  };

  const reload = async () => {
    await Promise.all([reloadUploads(), reloadPair()]);
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <Breadcrumb />
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Breadcrumb />
        <Card>
          <CardContent className="py-12 text-center">
            <GitCompare className="size-10 mx-auto mb-4 text-muted-foreground" />
            <h2 className="font-semibold mb-2">Diff data could not be loaded</h2>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button variant="outline" onClick={() => void reload()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (uploads.length < 2) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Breadcrumb />
        <div>
          <h1 className="text-3xl font-bold">Upload Diff</h1>
          <p className="text-muted-foreground">Compare two stored IAM exports.</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <GitCompare className="size-10 mx-auto mb-4 text-muted-foreground" />
            <h2 className="font-semibold mb-2">Two uploads required</h2>
            <p className="text-muted-foreground mb-4">Upload at least two IAM authorization detail files to compare changes.</p>
            <Button onClick={() => router.push("/")}>Upload File</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <Breadcrumb />

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Upload Diff</h1>
          <p className="text-muted-foreground">Compare IAM resources, policy changes, trust changes, and new findings.</p>
        </div>
        <Button variant="outline" onClick={exportDiff} disabled={!diff}>
          <FileJson className="size-4 mr-2" />
          Export JSON
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitCompare className="size-5" />
            Compare Uploads
          </CardTitle>
          <CardDescription>Use older data as baseline and newer data as target.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <UploadPicker
              label="Baseline"
              value={hydratedState.beforeId}
              uploads={uploads}
              onChange={(beforeId) => dispatch({ type: "set_before", beforeId })}
            />
            <UploadPicker
              label="Target"
              value={hydratedState.afterId}
              uploads={uploads}
              onChange={(afterId) => dispatch({ type: "set_after", afterId })}
            />
          </div>
        </CardContent>
      </Card>

      {hydratedState.beforeId === hydratedState.afterId && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Select two different uploads to generate a diff.
          </CardContent>
        </Card>
      )}

      {diff && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <DiffMetric title="Users" added={diff.users.added.length} removed={diff.users.removed.length} changed={diff.users.changed.length} />
            <DiffMetric title="Roles" added={diff.roles.added.length} removed={diff.roles.removed.length} changed={diff.roles.changed.length} />
            <DiffMetric title="Groups" added={diff.groups.added.length} removed={diff.groups.removed.length} changed={diff.groups.changed.length} />
            <DiffMetric title="Policies" added={diff.policies.added.length} removed={diff.policies.removed.length} changed={diff.policies.changed.length} />
            <Card className={diff.findings.added.length > 0 ? "border-destructive/40" : undefined}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">New Findings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{diff.findings.added.length}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Changed Resources</CardTitle>
              <CardDescription>Fields are summarized so the noisy JSON remains available in the export.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Changes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <ResourceRows type="User" items={diff.users.added} status="Added" nameKey="UserName" />
                  <ResourceRows type="User" items={diff.users.removed} status="Removed" nameKey="UserName" />
                  <ChangedRows type="User" items={diff.users.changed} nameKey="UserName" />
                  <ResourceRows type="Role" items={diff.roles.added} status="Added" nameKey="RoleName" />
                  <ResourceRows type="Role" items={diff.roles.removed} status="Removed" nameKey="RoleName" />
                  <ChangedRows type="Role" items={diff.roles.changed} nameKey="RoleName" />
                  <ResourceRows type="Group" items={diff.groups.added} status="Added" nameKey="GroupName" />
                  <ResourceRows type="Group" items={diff.groups.removed} status="Removed" nameKey="GroupName" />
                  <ChangedRows type="Group" items={diff.groups.changed} nameKey="GroupName" />
                  <ResourceRows type="Policy" items={diff.policies.added} status="Added" nameKey="PolicyName" />
                  <ResourceRows type="Policy" items={diff.policies.removed} status="Removed" nameKey="PolicyName" />
                  <ChangedRows type="Policy" items={diff.policies.changed} nameKey="PolicyName" />
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Finding Changes</CardTitle>
              <CardDescription>New and removed local security findings between uploads.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Finding</TableHead>
                    <TableHead>Entity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {diff.findings.added.map((finding) => (
                    <TableRow key={`added-${finding.id}`}>
                      <TableCell><Badge variant="destructive">Added</Badge></TableCell>
                      <TableCell>{finding.severity}</TableCell>
                      <TableCell>{finding.title}</TableCell>
                      <TableCell>{finding.entityName}</TableCell>
                    </TableRow>
                  ))}
                  {diff.findings.removed.map((finding) => (
                    <TableRow key={`removed-${finding.id}`}>
                      <TableCell><Badge variant="secondary">Removed</Badge></TableCell>
                      <TableCell>{finding.severity}</TableCell>
                      <TableCell>{finding.title}</TableCell>
                      <TableCell>{finding.entityName}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function UploadPicker({
  label,
  value,
  uploads,
  onChange,
}: {
  label: string;
  value: string;
  uploads: UploadMetadata[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{label}</div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select upload" />
        </SelectTrigger>
        <SelectContent>
          {uploads.map((upload) => (
            <SelectItem key={upload.id} value={upload.id}>
              {upload.name} ({formatDateTime(upload.uploadedAt)})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DiffMetric({ title, added, removed, changed }: { title: string; added: number; removed: number; changed: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-sm space-y-1">
          <div><Badge variant="secondary">{added}</Badge> added</div>
          <div><Badge variant="secondary">{removed}</Badge> removed</div>
          <div><Badge variant="secondary">{changed}</Badge> changed</div>
        </div>
      </CardContent>
    </Card>
  );
}

function ResourceRows<T extends object>({
  type,
  items,
  status,
  nameKey,
}: {
  type: string;
  items: T[];
  status: "Added" | "Removed";
  nameKey: keyof T;
}) {
  return items.slice(0, 50).map((item) => (
    <TableRow key={`${type}-${status}-${getObjectValue(item, nameKey)}`}>
      <TableCell>{type}</TableCell>
      <TableCell className="font-medium">{getObjectValue(item, nameKey)}</TableCell>
      <TableCell>
        <Badge variant={status === "Added" ? "destructive" : "secondary"}>{status}</Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">Resource {status.toLowerCase()}</TableCell>
    </TableRow>
  ));
}

function ChangedRows<T extends object>({
  type,
  items,
  nameKey,
}: {
  type: string;
  items: Array<{ after: T; changes: string[] }>;
  nameKey: keyof T;
}) {
  return items.slice(0, 50).map((item) => (
    <TableRow key={`${type}-changed-${getObjectValue(item.after, nameKey)}`}>
      <TableCell>{type}</TableCell>
      <TableCell className="font-medium">{getObjectValue(item.after, nameKey)}</TableCell>
      <TableCell><Badge variant="secondary">Changed</Badge></TableCell>
      <TableCell className="text-muted-foreground">{item.changes.join(", ")}</TableCell>
    </TableRow>
  ));
}

function getObjectValue<T extends object>(item: T, key: keyof T): string {
  return String((item as Record<string, unknown>)[String(key)] || "");
}
