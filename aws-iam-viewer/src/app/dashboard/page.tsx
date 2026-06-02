'use client';

import { useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Breadcrumb } from '@/components/breadcrumb';
import { ClickableTableRow } from '@/components/clickable-table-row';
import { Search, Users, Shield, FileText, UserCheck, ShieldAlert, GitCompare } from 'lucide-react';
import { IAMPolicy, IAMRole, IAMGroup, ProcessedIAMData } from '@/lib/types';
import { formatDateTime, truncateArn } from '@/lib/iam-utils';
import { indexedDBService } from '@/lib/indexeddb';
import { analyzePolicyForPrivesc } from '@/lib/privesc';
import { analyzeSecurityFindings, getDefaultPolicyDocument } from '@/lib/analysis';

export const metadata = {
  title: 'IAM Dashboard',
  description: 'Summary view of users, roles, policies, and findings from the selected IAM upload.',
};

type MissingUploadState = 'loading' | 'missing' | 'notFound' | 'ready';

type DashboardState = {
  data: ProcessedIAMData | null;
  currentUpload: { name: string; data: ProcessedIAMData } | null;
  searchTerm: string;
  activeTab: 'users' | 'roles' | 'policies' | 'groups';
  loadState: MissingUploadState;
};

type DashboardAction =
  | { type: 'set_data'; data: ProcessedIAMData | null }
  | { type: 'set_current_upload'; currentUpload: { name: string; data: ProcessedIAMData } | null }
  | { type: 'set_search_term'; searchTerm: string }
  | { type: 'set_active_tab'; activeTab: DashboardState['activeTab'] }
  | { type: 'set_load_state'; loadState: MissingUploadState };

const initialDashboardState: DashboardState = {
  data: null,
  currentUpload: null,
  searchTerm: '',
  activeTab: 'users',
  loadState: 'loading',
};

const AWS_MANAGED_POLICY_PREFIX = 'arn:aws:iam::aws:policy/';

function dashboardReducer(state: DashboardState, action: DashboardAction): DashboardState {
  switch (action.type) {
    case 'set_data':
      return { ...state, data: action.data };
    case 'set_current_upload':
      return { ...state, currentUpload: action.currentUpload };
    case 'set_search_term':
      return { ...state, searchTerm: action.searchTerm };
    case 'set_active_tab':
      return { ...state, activeTab: action.activeTab };
    case 'set_load_state':
      return { ...state, loadState: action.loadState };
    default:
      return state;
  }
}

function categorizeRoles(roles: Record<string, IAMRole>) {
  const userRoles: [string, IAMRole][] = [];
  const serviceRoles: [string, IAMRole][] = [];

  Object.entries(roles).forEach(([roleId, role]) => {
    if (role.Arn.includes('/aws-service-role/')) {
      serviceRoles.push([roleId, role]);
    } else {
      userRoles.push([roleId, role]);
    }
  });

  return { userRoles, serviceRoles };
}

function categorizePolicies(policies: Record<string, IAMPolicy>) {
  const userPolicies: [string, IAMPolicy][] = [];
  const serviceRolePolicies: [string, IAMPolicy][] = [];
  const managedPolicies: [string, IAMPolicy][] = [];

  Object.entries(policies).forEach(([policyId, policy]) => {
    if (policy.Arn.includes('::aws:policy/aws-service-role/') || policy.Arn.includes(':policy/service-role/')) {
      serviceRolePolicies.push([policyId, policy]);
    } else if (
      policy.Arn.startsWith(AWS_MANAGED_POLICY_PREFIX) &&
      !policy.Arn.includes('/aws-service-role/') &&
      !policy.Arn.includes('/service-role/')
    ) {
      managedPolicies.push([policyId, policy]);
    } else {
      userPolicies.push([policyId, policy]);
    }
  });

  return { userPolicies, serviceRolePolicies, managedPolicies };
}

