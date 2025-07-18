'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CopyField } from '@/components/ui/copy-field';
import { ArrowLeft, UserCheck, FileText, Users } from 'lucide-react';
import { IAMGroup, ProcessedIAMData, IAMUser, IAMPolicy } from '@/lib/types';
import { formatDateTime, findGroupUsers } from '@/lib/iam-utils';
import { JSONViewer } from '@/components/ui/json-viewer';

export default function GroupDetailsPage() {
  const [group, setGroup] = useState<IAMGroup | null>(null);
  const [data, setData] = useState<ProcessedIAMData | null>(null);
  const [groupPolicies, setGroupPolicies] = useState<IAMPolicy[]>([]);
  const [groupUsers, setGroupUsers] = useState<IAMUser[]>([]);
  const router = useRouter();
  const params = useParams();
  const groupId = params.groupId as string;

  useEffect(() => {
    const currentUploadId = localStorage.getItem('iam-current-upload');
    if (!currentUploadId) {
      router.push('/');
      return;
    }

    const uploads = JSON.parse(localStorage.getItem('iam-uploads') || '{}');
    const upload = uploads[currentUploadId];
    
    if (!upload) {
      router.push('/');
      return;
    }

    const groupData = upload.data.groups[groupId];
    if (!groupData) {
      router.push('/dashboard');
      return;
    }

    setData(upload.data);
    setGroup(groupData);

    // Get policy details for this group
    const policies = groupData.AttachedManagedPolicies.map((attachedPolicy: { PolicyArn: string }) => {
      const policyArn = attachedPolicy.PolicyArn;
      return Object.values(upload.data.policies).find((policy) => (policy as IAMPolicy).Arn === policyArn);
    }).filter((policy: unknown): policy is IAMPolicy => policy !== undefined);

    // Find users that are members of this group
    const users = findGroupUsers(groupData.GroupName, upload.data.users);

    setGroupPolicies(policies);
    setGroupUsers(users);
  }, [groupId, router]);

  if (!group || !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center space-x-4">
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
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
          <h2 className="text-2xl font-semibold mb-4 flex items-center space-x-2">
            <UserCheck className="h-5 w-5" />
            <span>Group Information</span>
          </h2>
          <div className="bg-muted/50 rounded-lg p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Group Name</label>
                <CopyField value={group.GroupName}>
                  <p className="text-sm font-medium">{group.GroupName}</p>
                </CopyField>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Group ID</label>
                <CopyField value={group.GroupId}>
                  <p className="text-sm">{group.GroupId}</p>
                </CopyField>
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-muted-foreground">ARN</label>
                <CopyField value={group.Arn}>
                  <p className="text-sm font-mono break-all">{group.Arn}</p>
                </CopyField>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Created</label>
                <CopyField value={formatDateTime(group.CreateDate)}>
                  <p className="text-sm">{formatDateTime(group.CreateDate)}</p>
                </CopyField>
              </div>
            </div>
          </div>
        </section>

        {/* Group Members */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 flex items-center space-x-2">
            <Users className="h-5 w-5" />
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
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupUsers.map((user) => (
                    <TableRow key={user.UserId}>
                      <TableCell className="font-medium">
                        <CopyField value={user.UserName}>
                          {user.UserName}
                        </CopyField>
                      </TableCell>
                      <TableCell>
                        <CopyField value={user.Arn}>
                          <span className="font-mono text-sm">{user.Arn}</span>
                        </CopyField>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/user/${user.UserId}`)}
                        >
                          View User
                        </Button>
                      </TableCell>
                    </TableRow>
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
          <h2 className="text-2xl font-semibold mb-4 flex items-center space-x-2">
            <FileText className="h-5 w-5" />
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
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupPolicies.map((policy) => (
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
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/policy/${policy.PolicyId}`)}
                        >
                          View Policy
                        </Button>
                      </TableCell>
                    </TableRow>
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
          <h2 className="text-2xl font-semibold mb-4 flex items-center space-x-2">
            <FileText className="h-5 w-5" />
            <span>Inline Policies</span>
            <span className="text-sm font-normal text-muted-foreground">
              ({group.GroupPolicyList?.length || 0} polic{group.GroupPolicyList?.length !== 1 ? 'ies' : 'y'})
            </span>
          </h2>
          {group.GroupPolicyList && group.GroupPolicyList.length > 0 ? (
            <div className="bg-muted/50 rounded-lg p-6 space-y-6">
              {group.GroupPolicyList.map((policy, index: number) => (
                <div key={index} className="space-y-2">
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