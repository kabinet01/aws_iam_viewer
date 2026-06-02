'use client';

import { useEffect, useMemo, useReducer, type ReactElement } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, ExternalLink, Users, Shield, UserCheck } from 'lucide-react';
import { IAMPolicy, IAMPolicyDocument, IAMRole, IAMUser, IAMGroup, ProcessedIAMData } from '@/lib/types';
import { analyzePolicyForPrivesc, CATEGORY_LABELS, type PrivescMatch } from '@/lib/privesc';
import { formatDateTime, findAttachedEntities } from '@/lib/iam-utils';
import { JSONViewer } from '@/components/ui/json-viewer';
import { Breadcrumb } from '@/components/breadcrumb';
import { indexedDBService } from '@/lib/indexeddb';
import { getDefaultPolicyDocument } from '@/lib/analysis';
import { ClickableTableRow } from '@/components/clickable-table-row';

export const metadata = {
  title: 'Policy Details',
  description: 'Review IAM policy document, privilege-escalation signals, and attachments.',
};

type MissingPolicyLoadState = 'loading' | 'missingUpload' | 'missingPolicy' | 'error' | 'ready';

type PolicyState = {
  policy: IAMPolicy | null;
  data: ProcessedIAMData | null;
  policyDocument: IAMPolicyDocument | null;
  attachedUsers: IAMUser[];
  attachedRoles: IAMRole[];
  attachedGroups: IAMGroup[];
  privescMatches: PrivescMatch[];
  loadState: MissingPolicyLoadState;
};

type PolicyAction =
  | { type: 'set_load_state'; loadState: MissingPolicyLoadState }
  | {
      type: 'set_loaded';
      payload: {
        policy: IAMPolicy;
        data: ProcessedIAMData;
        policyDocument: IAMPolicyDocument | null;
        attachedUsers: IAMUser[];
        attachedRoles: IAMRole[];
        attachedGroups: IAMGroup[];
        privescMatches: PrivescMatch[];
      };
    };

const initialPolicyState: PolicyState = {
  policy: null,
  data: null,
  policyDocument: null,
  attachedUsers: [],
  attachedRoles: [],
  attachedGroups: [],
  privescMatches: [],
  loadState: 'loading',
};

function policyReducer(state: PolicyState, action: PolicyAction): PolicyState {
  switch (action.type) {
    case 'set_load_state':
      return { ...state, loadState: action.loadState };
    case 'set_loaded':
      return { ...state, ...action.payload, loadState: 'ready' };
    default:
      return state;
  }
}

const POLICY_LOADING_MESSAGE: Record<Exclude<MissingPolicyLoadState, 'ready'>, string> = {
  loading: 'Loading policy data.',
  missingUpload: 'No upload is available in this browser session. Upload a file first.',
  missingPolicy: 'The requested policy could not be found in the current upload.',
  error: 'There was an issue loading this policy.',
};

