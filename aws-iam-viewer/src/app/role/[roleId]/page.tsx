'use client';

import { useEffect, useMemo, useReducer, type ReactElement, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, AlertTriangle, FileText, Shield } from 'lucide-react';
import { IAMPolicy, IAMRole, ProcessedIAMData } from '@/lib/types';
import { analyzeEffectivePermissions } from '@/lib/analysis';
import { analyzeEntityPolicies, CATEGORY_LABELS, type EntityPrivescResult, type PrivescMatch } from '@/lib/privesc';
import { findAssumableRolesForRole, findRoleAssumptionChain, formatDateTime } from '@/lib/iam-utils';
import { JSONViewer } from '@/components/ui/json-viewer';
import { indexedDBService } from '@/lib/indexeddb';
import { Breadcrumb } from '@/components/breadcrumb';
import { ClickableTableRow } from '@/components/clickable-table-row';
import { EffectivePermissionsPanel } from '@/components/effective-permissions';

export const metadata = {
  title: 'Role Details',
  description: 'Review IAM role policies, assumption paths, and attached permissions.',
};

type MissingLoadState = 'loading' | 'missingUpload' | 'missingRole' | 'error' | 'ready';

type RoleState = {
  role: IAMRole | null;
  data: ProcessedIAMData | null;
  rolePolicies: IAMPolicy[];
  assumableRoles: IAMRole[];
  rolesThatCanAssume: IAMRole[];
  assumptionChain: IAMRole[];
  loadState: MissingLoadState;
};

type RoleAction =
  | { type: 'set_load_state'; loadState: MissingLoadState }
  | {
      type: 'set_loaded';
      payload: {
        role: IAMRole;
        data: ProcessedIAMData;
        rolePolicies: IAMPolicy[];
        assumableRoles: IAMRole[];
        rolesThatCanAssume: IAMRole[];
        assumptionChain: IAMRole[];
      };
    };

const initialRoleState: RoleState = {
  role: null,
  data: null,
  rolePolicies: [],
  assumableRoles: [],
  rolesThatCanAssume: [],
  assumptionChain: [],
  loadState: 'loading',
};

function roleReducer(state: RoleState, action: RoleAction): RoleState {
  switch (action.type) {
    case 'set_load_state':
      return { ...state, loadState: action.loadState };
    case 'set_loaded':
      return { ...state, ...action.payload, loadState: 'ready' };
    default:
      return state;
  }
}