export default function DashboardPage() {
  const [state, dispatch] = useReducer(dashboardReducer, initialDashboardState);
  const { data, currentUpload, searchTerm, activeTab, loadState } = state;
  const router = useRouter();

  const policyRiskMap = useMemo(() => {
    const riskMap: Record<string, number> = {};
    if (!data) return riskMap;

    for (const policy of Object.values(data.policies)) {
      if (policy.Arn.startsWith(AWS_MANAGED_POLICY_PREFIX)) continue;
      const document = getDefaultPolicyDocument(policy);
      if (!document) continue;
      const matches = analyzePolicyForPrivesc(document);
      if (matches.length > 0) riskMap[policy.Arn] = matches.length;
    }

    return riskMap;
  }, [data]);

  const findings = useMemo(() => (data ? analyzeSecurityFindings(data) : []), [data]);
  const highSeverityFindings = useMemo(
    () => findings.filter((finding) => finding.severity === 'critical' || finding.severity === 'high'),
    [findings]
  );

  useEffect(() => {
    const loadCurrentUpload = async () => {
      try {
        const currentUploadId = await indexedDBService.getCurrentUploadId();
        if (!currentUploadId) {
          dispatch({ type: 'set_load_state', loadState: 'missing' });
          return;
        }

        const upload = await indexedDBService.getUpload(currentUploadId);
        if (!upload) {
          dispatch({ type: 'set_load_state', loadState: 'notFound' });
          return;
        }

        dispatch({ type: 'set_current_upload', currentUpload: upload });
        dispatch({ type: 'set_data', data: upload.data });
        dispatch({ type: 'set_load_state', loadState: 'ready' });
      } catch (error) {
        console.error('Failed to load current upload:', error);
        dispatch({ type: 'set_load_state', loadState: 'notFound' });
      }
    };

    loadCurrentUpload();
  }, []);

  if (loadState === 'loading' || !data || !currentUpload) {
    if (loadState === 'missing' || loadState === 'notFound') {
      return (
        <div className="max-w-6xl mx-auto space-y-6">
          <Breadcrumb />
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">
              {loadState === 'notFound'
                ? 'No data was found for the current upload.'
                : 'No upload is available in your browser session. Upload a file first.'}
            </p>
            <div className="mt-4">
              <Button variant="outline" onClick={() => router.push('/')}>
                Upload IAM Data
              </Button>
            </div>
          </Card>
        </div>
      );
    }

    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <Breadcrumb />
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const users = Object.entries(data.users);
  const roles = data.roles;
  const policies = data.policies;
  const groups = data.groups;

  const filteredUsers = users.filter(([, user]) => {
    const term = searchTerm.toLowerCase();
    return user.UserName.toLowerCase().includes(term) || user.Arn.toLowerCase().includes(term);
  });

  const { userRoles, serviceRoles } = categorizeRoles(roles);
  const filteredUserRoles = userRoles.filter(([, role]) => {
    const term = searchTerm.toLowerCase();
    return role.RoleName.toLowerCase().includes(term) || role.Arn.toLowerCase().includes(term);
  });
  const filteredServiceRoles = serviceRoles.filter(([, role]) => {
    const term = searchTerm.toLowerCase();
    return role.RoleName.toLowerCase().includes(term) || role.Arn.toLowerCase().includes(term);
  });

  const { userPolicies, serviceRolePolicies, managedPolicies } = categorizePolicies(policies);
  const filteredUserPolicies = userPolicies.filter(([, policy]) => {
    const term = searchTerm.toLowerCase();
    return policy.PolicyName.toLowerCase().includes(term) || policy.Arn.toLowerCase().includes(term);
  });
  const filteredServiceRolePolicies = serviceRolePolicies.filter(([, policy]) => {
    const term = searchTerm.toLowerCase();
    return policy.PolicyName.toLowerCase().includes(term) || policy.Arn.toLowerCase().includes(term);
  });
  const filteredManagedPolicies = managedPolicies.filter(([, policy]) => {
    const term = searchTerm.toLowerCase();
    return policy.PolicyName.toLowerCase().includes(term) || policy.Arn.toLowerCase().includes(term);
  });

  const filteredGroups = Object.entries(groups).filter(([, group]) => {
    const term = searchTerm.toLowerCase();
    return group.GroupName.toLowerCase().includes(term) || group.Arn.toLowerCase().includes(term);
  });

  return (
    <DashboardContent
      currentUpload={currentUpload}
      data={data}
      findings={findings}
      highSeverityFindings={highSeverityFindings}
      searchTerm={searchTerm}
      activeTab={activeTab}
      policyRiskMap={policyRiskMap}
      filteredUsers={filteredUsers}
      filteredUserRoles={filteredUserRoles}
      filteredServiceRoles={filteredServiceRoles}
      filteredUserPolicies={filteredUserPolicies}
      filteredServiceRolePolicies={filteredServiceRolePolicies}
      filteredManagedPolicies={filteredManagedPolicies}
      filteredGroups={filteredGroups}
      userRoles={userRoles}
      serviceRoles={serviceRoles}
      userPolicies={userPolicies}
      serviceRolePolicies={serviceRolePolicies}
      managedPolicies={managedPolicies}
      totalUsers={users.length}
      totalRoles={Object.keys(roles).length}
      totalPolicies={Object.keys(policies).length}
      totalGroups={Object.keys(groups).length}
      onSearchTerm={(next) => dispatch({ type: 'set_search_term', searchTerm: next })}
      onTabChange={(nextTab) => dispatch({ type: 'set_active_tab', activeTab: nextTab })}
      onNavigateUpload={() => router.push('/')}
      onNavigateFindings={() => router.push('/findings')}
      onNavigateDiff={() => router.push('/diff')}
    />
  );
}

type DashboardContentProps = {
  currentUpload: { name: string; data: ProcessedIAMData };
  data: ProcessedIAMData;
  findings: Array<{ severity: string }>;
  highSeverityFindings: Array<{ severity: string }>;
  searchTerm: string;
  activeTab: 'users' | 'roles' | 'policies' | 'groups';
  policyRiskMap: Record<string, number>;
  filteredUsers: [string, any][];
  filteredUserRoles: [string, IAMRole][];
  filteredServiceRoles: [string, IAMRole][];
  filteredUserPolicies: [string, IAMPolicy][];
  filteredServiceRolePolicies: [string, IAMPolicy][];
  filteredManagedPolicies: [string, IAMPolicy][];
  filteredGroups: [string, IAMGroup][];
  userRoles: [string, IAMRole][];
  serviceRoles: [string, IAMRole][];
  userPolicies: [string, IAMPolicy][];
  serviceRolePolicies: [string, IAMPolicy][];
  managedPolicies: [string, IAMPolicy][];
  totalUsers: number;
  totalRoles: number;
  totalPolicies: number;
  totalGroups: number;
  onSearchTerm: (value: string) => void;
  onTabChange: (value: DashboardState['activeTab']) => void;
  onNavigateUpload: () => void;
  onNavigateFindings: () => void;
  onNavigateDiff: () => void;
};

function DashboardContent({
  currentUpload,
  data,
  findings,
  highSeverityFindings,
  searchTerm,
  activeTab,
  policyRiskMap,
  filteredUsers,
  filteredUserRoles,
  filteredServiceRoles,
  filteredUserPolicies,
  filteredServiceRolePolicies,
  filteredManagedPolicies,
  filteredGroups,
  userRoles,
  serviceRoles,
  userPolicies,
  serviceRolePolicies,
  managedPolicies,
  totalUsers,
  totalRoles,
  totalPolicies,
  totalGroups,
  onSearchTerm,
  onTabChange,
  onNavigateUpload,
  onNavigateFindings,
  onNavigateDiff,
}: DashboardContentProps) {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Breadcrumb />
      <DashboardHeader
        uploadName={currentUpload.name}
        onUpload={() => onNavigateUpload()}
        onFindings={() => onNavigateFindings()}
        onDiff={() => onNavigateDiff()}
      />

      <DashboardStats
        users={totalUsers}
        roles={totalRoles}
        policies={totalPolicies}
        groups={totalGroups}
        findings={findings.length}
        highSeverityFindings={highSeverityFindings.length}
      />

      <Tabs
        value={activeTab}
        onValueChange={(nextTab) => onTabChange(nextTab as DashboardState['activeTab'])}
        className="space-y-4"
      >
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
          <TabsTrigger value="groups">Groups</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <DashboardSearchInput searchTerm={searchTerm} placeholder="Search users..." onSearch={onSearchTerm} />
          <EntitiesCard
            title="Users"
            count={filteredUsers.length}
            total={Object.keys(data.users).length}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User Name</TableHead>
                  <TableHead>ARN</TableHead>
                  <TableHead>Create Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map(([userId, user]) => (
                  <ClickableTableRow key={userId} href={`/user/${userId}`}>
                    <TableCell className="font-medium">{user.UserName}</TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">{truncateArn(user.Arn)}</span>
                    </TableCell>
                    <TableCell>{formatDateTime(user.CreateDate)}</TableCell>
                  </ClickableTableRow>
                ))}
              </TableBody>
            </Table>
          </EntitiesCard>
        </TabsContent>

        <TabsContent value="roles" className="space-y-6">
          <DashboardSearchInput searchTerm={searchTerm} placeholder="Search roles..." onSearch={onSearchTerm} />
          <EntitiesCard
            title="User-Defined Roles"
            badge={userRoles.length}
            count={filteredUserRoles.length}
            total={userRoles.length}
          >
            <RoleTable rows={filteredUserRoles} />
          </EntitiesCard>

          <EntitiesCard
            title="AWS Service-Linked Roles"
            badge={serviceRoles.length}
            count={filteredServiceRoles.length}
            total={serviceRoles.length}
          >
            <RoleTable rows={filteredServiceRoles} />
          </EntitiesCard>
        </TabsContent>

        <TabsContent value="policies" className="space-y-6">
          <DashboardSearchInput searchTerm={searchTerm} placeholder="Search policies..." onSearch={onSearchTerm} />
      <PolicyListCard
        title="User-Defined Policies"
        badge={userPolicies.length}
        count={filteredUserPolicies.length}
        total={userPolicies.length}
        policyRiskMap={policyRiskMap}
        policies={filteredUserPolicies}
        showRisk
      />
      <PolicyListCard
        title="AWS Service Role Policies"
        badge={serviceRolePolicies.length}
        count={filteredServiceRolePolicies.length}
        total={serviceRolePolicies.length}
        policyRiskMap={policyRiskMap}
        policies={filteredServiceRolePolicies}
        showRisk={false}
      />
      <PolicyListCard
        title="AWS Managed Policies"
        badge={managedPolicies.length}
        count={filteredManagedPolicies.length}
        total={managedPolicies.length}
        policyRiskMap={policyRiskMap}
        policies={filteredManagedPolicies}
        showRisk={false}
      />
        </TabsContent>

        <TabsContent value="groups" className="space-y-4">
          <DashboardSearchInput searchTerm={searchTerm} placeholder="Search groups..." onSearch={onSearchTerm} />
          <EntitiesCard title="Groups" count={filteredGroups.length} total={Object.keys(data.groups).length}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Group Name</TableHead>
                  <TableHead>ARN</TableHead>
                  <TableHead>Create Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGroups.map(([groupId, group]) => (
                  <ClickableTableRow key={groupId} href={`/group/${groupId}`}>
                    <TableCell className="font-medium">{group.GroupName}</TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">{truncateArn(group.Arn)}</span>
                    </TableCell>
                    <TableCell>{formatDateTime(group.CreateDate)}</TableCell>
                  </ClickableTableRow>
                ))}
              </TableBody>
            </Table>
          </EntitiesCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DashboardHeader({
  uploadName,
  onUpload,
  onFindings,
  onDiff,
}: {
  uploadName: string;
  onUpload: () => void;
  onFindings: () => void;
  onDiff: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold">IAM Dashboard</h1>
        <p className="text-muted-foreground">Analyzing: {uploadName}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onFindings}>
          <ShieldAlert className="size-4 mr-2" />
          Findings
        </Button>
        <Button variant="outline" onClick={onDiff}>
          <GitCompare className="size-4 mr-2" />
          Diff
        </Button>
        <Button variant="outline" onClick={onUpload}>
          Upload New File
        </Button>
      </div>
    </div>
  );
}

