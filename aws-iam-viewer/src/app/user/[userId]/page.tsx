'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CopyField } from '@/components/ui/copy-field';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, User, Shield, Users, FileText, AlertTriangle, ExternalLink } from 'lucide-react';
import { IAMUser, ProcessedIAMData, IAMGroup, IAMPolicy, IAMRole } from '@/lib/types';
import { formatDateTime, findAssumableRoles } from '@/lib/iam-utils';
import { JSONViewer } from '@/components/ui/json-viewer';
import { indexedDBService } from '@/lib/indexeddb';
import { analyzeEntityPolicies, EntityPrivescResult, CATEGORY_LABELS } from '@/lib/privesc';
import { Breadcrumb } from '@/components/breadcrumb';

export default function UserDetailsPage() {
  const [user, setUser] = useState<IAMUser | null>(null);
  const [data, setData] = useState<ProcessedIAMData | null>(null);
  const [userGroups, setUserGroups] = useState<IAMGroup[]>([]);
  const [userPolicies, setUserPolicies] = useState<IAMPolicy[]>([]);
  const [assumableRoles, setAssumableRoles] = useState<IAMRole[]>([]);

  const router = useRouter();
  const params = useParams();
  const userId = params.userId as string;

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const currentUploadId = await indexedDBService.getCurrentUploadId();
        if (!currentUploadId) {
          router.push('/');
          return;
        }

        const upload = await indexedDBService.getUpload(currentUploadId);
        if (!upload) {
          router.push('/');
          return;
        }

        const processedData = upload.data;
        const userData = processedData.users[userId];
        
        if (!userData) {
          router.push('/dashboard');
          return;
        }

        setData(processedData);
        setUser(userData);

        // Get group details for this user
                const groups = userData.GroupList.map((groupName: string) =>
          Object.values(processedData.groups as Record<string, IAMGroup>).find((group: IAMGroup) => group.GroupName === groupName)
        ).filter((group): group is IAMGroup => group !== undefined);

        // Get policy details for this user
        const policies = userData.AttachedManagedPolicies.map((attachedPolicy: { PolicyArn: string }) => {
          const policyArn = attachedPolicy.PolicyArn;
          return Object.values(processedData.policies as Record<string, IAMPolicy>).find((policy: IAMPolicy) => policy.Arn === policyArn);
        }).filter((policy): policy is IAMPolicy => policy !== undefined);

        // Get assumable roles
        const roles = findAssumableRoles(userData, processedData.roles);

        setUserGroups(groups);
        setUserPolicies(policies);
        setAssumableRoles(roles);
      } catch (error) {
        console.error('Failed to load user data:', error);
        router.push('/');
      }
    };

    loadUserData();
  }, [userId, router]);

  const privescResults = useMemo((): EntityPrivescResult[] => {
    if (!user) return [];
    const managedPolicies = userPolicies.map((p) => ({
      PolicyName: p.PolicyName,
      Arn: p.Arn,
      PolicyVersionList: p.PolicyVersionList,
      DefaultVersionId: p.DefaultVersionId,
    }));
    const inlinePolicies = (user.UserPolicyList || []).map((p) => ({
      PolicyName: p.PolicyName,
      PolicyDocument: p.PolicyDocument,
    }));
    return analyzeEntityPolicies(managedPolicies as Parameters<typeof analyzeEntityPolicies>[0], inlinePolicies);
  }, [user, userPolicies]);

  const allMatches = useMemo(
    () => privescResults.flatMap((r) => r.matches),
    [privescResults]
  );

  if (!user || !data) {
    return (
      <div className="max-w-6xl mx-auto space-y-8 overflow-hidden">
        <Breadcrumb />
        <div className="flex items-center space-x-4">
          <Skeleton className="h-9 w-24" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-80" />
          </div>
        </div>
        <div className="space-y-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 overflow-hidden">
      <Breadcrumb />
      <div className="flex items-center space-x-4">
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold">User Details: {user.UserName}</h1>
          <p className="text-muted-foreground">Comprehensive user information and permissions</p>
        </div>
      </div>

      {/* Privilege Escalation Warning */}
      {allMatches.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle className="text-lg font-bold">
            Privilege Escalation Risk Detected
          </AlertTitle>
          <AlertDescription>
            <p className="mt-2 mb-3">
              This user has policies that match {allMatches.length} known privilege escalation
              {allMatches.length > 1 ? ' paths' : ' path'} across {privescResults.length} policy document
              {privescResults.length > 1 ? 's' : ''}. See{" "}
              <a
                href="https://pathfinding.cloud/paths/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline inline-flex items-center gap-1"
              >
                pathfinding.cloud <ExternalLink className="h-3 w-3" />
              </a>{" "}
              for details:
            </p>
            <div className="space-y-3 mt-3">
              {privescResults.map((result, i) => (
                <div key={i}>
                  <p className="text-sm font-semibold mb-2">
                    {result.policyType === "inline" ? "Inline" : "Managed"} Policy: {result.policyName}
                    {result.policyArn && (
                      <span className="font-mono text-xs ml-2 text-muted-foreground">({result.policyArn})</span>
                    )}
                  </p>
                  {result.matches.map((match) => (
                    <div key={match.path.id} className="border-l-2 border-destructive/50 pl-4 mb-2">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="destructive" className="text-xs">
                          {CATEGORY_LABELS[match.path.category] || match.path.category}
                        </Badge>
                        <span className="font-semibold text-sm">{match.path.name}</span>
                        {match.allRequiredPresent ? (
                          <Badge variant="destructive" className="text-xs">All required permissions present</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            Missing: {match.missingPermissions.join(", ")}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {match.path.description.length > 200
                          ? match.path.description.slice(0, 200) + "..."
                          : match.path.description}
                      </p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-8">
        {/* User Information */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 flex items-center space-x-2">
            <User className="h-5 w-5" />
            <span>User Information</span>
          </h2>
          <div className="bg-muted/50 rounded-lg p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">User Name</label>
                <CopyField value={user.UserName}>
                  <p className="text-sm font-medium">{user.UserName}</p>
                </CopyField>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">User ID</label>
                <CopyField value={user.UserId}>
                  <p className="text-sm">{user.UserId}</p>
                </CopyField>
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-muted-foreground">ARN</label>
                <CopyField value={user.Arn}>
                  <p className="text-sm font-mono break-all">{user.Arn}</p>
                </CopyField>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Created</label>
                <CopyField value={formatDateTime(user.CreateDate)}>
                  <p className="text-sm">{formatDateTime(user.CreateDate)}</p>
                </CopyField>
              </div>
            </div>
            {user.Tags && user.Tags.length > 0 && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Tags</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {user.Tags.map((tag, index) => (
                    <Badge key={index} variant="outline">
                      {tag.Key}: {tag.Value}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Group Memberships */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 flex items-center space-x-2">
            <Users className="h-5 w-5" />
            <span>Group Memberships</span>
            <span className="text-sm font-normal text-muted-foreground">
              ({userGroups.length} group{userGroups.length !== 1 ? 's' : ''})
            </span>
          </h2>
          {userGroups.length > 0 ? (
            <div className="bg-muted/50 rounded-lg p-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Group Name</TableHead>
                    <TableHead>ARN</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {userGroups.map((group) => (
                    <TableRow key={group.GroupId}>
                      <TableCell className="font-medium">
                        <CopyField value={group.GroupName}>
                          {group.GroupName}
                        </CopyField>
                      </TableCell>
                      <TableCell>
                        <CopyField value={group.Arn}>
                          <span className="font-mono text-sm">{group.Arn}</span>
                        </CopyField>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/group/${group.GroupId}`)}
                        >
                          View Group
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="bg-muted/50 rounded-lg p-6">
              <p className="text-muted-foreground">User is not a member of any groups</p>
            </div>
          )}
        </section>

        {/* Attached Policies */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 flex items-center space-x-2">
            <Shield className="h-5 w-5" />
            <span>Attached Policies</span>
            <span className="text-sm font-normal text-muted-foreground">
              ({userPolicies.length} polic{userPolicies.length !== 1 ? 'ies' : 'y'})
            </span>
          </h2>
          {userPolicies.length > 0 ? (
            <div className="bg-muted/50 rounded-lg p-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Policy Name</TableHead>
                    <TableHead>ARN</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {userPolicies.map((policy) => {
                    const policyRisk = privescResults.find(
                      (r) => r.policyArn === policy.Arn
                    );
                    return (
                    <TableRow key={policy.PolicyId}>
                      <TableCell className="font-medium">
                        <CopyField value={policy.PolicyName}>
                          {policy.PolicyName}
                        </CopyField>
                      </TableCell>
                      <TableCell>
                        <CopyField value={policy.Arn}>
                          <span className="font-mono text-sm">{policy.Arn}</span>
                        </CopyField>
                      </TableCell>
                      <TableCell>
                        {policyRisk ? (
                          <Badge variant="destructive" className="text-xs">
                            {policyRisk.matches.length} path{policyRisk.matches.length > 1 ? "s" : ""}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">None</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/policy/${policy.PolicyId}`)}
                        >
                          View Policy
                        </Button>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="bg-muted/50 rounded-lg p-6">
              <p className="text-muted-foreground">No policies directly attached to this user</p>
            </div>
          )}
        </section>

        {/* Inline Policies */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 flex items-center space-x-2">
            <FileText className="h-5 w-5" />
            <span>Inline Policies</span>
            <span className="text-sm font-normal text-muted-foreground">
              ({user.UserPolicyList?.length || 0} polic{user.UserPolicyList?.length !== 1 ? 'ies' : 'y'})
            </span>
          </h2>
          {user.UserPolicyList && user.UserPolicyList.length > 0 ? (
            <div className="bg-muted/50 rounded-lg p-6 space-y-6">
              {user.UserPolicyList.map((policy, index) => (
                <div key={index} className="space-y-2">
                  <h3 className="text-lg font-medium">{policy.PolicyName}</h3>
                  <JSONViewer data={policy.PolicyDocument} />
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-muted/50 rounded-lg p-6">
              <p className="text-muted-foreground">No inline policies defined for this user</p>
            </div>
          )}
        </section>

        {/* Assumable Roles */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 flex items-center space-x-2">
            <FileText className="h-5 w-5" />
            <span>Assumable Roles</span>
            <span className="text-sm font-normal text-muted-foreground">
              ({assumableRoles.length} role{assumableRoles.length !== 1 ? 's' : ''})
            </span>
          </h2>
          {assumableRoles.length > 0 ? (
            <div className="bg-muted/50 rounded-lg p-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role Name</TableHead>
                    <TableHead>ARN</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assumableRoles.map((role) => (
                    <TableRow key={role.RoleId}>
                      <TableCell className="font-medium">
                        <CopyField value={role.RoleName}>
                          {role.RoleName}
                        </CopyField>
                      </TableCell>
                      <TableCell>
                        <CopyField value={role.Arn}>
                          <span className="font-mono text-sm">{role.Arn}</span>
                        </CopyField>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/role/${role.RoleId}`)}
                        >
                          View Role
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="bg-muted/50 rounded-lg p-6">
              <p className="text-muted-foreground">User cannot assume any roles</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
} 