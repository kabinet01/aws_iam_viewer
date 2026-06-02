"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  downloadTextFile,
  EffectivePermissions,
  exportEffectivePermissionsAsMarkdown,
} from "@/lib/analysis";
import { Download, KeyRound, ShieldAlert } from "lucide-react";

interface EffectivePermissionsPanelProps {
  effective: EffectivePermissions;
}

export function EffectivePermissionsPanel({ effective }: EffectivePermissionsPanelProps) {
  const directAllows = effective.directEntries.filter((entry) => entry.effect === "Allow").length;
  const inheritedAllows = effective.inheritedEntries.filter((entry) => entry.effect === "Allow").length;

  const handleExport = () => {
    downloadTextFile(
      `${effective.principalName}-effective-permissions.md`,
      exportEffectivePermissionsAsMarkdown(effective),
      "text/markdown"
    );
  };

  return (
    <section>
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <KeyRound className="size-5" />
          <span>Effective Permissions</span>
        </h2>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="size-4 mr-2" />
          Export
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Direct Allows</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{directAllows}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Inherited Allows</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inheritedAllows}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Reachable Roles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{effective.reachableRoles.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">High-Risk Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{effective.highRiskActions.length}</div>
          </CardContent>
        </Card>
      </div>

      {(effective.hasAdministrativeAccess || effective.hasBroadIamAccess || effective.hasPassRoleWildcard) && (
        <Card className="border-destructive/50 mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="size-5" />
              Access Flags
            </CardTitle>
            <CardDescription>Signals from direct, group, and assumable-role permissions.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {effective.hasAdministrativeAccess && <Badge variant="destructive">Administrative access</Badge>}
              {effective.hasBroadIamAccess && <Badge variant="destructive">Broad IAM access</Badge>}
              {effective.hasPassRoleWildcard && <Badge variant="destructive">PassRole wildcard</Badge>}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Reachable Roles</CardTitle>
            <CardDescription>Roles this principal can reach through trust and sts:AssumeRole analysis.</CardDescription>
          </CardHeader>
          <CardContent>
            {effective.reachableRoles.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead>Depth</TableHead>
                    <TableHead>Evidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {effective.reachableRoles.slice(0, 20).map((role) => (
                    <TableRow key={`${role.roleId}-${role.depth}`}>
                      <TableCell className="font-medium">{role.roleName}</TableCell>
                      <TableCell>{role.depth}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{role.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No assumable roles detected.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Service Spread</CardTitle>
            <CardDescription>Top services represented in effective allow statements.</CardDescription>
          </CardHeader>
          <CardContent>
            {effective.serviceActionCounts.length > 0 ? (
              <div className="space-y-2">
                {effective.serviceActionCounts.slice(0, 12).map((item) => (
                  <div key={item.service} className="flex items-center justify-between border-b border-border pb-2 text-sm">
                    <span className="font-mono">{item.service}</span>
                    <Badge variant="secondary">{item.count}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No allow statements detected.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