function DashboardStats({
  users,
  roles,
  policies,
  groups,
  findings,
  highSeverityFindings,
}: {
  users: number;
  roles: number;
  policies: number;
  groups: number;
  findings: number;
  highSeverityFindings: number;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Users</CardTitle>
          <Users className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{users}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Roles</CardTitle>
          <Shield className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{roles}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Policies</CardTitle>
          <FileText className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{policies}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Groups</CardTitle>
          <UserCheck className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{groups}</div>
        </CardContent>
      </Card>
      <Card className={highSeverityFindings > 0 ? 'border-destructive/40' : undefined}>
        <CardHeader className="flex flex-row items-center justify-between gap-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Findings</CardTitle>
          <ShieldAlert className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{findings}</div>
          <p className="text-xs text-muted-foreground">{highSeverityFindings} critical/high</p>
        </CardContent>
      </Card>
    </div>
  );
}

function DashboardSearchInput({
  searchTerm,
  placeholder,
  onSearch,
}: {
  searchTerm: string;
  placeholder: string;
  onSearch: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Search className="size-4 text-muted-foreground" />
      <Input
        placeholder={placeholder}
        value={searchTerm}
        onChange={(event) => onSearch(event.target.value)}
        className="max-w-sm"
      />
    </div>
  );
}

