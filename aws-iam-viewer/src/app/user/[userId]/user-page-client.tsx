'use client';

import { useEffect, useReducer, useMemo, type ReactNode, type ReactElement } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, User, Shield, Users, FileText, AlertTriangle } from 'lucide-react';
import { IAMUser, ProcessedIAMData, IAMGroup, IAMPolicy, IAMRole } from '@/lib/types';
import { formatDateTime, findAssumableRoles } from '@/lib/iam-utils';
import { JSONViewer } from '@/components/ui/json-viewer';
import { indexedDBService } from '@/lib/indexeddb';
import {
  analyzeEntityPolicies,
  type EntityPrivescResult,
  type PrivescMatch,
  CATEGORY_LABELS,
} from '@/lib/privesc';
import { analyzeEffectivePermissions } from '@/lib/analysis';
import { Breadcrumb } from '@/components/breadcrumb';
import { EffectivePermissionsPanel } from '@/components/effective-permissions';
import { ClickableTableRow } from '@/components/clickable-table-row';

type MissingLoadState = "loading" | "missingUpload" | "missingUser" | "error" | "ready";

type UserState = {
  user: IAMUser | null;
  data: ProcessedIAMData | null;
  userGroups: IAMGroup[];
  userPolicies: IAMPolicy[];
  assumableRoles: IAMRole[];
  loadState: MissingLoadState;
};

type UserAction =
  | { type: 'set_load_state'; loadState: MissingLoadState }
  | {
      type: 'set_loaded';
      payload: {
        user: IAMUser;
        data: ProcessedIAMData;
        userGroups: IAMGroup[];
        userPolicies: IAMPolicy[];
        assumableRoles: IAMRole[];
      };
    };

const initialUserState: UserState = {
  user: null,
  data: null,
  userGroups: [],
  userPolicies: [],
  assumableRoles: [],
  loadState: 'loading',
};

function userReducer(state: UserState, action: UserAction): UserState {
  switch (action.type) {
    case 'set_load_state':
      return { ...state, loadState: action.loadState };
    case 'set_loaded':
      return {
        ...state,
        ...action.payload,
        loadState: 'ready',
      };
    default:
      return state;
  }
}