export default function PolicyDetailsPage() {
  const [{ policy, data, policyDocument, attachedUsers, attachedRoles, attachedGroups, privescMatches, loadState }, dispatch] =
    useReducer(policyReducer, initialPolicyState);
  const router = useRouter();
  const params = useParams();
  const policyId = params.policyId as string;

  useEffect(() => {
    const loadPolicyData = async () => {
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

        const policyData = upload.data.policies[policyId];
        if (!policyData) {
          dispatch({ type: 'set_load_state', loadState: 'missingPolicy' });
          return;
        }

        const document = getDefaultPolicyDocument(policyData);
        const rawMatches = document != null ? analyzePolicyForPrivesc(document, { includePartial: true, minMatchedPermissions: 2 }) : [];
        const privescMatches = rawMatches.filter(
          (match) => match.allRequiredPresent || match.matchedPermissionCount >= 2
        );

        const { users, roles, groups } = findAttachedEntities(policyData.Arn, upload.data);

        dispatch({
          type: 'set_loaded',
          payload: {
            policy: policyData,
            data: upload.data,
            policyDocument: document,
            attachedUsers: users,
            attachedRoles: roles,
            attachedGroups: groups,
            privescMatches,
          },
        });
      } catch (error) {
        console.error('Failed to load policy data:', error);
        dispatch({ type: 'set_load_state', loadState: 'error' });
      }
    };

    loadPolicyData();
  }, [policyId]);

  if (!data || !policy || loadState !== 'ready') {
    if (loadState !== 'loading' && loadState !== 'ready') {
      return (
        <div className="max-w-6xl mx-auto space-y-8 overflow-hidden">
          <Breadcrumb />
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Policy Details</h1>
            <p className="text-muted-foreground">{POLICY_LOADING_MESSAGE[loadState]}</p>
          </div>
          <div className="flex gap-2">
            {loadState === 'missingUpload' ? (
              <Button variant="outline" onClick={() => router.push('/')}>
                Upload IAM Data
              </Button>
            ) : (
              <Button variant="outline" onClick={() => router.push('/dashboard')}>
                Back to Dashboard
              </Button>
            )}
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
    <PolicyDetailsContent
      policy={policy}
      policyDocument={policyDocument}
      privescMatches={privescMatches}
      attachedUsers={attachedUsers}
      attachedRoles={attachedRoles}
      attachedGroups={attachedGroups}
      onBack={() => router.back()}
    />
  );
}

type PolicyDetailsContentProps = {
  policy: IAMPolicy;
  policyDocument: IAMPolicyDocument | null;
  privescMatches: PrivescMatch[];
  attachedUsers: IAMUser[];
  attachedRoles: IAMRole[];
  attachedGroups: IAMGroup[];
  onBack: () => void;
};

function PolicyDetailsContent({
  policy,
  policyDocument,
  privescMatches,
  attachedUsers,
  attachedRoles,
  attachedGroups,
  onBack,
}: PolicyDetailsContentProps) {
  return (
    <div className="max-w-6xl mx-auto space-y-8 overflow-hidden">
      <Breadcrumb />
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Policy Details: {policy.PolicyName}</h1>
          <p className="text-muted-foreground">Comprehensive policy information and attachments</p>
        </div>
      </div>

      <PrivilegeEscalationSummary matches={privescMatches} />

      <section>
        <h2 className="text-2xl font-semibold mb-4">Policy Information</h2>
        <div className="bg-muted/50 rounded-lg p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground">Policy Name</div>
              <p className="text-sm font-medium">{policy.PolicyName}</p>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">Policy ID</div>
              <p className="text-sm">{policy.PolicyId}</p>
            </div>
            <div className="md:col-span-2">
              <div className="text-sm font-medium text-muted-foreground">ARN</div>
              <p className="text-sm font-mono break-all">{policy.Arn}</p>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">Created</div>
              <p className="text-sm">{formatDateTime(policy.CreateDate)}</p>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">Attachment Count</div>
              <Badge variant="secondary">{policy.AttachmentCount}</Badge>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">Attachable</div>
              <Badge variant={policy.IsAttachable ? 'default' : 'destructive'}>
                {policy.IsAttachable ? 'Yes' : 'No'}
              </Badge>
            </div>
          </div>
          {policy.Description && (
            <div>
              <div className="text-sm font-medium text-muted-foreground">Description</div>
              <p className="text-sm">{policy.Description}</p>
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Policy Document</h2>
        <div className="bg-muted/50 rounded-lg p-6">
          {policyDocument ? (
            <JSONViewer data={policyDocument} />
          ) : (
            <p className="text-muted-foreground">Policy document not available.</p>
          )}
        </div>
      </section>

      <AttachedEntitiesSection
        title="Attached to Users"
        icon={<Users className="size-5" />}
        entities={attachedUsers.map((entity) => ({
          id: entity.UserId,
          href: `/user/${entity.UserId}`,
          name: entity.UserName,
          arn: entity.Arn,
        }))}
      />

      <AttachedEntitiesSection
        title="Attached to Roles"
        icon={<Shield className="size-5" />}
        entities={attachedRoles.map((entity) => ({
          id: entity.RoleId,
          href: `/role/${entity.RoleId}`,
          name: entity.RoleName,
          arn: entity.Arn,
        }))}
      />

      <AttachedEntitiesSection
        title="Attached to Groups"
        icon={<UserCheck className="size-5" />}
        entities={attachedGroups.map((entity) => ({
          id: entity.GroupId,
          href: `/group/${entity.GroupId}`,
          name: entity.GroupName,
          arn: entity.Arn,
        }))}
      />
    </div>
  );
}

type AttachedEntityRow = {
  id: string;
  href: string;
  name: string;
  arn: string;
};

type AttachedEntitiesSectionProps = {
  title: string;
  icon: ReactElement;
  entities: AttachedEntityRow[];
};

function AttachedEntitiesSection({
  title,
  icon,
  entities,
}: AttachedEntitiesSectionProps) {
  const rows = useMemo(() => entities, [entities]);

  return (
    <section>
      <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
        {icon}
        <span>{title}</span>
        <span className="text-sm font-normal text-muted-foreground">({entities.length} item{entities.length === 1 ? '' : 's'})</span>
      </h2>
      {rows.length > 0 ? (
        <div className="bg-muted/50 rounded-lg p-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>ARN</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <ClickableTableRow key={row.id} href={row.href}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>
                    <span className="font-mono text-sm">{row.arn}</span>
                  </TableCell>
                </ClickableTableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="bg-muted/50 rounded-lg p-6">
          <p className="text-muted-foreground">Not attached to any entities</p>
        </div>
      )}
    </section>
  );
}

function PrivilegeEscalationSummary({ matches }: { matches: PrivescMatch[] }) {
  const confirmedMatches = useMemo(() => matches.filter((match) => match.allRequiredPresent), [matches]);
  const partialMatches = useMemo(() => matches.filter((match) => !match.allRequiredPresent), [matches]);
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    confirmedMatches.forEach((match) => {
      const label = CATEGORY_LABELS[match.path.category] || match.path.category;
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [confirmedMatches]);

  if (matches.length === 0) return null;

  const hasConfirmed = confirmedMatches.length > 0;

  return (
    <Alert variant={hasConfirmed ? 'destructive' : 'default'}>
      <AlertTriangle className="size-5" />
      <AlertTitle className="text-lg font-bold">
        {hasConfirmed ? 'Confirmed Privilege Escalation Paths' : 'Potential Privilege Escalation Ingredients'}
      </AlertTitle>
      <AlertDescription>
        <div className="mt-3 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <RiskMetric
              label="Confirmed paths"
              value={confirmedMatches.length}
              tone={hasConfirmed ? 'destructive' : 'secondary'}
            />
            <RiskMetric label="Partial indicators" value={partialMatches.length} tone="secondary" />
            <RiskMetric label="Categories" value={categories.length} tone="secondary" />
          </div>

          <p className="text-sm text-muted-foreground">
            Confirmed paths include every required permission. Partial indicators are grouped below so
            complete risks stay easy to scan first.
          </p>

          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {categories.map(([category, count]) => (
                <Badge key={category} variant="secondary">
                  {category}: {count}
                </Badge>
              ))}
            </div>
          )}

          {confirmedMatches.length > 0 && (
            <details className="space-y-2">
              <summary className="cursor-pointer text-sm font-semibold">
                Show confirmed paths ({confirmedMatches.length})
              </summary>
              <div className="mt-3 space-y-2">
                {confirmedMatches.slice(0, 8).map((match) => (
                  <PrivescMatchRow key={match.path.id} match={match} expanded />
                ))}
                {confirmedMatches.length > 8 && (
                  <p className="text-xs text-muted-foreground">Showing 8 of {confirmedMatches.length} confirmed paths.</p>
                )}
              </div>
            </details>
          )}

          {partialMatches.length > 0 && (
            <details className="border border-border bg-background/60 p-3">
              <summary className="cursor-pointer text-sm font-semibold">
                {partialMatches.length} partial ingredient{partialMatches.length !== 1 ? 's' : ''} (missing one or more permissions)
              </summary>
              <div className="mt-3 space-y-2">
                {partialMatches.slice(0, 10).map((match) => (
                  <PrivescMatchRow key={match.path.id} match={match} />
                ))}
                {partialMatches.length > 10 && (
                  <p className="text-xs text-muted-foreground">Showing 10 of {partialMatches.length} partial ingredients.</p>
                )}
              </div>
            </details>
          )}

          {!hasConfirmed && (
            <p className="text-xs text-muted-foreground">
              No complete escalation chain is currently confirmed. Partial items are risk-building signals only.
            </p>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}

function RiskMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'destructive' | 'secondary';
}) {
  return (
    <div className="border border-border bg-background/60 p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-2xl font-bold">{value}</span>
        <Badge variant={tone}>{tone === 'destructive' ? 'Actionable' : 'Context'}</Badge>
      </div>
    </div>
  );
}

function PrivescMatchRow({ match, expanded = false }: { match: PrivescMatch; expanded?: boolean }) {
  const category = CATEGORY_LABELS[match.path.category] || match.path.category;

  return (
    <div className="border border-border bg-background/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={match.allRequiredPresent ? 'destructive' : 'secondary'}>{category}</Badge>
        <span className="font-semibold text-sm">{match.path.name}</span>
        <Badge variant="secondary" className="text-xs">
          {match.allRequiredPresent ? 'confirmed' : 'partial'}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {match.matchedPermissionCount}/{match.requiredPermissionCount} required permissions matched
      </p>
      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
        <div>
          <span className="font-semibold">Matched:</span>{' '}
          <span className="font-mono text-muted-foreground">{formatPermissionList(match.matchedPermissions)}</span>
        </div>
        {!match.allRequiredPresent && (
          <div>
            <span className="font-semibold">Missing:</span>{' '}
            <span className="font-mono text-muted-foreground">{formatPermissionList(match.missingPermissions)}</span>
          </div>
        )}
      </div>

      {(expanded || match.allRequiredPresent) && match.path.description && (
        <details className="mt-2">
          <summary className="text-xs font-semibold cursor-pointer text-muted-foreground">Description and references</summary>
          <p className="mt-2 text-xs text-muted-foreground">{summarizeText(match.path.description, 220)}</p>
          {match.path.references.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {match.path.references.slice(0, 2).map((reference) => (
                <a
                  key={reference.url}
                  href={reference.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs underline inline-flex items-center gap-1"
                >
                  {reference.title} <ExternalLink className="size-3" />
                </a>
              ))}
            </div>
          )}
        </details>
      )}

      {!expanded && !match.allRequiredPresent && match.path.references.length > 0 && (
        <div className="mt-2">
          <a
            href={match.path.references[0].url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs underline inline-flex items-center gap-1"
          >
            View AWS reference <ExternalLink className="size-3" />
          </a>
        </div>
      )}
    </div>
  );
}

function summarizeText(value: string, maxLength: number): string {
  if (maxLength <= 0) return '';
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trim()}…`;
}

function formatPermissionList(values: string[]): string {
  if (values.length === 0) return 'none';
  if (values.length <= 4) return values.join(', ');
  return `${values.slice(0, 4).join(', ')} +${values.length - 4} more`;
}
