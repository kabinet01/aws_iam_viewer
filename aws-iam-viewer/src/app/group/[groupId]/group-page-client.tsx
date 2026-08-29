'use client';

import { useEffect, useReducer } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, UserCheck, FileText, Users } from 'lucide-react';
import { IAMGroup, ProcessedIAMData, IAMUser, IAMPolicy } from '@/lib/types';
import { formatDateTime, findGroupUsers } from '@/lib/iam-utils';
import { JSONViewer } from '@/components/ui/json-viewer';
import { indexedDBService } from '@/lib/indexeddb';
import { Breadcrumb } from '@/components/breadcrumb';
import { ClickableTableRow } from '@/components/clickable-table-row';

type MissingLoadState = "loading" | "missingUpload" | "missingGroup" | "error" | "ready";

type GroupState = {
  group: IAMGroup | null;
  data: ProcessedIAMData | null;
  groupPolicies: IAMPolicy[];
  groupUsers: IAMUser[];
  loadState: MissingLoadState;
};

type GroupAction =
  | { type: 'set_load_state'; loadState: MissingLoadState }
  | {
      type: 'set_loaded';
      payload: {
        group: IAMGroup;
        data: ProcessedIAMData;
        groupPolicies: IAMPolicy[];
        groupUsers: IAMUser[];
      };
    };

const initialGroupState: GroupState = {
  group: null,
  data: null,
  groupPolicies: [],
  groupUsers: [],
  loadState: 'loading',
};

function groupReducer(state: GroupState, action: GroupAction): GroupState {
  switch (action.type) {
    case 'set_load_state':
      return { ...state, loadState: action.loadState };
    case 'set_loaded':
      return { ...state, ...action.payload, loadState: 'ready' };
    default:
      return state;
  }
}

export default function GroupDetailsPage() {
  const [{ group, data, groupPolicies, groupUsers, loadState }, dispatch] =
    useReducer(groupReducer, initialGroupState);
  const router = useRouter();
  const params = useParams();
  const groupId = params.groupId as string;

  useEffect(() => {
    const loadGroupData = async () => {
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

        const groupData = upload.data.groups[groupId];
        if (!groupData) {
          dispatch({ type: 'set_load_state', loadState: 'missingGroup' });
          return;
        }

        // Get policy details for this group
        const policies = groupData.AttachedManagedPolicies.map((attachedPolicy: { PolicyArn: string }) => {
          const policyArn = attachedPolicy.PolicyArn;
          return Object.values(upload.data.policies as Record<string, IAMPolicy>).find((policy: IAMPolicy) => policy.Arn === policyArn);
        }).filter((policy): policy is IAMPolicy => policy !== undefined);

        // Find users that are members of this group
        const users = findGroupUsers(groupData.GroupName, upload.data.users);
        dispatch({
          type: 'set_loaded',
          payload: {
            group: groupData,
            data: upload.data,
            groupPolicies: policies,
            groupUsers: users,
          },
        });
      } catch (error) {
        console.error('Failed to load group data:', error);
        dispatch({ type: 'set_load_state', loadState: 'error' });
      }
    };

    loadGroupData();
  }, [groupId, router]);

  if (loadState !== 'ready' || !group || !data) {
    if (loadState === 'missingUpload' || loadState === 'error') {
      return (
        <div className="max-w-6xl mx-auto space-y-8 overflow-hidden">
          <Breadcrumb />
          <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground bg-muted/30">
            Could not load the IAM dataset for this group.
            <div className="mt-4">
              <Button variant="outline" onClick={() => router.push('/')}>
                Go to upload
              </Button>
            </div>
          </div>
        </div>
      );
    }

    if (loadState === 'missingGroup') {
      return (
        <div className="max-w-6xl mx-auto space-y-8 overflow-hidden">
          <Breadcrumb />
          <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground bg-muted/30">
            This group does not exist in the current dataset.
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
    <div className="max-w-6xl mx-auto space-y-8 overflow-hidden">
      <Breadcrumb />
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="size-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Group Details: {group.GroupName}</h1>
          <p className="text-muted-foreground">Comprehensive group information and members</p>
        </div>
      </div>

      <div className="space-y-8">
        {/* Group Information */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <UserCheck className="size-5" />
            <span>Group Information</span>
          </h2>
          <div className="bg-muted/50 rounded-lg p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-medium text-muted-foreground">Group Name</div>
                <p className="text-sm font-medium">{group.GroupName}</p>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">Group ID</div>
                <p className="text-sm">{group.GroupId}</p>
              </div>
              <div className="md:col-span-2">
                <div className="text-sm font-medium text-muted-foreground">ARN</div>
                <p className="text-sm font-mono break-all">{group.Arn}</p>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">Created</div>
                <p className="text-sm">{formatDateTime(group.CreateDate)}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Group Members */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <Users className="size-5" />
            <span>Group Members</span>
            <span className="text-sm font-normal text-muted-foreground">
              ({groupUsers.length} user{groupUsers.length !== 1 ? 's' : ''})
            </span>
          </h2>
          {groupUsers.length > 0 ? (
            <div className="bg-muted/50 rounded-lg p-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User Name</TableHead>
                    <TableHead>ARN</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupUsers.map((user) => (
                    <ClickableTableRow key={user.UserId} href={`/user/${user.UserId}`}>
                      <TableCell className="font-medium">
                        {user.UserName}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">{user.Arn}</span>
                      </TableCell>
                    </ClickableTableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="bg-muted/50 rounded-lg p-6">
              <p className="text-muted-foreground">No users are members of this group</p>
            </div>
          )}
        </section>

        {/* Attached Policies */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <FileText className="size-5" />
            <span>Attached Policies</span>
            <span className="text-sm font-normal text-muted-foreground">
              ({groupPolicies.length} polic{groupPolicies.length !== 1 ? 'ies' : 'y'})
            </span>
          </h2>
          {groupPolicies.length > 0 ? (
            <div className="bg-muted/50 rounded-lg p-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Policy Name</TableHead>
                    <TableHead>ARN</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupPolicies.map((policy) => (
                    <ClickableTableRow key={policy.PolicyId} href={`/policy/${policy.PolicyId}`}>
                      <TableCell className="font-medium">
                        {policy.PolicyName}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">{policy.Arn}</span>
                      </TableCell>
                    </ClickableTableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="bg-muted/50 rounded-lg p-6">
              <p className="text-muted-foreground">No policies directly attached to this group</p>
            </div>
          )}
        </section>

        {/* Inline Policies */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <FileText className="size-5" />
            <span>Inline Policies</span>
            <span className="text-sm font-normal text-muted-foreground">
              ({group.GroupPolicyList?.length || 0} polic{group.GroupPolicyList?.length !== 1 ? 'ies' : 'y'})
            </span>
          </h2>
          {group.GroupPolicyList && group.GroupPolicyList.length > 0 ? (
            <div className="bg-muted/50 rounded-lg p-6 space-y-6">
              {group.GroupPolicyList.map((policy) => (
                <div key={policy.PolicyName} className="space-y-2">
                  <h3 className="text-lg font-medium">{policy.PolicyName}</h3>
                  <JSONViewer data={policy.PolicyDocument} />
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-muted/50 rounded-lg p-6">
              <p className="text-muted-foreground">No inline policies defined for this group</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