export default function UserDetailsPage() {
  const [{ user, data, userGroups, userPolicies, assumableRoles, loadState }, dispatch] = useReducer(
    userReducer,
    initialUserState
  );

  const router = useRouter();
  const params = useParams();
  const userId = params.userId as string;

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const currentUploadId = await indexedDBService.getCurrentUploadId();
        if (!currentUploadId) {
          dispatch({ type: 'set_load_state', loadState: 'missingUpload' });
          return;
        }

        const upload = await indexedDBService.getUpload(currentUploadId);
        if (!upload) {
          dispatch({ type: 'set_load_state', loadState: 'error' });
          return;
        }

        const processedData = upload.data;
        const userData = processedData.users[userId];

        if (!userData) {
          dispatch({ type: 'set_load_state', loadState: 'missingUser' });
          return;
        }

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

        dispatch({
          type: 'set_loaded',
          payload: {
            user: userData,
            data: processedData,
            userGroups: groups,
            userPolicies: policies,
            assumableRoles: roles,
          },
        });
      } catch (error) {
        console.error('Failed to load user data:', error);
        dispatch({ type: 'set_load_state', loadState: 'error' });
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

  const effectivePermissions = useMemo(
    () => data && user ? analyzeEffectivePermissions(data, "user", user.UserId) : null,
    [data, user]
  );

  if (loadState !== 'ready' || !user || !data) {
    if (loadState === 'missingUpload' || loadState === 'error') {
      return (
        <div className="max-w-6xl mx-auto space-y-8 overflow-hidden">
          <Breadcrumb />
          <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground bg-muted/30">
            Could not load the IAM dataset for this user.
            <div className="mt-4">
              <Button variant="outline" onClick={() => router.push('/')}>
                Go to upload
              </Button>
            </div>
          </div>
        </div>
      );
    }

    if (loadState === 'missingUser') {
      return (
        <div className="max-w-6xl mx-auto space-y-8 overflow-hidden">
          <Breadcrumb />
          <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground bg-muted/30">
            This user does not exist in the current dataset.
            <div className="mt-4">
              <Button variant="outline" onClick={() => router.push('/dashboard')}>
                Back to dashboard
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="max-w-6xl mx-auto space-y-8 overflow-hidden">
        <Breadcrumb />
        <div className="flex items-center gap-4">
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
    <UserDetailsContent
      user={user}
      effectivePermissions={effectivePermissions}
      allMatches={allMatches}
      privescResults={privescResults}
      userGroups={userGroups}
      userPolicies={userPolicies}
      assumableRoles={assumableRoles}
      onBack={() => router.back()}
    />
  );
}

type UserDetailsContentProps = {
  user: IAMUser;
  effectivePermissions: ReturnType<typeof analyzeEffectivePermissions>;
  allMatches: PrivescMatch[];
  privescResults: EntityPrivescResult[];
  userGroups: IAMGroup[];
  userPolicies: IAMPolicy[];
  assumableRoles: IAMRole[];
  onBack: () => void;
};

function UserDetailsContent({
  user,
  effectivePermissions,
  allMatches,
  privescResults,
  userGroups,
  userPolicies,
  assumableRoles,
  onBack,
}: UserDetailsContentProps) {
  return (
    <div className="max-w-6xl mx-auto space-y-8 overflow-hidden">
      <Breadcrumb />
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="size-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold">User Details: {user.UserName}</h1>
          <p className="text-muted-foreground">Comprehensive user information and permissions</p>
        </div>
      </div>

      <UserPrivilegeEscalationBlock allMatches={allMatches} privescResults={privescResults} />

      <div className="space-y-8">
        <section>
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <User className="size-5" />
            <span>User Information</span>
          </h2>
          <div className="bg-muted/50 rounded-lg p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-medium text-muted-foreground">User Name</div>
                <p className="text-sm font-medium">{user.UserName}</p>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">User ID</div>
                <p className="text-sm">{user.UserId}</p>
              </div>
              <div className="md:col-span-2">
                <div className="text-sm font-medium text-muted-foreground">ARN</div>
                <p className="text-sm font-mono break-all">{user.Arn}</p>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">Created</div>
                <p className="text-sm">{formatDateTime(user.CreateDate)}</p>
              </div>
            </div>
            {user.Tags && user.Tags.length > 0 && (
              <div>
                <div className="text-sm font-medium text-muted-foreground">Tags</div>
                <div className="flex flex-wrap gap-2 mt-1">
                  {user.Tags.map((tag) => (
                    <Badge key={`${tag.Key}:${tag.Value}`} variant="outline">
                      {tag.Key}: {tag.Value}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {effectivePermissions && <EffectivePermissionsPanel effective={effectivePermissions} />}

      <EntityListSection
        icon={<Users className="size-5" />}
        title="Group Memberships"
        totalCount={userGroups.length}
        emptyMessage="User is not a member of any groups"
        hasRows={userGroups.length > 0}
      >
          <DataListTable
            columns={[
              { label: 'Group Name' },
              { label: 'ARN' },
            ]}
            rows={userGroups.map((group) => ({
              key: group.GroupId,
              href: `/group/${group.GroupId}`,
              cells: [
                <span className="font-medium" key="name">{group.GroupName}</span>,
                <span className="font-mono text-sm" key="arn">{group.Arn}</span>,
              ],
            }))}
          />
        </EntityListSection>

      <EntityListSection
        icon={<Shield className="size-5" />}
        title="Attached Policies"
        totalCount={userPolicies.length}
        totalLabel={`${userPolicies.length} polic${userPolicies.length !== 1 ? 'ies' : 'y'}`}
        emptyMessage="No policies directly attached to this user"
        hasRows={userPolicies.length > 0}
      >
          <DataListTable
            columns={[
              { label: 'Policy Name' },
              { label: 'ARN' },
              { label: 'Risk' },
            ]}
            rows={userPolicies.map((policy) => {
              const policyRisk = privescResults.find((r) => r.policyArn === policy.Arn);
              return {
                key: policy.PolicyId,
                href: `/policy/${policy.PolicyId}`,
                cells: [
                  <span className="font-medium" key="name">{policy.PolicyName}</span>,
                  <span className="font-mono text-sm" key="arn">{policy.Arn}</span>,
                  policyRisk ? (
                    <Badge variant="destructive" className="text-xs" key="risk">
                      {policyRisk.matches.length} path{policyRisk.matches.length > 1 ? 's' : ''}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground" key="risk">None</span>
                  ),
                ],
              };
            })}
          />
        </EntityListSection>

        <section>
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <FileText className="size-5" />
            <span>Inline Policies</span>
            <span className="text-sm font-normal text-muted-foreground">
              ({user.UserPolicyList?.length || 0} polic{user.UserPolicyList?.length !== 1 ? 'ies' : 'y'})
            </span>
          </h2>
          {user.UserPolicyList && user.UserPolicyList.length > 0 ? (
            <div className="bg-muted/50 rounded-lg p-6 space-y-6">
              {user.UserPolicyList.map((policy) => (
                <div key={policy.PolicyName} className="space-y-2">
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

      <EntityListSection
        icon={<FileText className="size-5" />}
        title="Assumable Roles"
        totalCount={assumableRoles.length}
        totalLabel={`${assumableRoles.length} role${assumableRoles.length !== 1 ? 's' : ''}`}
        emptyMessage="User cannot assume any roles"
        hasRows={assumableRoles.length > 0}
      >
          <DataListTable
            columns={[
              { label: 'Role Name' },
              { label: 'ARN' },
            ]}
            rows={assumableRoles.map((role) => ({
              key: role.RoleId,
              href: `/role/${role.RoleId}`,
              cells: [
                <span className="font-medium" key="name">{role.RoleName}</span>,
                <span className="font-mono text-sm" key="arn">{role.Arn}</span>,
              ],
            }))}
          />
        </EntityListSection>
      </div>
    </div>
  );
}

function UserPrivilegeEscalationBlock({
  allMatches,
  privescResults,
}: {
  allMatches: PrivescMatch[];
  privescResults: EntityPrivescResult[];
}) {
  if (allMatches.length === 0) return null;

  return (
    <Alert variant="destructive">
      <AlertTriangle className="size-5" />
      <AlertTitle className="text-lg font-bold">Privilege Escalation Risk Detected</AlertTitle>
      <AlertDescription>
        <p className="mt-2 mb-3">
          This user has policies that match {allMatches.length} known privilege escalation
          {allMatches.length > 1 ? ' paths' : ' path'} across {privescResults.length} policy document
          {privescResults.length > 1 ? 's' : ''}.
        </p>
        <details className="space-y-2">
          <summary className="cursor-pointer text-sm font-semibold">
            Show detected paths ({allMatches.length})
          </summary>
          <div className="mt-3 space-y-3">
            {privescResults.map((result) => (
              <div key={`${result.policyType}-${result.policyName}-${result.policyArn ?? 'inline'}`}>
                <p className="text-sm font-semibold mb-2">
                  {result.policyType === 'inline' ? 'Inline' : 'Managed'} Policy: {result.policyName}
                  {result.policyArn && (
                    <span className="font-mono text-xs ml-2 text-muted-foreground">({result.policyArn})</span>
                  )}
                </p>
                {result.matches.slice(0, 5).map((match) => (
                  <div key={match.path.id} className="border-l-2 border-destructive/50 pl-4 mb-2">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="destructive" className="text-xs">
                        {CATEGORY_LABELS[match.path.category] || match.path.category}
                      </Badge>
                      <span className="font-semibold text-sm">{match.path.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {match.path.description.length > 140
                        ? `${match.path.description.slice(0, 140)}...`
                        : match.path.description}
                    </p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </details>
      </AlertDescription>
    </Alert>
  );
}

type DataTableColumn = {
  label: string;
};

type DataListRow = {
  key: string;
  href: string;
  cells: ReactNode[];
};

function DataListTable({ columns, rows }: { columns: DataTableColumn[]; rows: DataListRow[] }) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead key={column.label}>{column.label}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <ClickableTableRow key={row.key} href={row.href}>
            {row.cells.map((cell, index) => (
              <TableCell key={`${row.key}-${columns[index]?.label ?? index}`}>{cell}</TableCell>
            ))}
          </ClickableTableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function EntityListSection({
  icon,
  title,
  totalCount,
  totalLabel,
  emptyMessage,
  children,
  hasRows,
}: {
  icon: ReactElement;
  title: string;
  totalCount: number;
  totalLabel?: string;
  emptyMessage: string;
  children: ReactNode;
  hasRows: boolean;
}) {
  if (!hasRows) {
    return (
      <section>
        <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
          {icon}
          <span>{title}</span>
          <span className="text-sm font-normal text-muted-foreground">
            ({totalLabel ?? `${totalCount} item${totalCount !== 1 ? 's' : ''}`})
          </span>
        </h2>
        <div className="bg-muted/50 rounded-lg p-6">
          <p className="text-muted-foreground">{emptyMessage}</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
        {icon}
        <span>{title}</span>
        <span className="text-sm font-normal text-muted-foreground">
          ({totalLabel ?? `${totalCount} item${totalCount !== 1 ? 's' : ''}`})
        </span>
      </h2>
      <div className="bg-muted/50 rounded-lg p-6">{children}</div>
    </section>
  );
}