export default function RoleDetailsPage() {
  const [
    { role, data, rolePolicies, assumableRoles, rolesThatCanAssume, assumptionChain, loadState },
    dispatch,
  ] = useReducer(roleReducer, initialRoleState);
  const router = useRouter();
  const params = useParams();
  const roleId = params.roleId as string;

  useEffect(() => {
    const loadRoleData = async () => {
      try {
        const currentUploadId = await indexedDBService.getCurrentUploadId();
        if (!currentUploadId) {
          dispatch({ type: 'set_load_state', loadState: 'missingUpload' });
          return;
        }

        const upload = await indexedDBService.getUpload(currentUploadId);
        if (!upload) {
          dispatch({ type: 'set_load_state', loadState: 'missingUpload' });
          return;
        }

        const roleData = upload.data.roles[roleId];
        if (!roleData) {
          dispatch({ type: 'set_load_state', loadState: 'missingRole' });
          return;
        }

        const policies = roleData.AttachedManagedPolicies.map((attachedPolicy: { PolicyArn: string }) => {
          const policyArn = attachedPolicy.PolicyArn;
          return Object.values(upload.data.policies as Record<string, IAMPolicy>).find(
            (policy: IAMPolicy) => policy.Arn === policyArn
          );
        }).filter((policy): policy is IAMPolicy => policy !== undefined);

        const chain = findRoleAssumptionChain(roleData, upload.data.roles as Record<string, IAMRole>);
        const canAssumeRoles = findAssumableRolesForRole(roleData, upload.data.roles as Record<string, IAMRole>);
        const rolesThatCanAssume = Object.values(upload.data.roles as Record<string, IAMRole>).filter((otherRole) => {
          if (otherRole.RoleId === roleData.RoleId) return false;
          const otherRoleAssumableRoles = findAssumableRolesForRole(otherRole, upload.data.roles as Record<string, IAMRole>);
          return otherRoleAssumableRoles.some((r) => r.RoleId === roleData.RoleId);
        });

        dispatch({
          type: 'set_loaded',
          payload: {
            role: roleData,
            data: upload.data,
            rolePolicies: policies,
            assumableRoles: canAssumeRoles,
            rolesThatCanAssume,
            assumptionChain: chain,
          },
        });
      } catch (error) {
        console.error('Failed to load role data:', error);
        dispatch({ type: 'set_load_state', loadState: 'error' });
      }
    };

    loadRoleData();
  }, [roleId]);

  const privescResults = useMemo((): EntityPrivescResult[] => {
    if (!role) return [];

    const managedPolicies = rolePolicies.map((policy) => ({
      PolicyName: policy.PolicyName,
      Arn: policy.Arn,
      PolicyVersionList: policy.PolicyVersionList,
      DefaultVersionId: policy.DefaultVersionId,
    }));
    const inlinePolicies = (role.RolePolicyList || []).map((policy) => ({
      PolicyName: policy.PolicyName,
      PolicyDocument: policy.PolicyDocument,
    }));

    return analyzeEntityPolicies(managedPolicies as Parameters<typeof analyzeEntityPolicies>[0], inlinePolicies);
  }, [role, rolePolicies]);

  const allMatches = useMemo(() => privescResults.flatMap((result) => result.matches), [privescResults]);
  const effectivePermissions = useMemo(
    () => (data && role ? analyzeEffectivePermissions(data, 'role', role.RoleId) : null),
    [data, role]
  );

  if (loadState !== 'ready' || !role || !data) {
    if (loadState === 'missingUpload' || loadState === 'error') {
      return (
        <div className="max-w-6xl mx-auto space-y-8 overflow-hidden">
          <Breadcrumb />
          <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground bg-muted/30">
            Could not load the IAM dataset for this role.
            <div className="mt-4">
              <Button variant="outline" onClick={() => router.push('/')}>
                Go to upload
              </Button>
            </div>
          </div>
        </div>
      );
    }

    if (loadState === 'missingRole') {
      return (
        <div className="max-w-6xl mx-auto space-y-8 overflow-hidden">
          <Breadcrumb />
          <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground bg-muted/30">
            This role does not exist in the current dataset.
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
    <RoleDetailsContent
      role={role}
      allMatches={allMatches}
      privescResults={privescResults}
      effectivePermissions={effectivePermissions}
      rolePolicies={rolePolicies}
      assumableRoles={assumableRoles}
      rolesThatCanAssume={rolesThatCanAssume}
      assumptionChain={assumptionChain}
      onBack={() => router.back()}
    />
  );
}

type RoleDetailsContentProps = {
  role: IAMRole;
  allMatches: PrivescMatch[];
  privescResults: EntityPrivescResult[];
  effectivePermissions: ReturnType<typeof analyzeEffectivePermissions>;
  rolePolicies: IAMPolicy[];
  assumableRoles: IAMRole[];
  rolesThatCanAssume: IAMRole[];
  assumptionChain: IAMRole[];
  onBack: () => void;
};

function RoleDetailsContent({
  role,
  allMatches,
  privescResults,
  effectivePermissions,
  rolePolicies,
  assumableRoles,
  rolesThatCanAssume,
  assumptionChain,
  onBack,
}: RoleDetailsContentProps) {
  return (
    <div className="max-w-6xl mx-auto space-y-8 overflow-hidden">
      <Breadcrumb />
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="size-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Role Details: {role.RoleName}</h1>
          <p className="text-muted-foreground">Comprehensive role information and permissions</p>
        </div>
      </div>

      <PrivilegeEscalationSummary allMatches={allMatches} privescResults={privescResults} />

      <section>
        <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
          <Shield className="size-5" />
          <span>Role Information</span>
        </h2>
        <div className="bg-muted/50 rounded-lg p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground">Role Name</div>
              <p className="text-sm font-medium">{role.RoleName}</p>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">Role ID</div>
              <p className="text-sm">{role.RoleId}</p>
            </div>
            <div className="md:col-span-2">
              <div className="text-sm font-medium text-muted-foreground">ARN</div>
              <p className="text-sm font-mono break-all">{role.Arn}</p>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">Created</div>
              <p className="text-sm">{formatDateTime(role.CreateDate)}</p>
            </div>
          </div>
          {role.Tags?.length > 0 && (
            <div>
              <div className="text-sm font-medium text-muted-foreground">Tags</div>
              <div className="flex flex-wrap gap-2 mt-1">
                {role.Tags.map((tag) => (
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

      <section>
        <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
          <Shield className="size-5" />
          <span>Assume Role Policy</span>
          <span className="text-sm font-normal text-muted-foreground">(Who can assume this role)</span>
        </h2>
        <div className="bg-muted/50 rounded-lg p-6">
          {role.AssumeRolePolicyDocument && Object.keys(role.AssumeRolePolicyDocument).length > 0 ? (
            <JSONViewer data={role.AssumeRolePolicyDocument} />
          ) : (
            <p className="text-muted-foreground">Assume role policy not available</p>
          )}
        </div>
      </section>

      <SimpleListSection
        title="Roles This Role Can Assume"
        icon={<Shield className="size-5" />}
        totalCount={assumableRoles.length}
        totalLabel={`${assumableRoles.length} role${assumableRoles.length === 1 ? '' : 's'}`}
        emptyMessage="This role cannot assume any other roles"
        hasRows={assumableRoles.length > 0}
      >
        <DataListTable
          columns={[{ label: 'Role Name' }, { label: 'ARN' }]}
          rows={assumableRoles.map((item) => ({
            key: item.RoleId,
            href: `/role/${item.RoleId}`,
            cells: [
              <span className="font-medium" key={`${item.RoleId}-name`}>
                {item.RoleName}
              </span>,
              <span className="font-mono text-sm" key={`${item.RoleId}-arn`}>
                {item.Arn}
              </span>,
            ],
          }))}
        />
      </SimpleListSection>

      <SimpleListSection
        title="Roles That Can Assume This Role"
        icon={<Shield className="size-5" />}
        totalCount={rolesThatCanAssume.length}
        totalLabel={`${rolesThatCanAssume.length} role${rolesThatCanAssume.length === 1 ? '' : 's'}`}
        emptyMessage="No other roles can assume this role"
        hasRows={rolesThatCanAssume.length > 0}
      >
        <DataListTable
          columns={[{ label: 'Role Name' }, { label: 'ARN' }]}
          rows={rolesThatCanAssume.map((item) => ({
            key: item.RoleId,
            href: `/role/${item.RoleId}`,
            cells: [
              <span className="font-medium" key={`${item.RoleId}-name`}>
                {item.RoleName}
              </span>,
              <span className="font-mono text-sm" key={`${item.RoleId}-arn`}>
                {item.Arn}
              </span>,
            ],
          }))}
        />
      </SimpleListSection>

      <AssumptionChainSection currentRoleId={role.RoleId} chain={assumptionChain} />

      <SimpleListSection
        title="Attached Policies"
        icon={<FileText className="size-5" />}
        totalCount={rolePolicies.length}
        totalLabel={`${rolePolicies.length} polic${rolePolicies.length === 1 ? 'y' : 'ies'}`}
        emptyMessage="No policies directly attached to this role"
        hasRows={rolePolicies.length > 0}
      >
        <DataListTable
          columns={[{ label: 'Policy Name' }, { label: 'ARN' }, { label: 'Risk' }]}
          rows={rolePolicies.map((policy) => ({
            key: policy.PolicyId,
            href: `/policy/${policy.PolicyId}`,
            cells: [
              <span className="font-medium" key={`${policy.PolicyId}-name`}>
                {policy.PolicyName}
              </span>,
              <span className="font-mono text-sm" key={`${policy.PolicyId}-arn`}>
                {policy.Arn}
              </span>,
              privescResults.find((r) => r.policyArn === policy.Arn) ? (
                <Badge variant="destructive" className="text-xs" key={`${policy.PolicyId}-risk`}>
                  {privescResults.find((r) => r.policyArn === policy.Arn)?.matches.length} risk
                  {privescResults.find((r) => r.policyArn === policy.Arn)?.matches.length === 1 ? '' : 's'}
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground" key={`${policy.PolicyId}-risk-none`}>
                  None
                </span>
              ),
            ],
          }))}
        />
      </SimpleListSection>

      <section>
        <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
          <FileText className="size-5" />
          <span>Inline Policies</span>
          <span className="text-sm font-normal text-muted-foreground">
            ({role.RolePolicyList?.length || 0} polic{role.RolePolicyList?.length === 1 ? 'y' : 'ies'})
          </span>
        </h2>
        {role.RolePolicyList && role.RolePolicyList.length > 0 ? (
          <div className="bg-muted/50 rounded-lg p-6 space-y-6">
            {role.RolePolicyList.map((policy) => (
              <div key={policy.PolicyName} className="space-y-2">
                <h3 className="text-lg font-medium">{policy.PolicyName}</h3>
                <JSONViewer data={policy.PolicyDocument} />
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-muted/50 rounded-lg p-6">
            <p className="text-muted-foreground">No inline policies defined for this role.</p>
          </div>
        )}
      </section>
    </div>
  );
}

type PolicyTableRow = { key: string; href: string; cells: ReactNode[] };

type DataTableColumn = { label: string };

function DataListTable({ columns, rows }: { columns: DataTableColumn[]; rows: PolicyTableRow[] }) {
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

type SimpleListSectionProps = {
  icon: ReactElement;
  title: string;
  totalCount: number;
  totalLabel?: string;
  emptyMessage: string;
  children: ReactNode;
  hasRows: boolean;
};

function SimpleListSection({
  icon,
  title,
  totalCount,
  totalLabel,
  emptyMessage,
  children,
  hasRows,
}: SimpleListSectionProps) {
  return (
    <section>
      <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
        {icon}
        <span>{title}</span>
        <span className="text-sm font-normal text-muted-foreground">
          ({totalLabel ?? `${totalCount} item${totalCount === 1 ? '' : 's'}`})
        </span>
      </h2>
      {hasRows ? <div className="bg-muted/50 rounded-lg p-6">{children}</div> : <div className="bg-muted/50 rounded-lg p-6 text-muted-foreground">{emptyMessage}</div>}
    </section>
  );
}

function AssumptionChainSection({ chain, currentRoleId }: { chain: IAMRole[]; currentRoleId: string }) {
  if (chain.length === 0) {
    return null;
  }

  return (
    <section>
      <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
        <Shield className="size-5" />
        <span>Complete Assumption Chain</span>
        <span className="text-sm font-normal text-muted-foreground">
          ({chain.length} role{chain.length === 1 ? '' : 's'} in chain)
        </span>
      </h2>
      <div className="bg-muted/50 rounded-lg p-6">
        {chain.length > 1 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role Name</TableHead>
                <TableHead>ARN</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {chain.map((chainRole) => (
                <ClickableTableRow key={chainRole.RoleId} href={`/role/${chainRole.RoleId}`}>
                  <TableCell className="font-medium">
                    {chainRole.RoleName}
                    {chainRole.RoleId === currentRoleId && (
                      <Badge variant="secondary" className="ml-2">
                        Current
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-sm">{chainRole.Arn}</span>
                  </TableCell>
                </ClickableTableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-muted-foreground">This role is not part of an assumption chain</p>
        )}
      </div>
    </section>
  );
}

function PrivilegeEscalationSummary({
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
          This role has {allMatches.length} detected path{allMatches.length === 1 ? '' : 's'} in{' '}
          {privescResults.length} managed/inline policy document{privescResults.length === 1 ? '' : 's'}.
        </p>
        <details className="space-y-2">
          <summary className="cursor-pointer text-sm font-semibold">
            Show detected vectors ({allMatches.length})
          </summary>
          <div className="mt-3 space-y-3">
            {privescResults.map((result) => (
              <div key={`${result.policyType}-${result.policyName}-${result.policyArn ?? 'inline'}`}>
                <p className="text-sm font-semibold mb-2">
                  {result.policyType === 'inline' ? 'Inline' : 'Managed'} Policy: {result.policyName}
                  {result.policyArn && <span className="font-mono text-xs ml-2 text-muted-foreground">({result.policyArn})</span>}
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
                      {match.path.description.length > 140 ? `${match.path.description.slice(0, 140)}...` : match.path.description}
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