function EntitiesCard({
  title,
  badge,
  count,
  total,
  children,
}: {
  title: string;
  badge?: number;
  count: number;
  total: number;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span>{title}</span>
          {badge !== undefined && <Badge variant="secondary">{badge}</Badge>}
        </CardTitle>
        <CardDescription>
          {count} of {total} {title.toLowerCase()}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {count > 0 ? (
          children
        ) : (
          <div className="text-center py-8">
            <p className="text-muted-foreground">No items found.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RoleTable({ rows }: { rows: [string, IAMRole][] }) {
  if (rows.length === 0) return null;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Role Name</TableHead>
          <TableHead>ARN</TableHead>
          <TableHead>Create Date</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(([roleId, role]) => (
          <ClickableTableRow key={roleId} href={`/role/${roleId}`}>
            <TableCell className="font-medium">{role.RoleName}</TableCell>
            <TableCell>
              <span className="font-mono text-sm">{truncateArn(role.Arn)}</span>
            </TableCell>
            <TableCell>{formatDateTime(role.CreateDate)}</TableCell>
          </ClickableTableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function PolicyListCard({
  title,
  badge,
  count,
  total,
  policies,
  policyRiskMap,
  showRisk,
}: {
  title: string;
  badge: number;
  count: number;
  total: number;
  policies: [string, IAMPolicy][];
  policyRiskMap: Record<string, number>;
  showRisk: boolean;
}) {
  return (
    <EntitiesCard title={title} badge={badge} count={count} total={total}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Policy Name</TableHead>
            <TableHead>ARN</TableHead>
            <TableHead>Create Date</TableHead>
            <TableHead>Attachment Count</TableHead>
            {showRisk && <TableHead>Risk</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {policies.map(([policyId, policy]) => {
            const riskCount = policyRiskMap[policy.Arn] || 0;
            return (
              <ClickableTableRow key={policyId} href={`/policy/${policyId}`}>
                <TableCell className="font-medium">{policy.PolicyName}</TableCell>
                <TableCell>
                  <span className="font-mono text-sm">{truncateArn(policy.Arn)}</span>
                </TableCell>
                <TableCell>{formatDateTime(policy.CreateDate)}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{policy.AttachmentCount}</Badge>
                </TableCell>
                {showRisk && (
                  <TableCell>
                    {riskCount > 0 ? (
                      <Badge variant="destructive" className="text-xs">
                        {riskCount} path{riskCount > 1 ? 's' : ''}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">None</span>
                    )}
                  </TableCell>
                )}
              </ClickableTableRow>
            );
          })}
        </TableBody>
      </Table>
    </EntitiesCard>
  );
}
