'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CopyField } from '@/components/ui/copy-field';
import { ArrowLeft, FileText, Users, Shield, UserCheck } from 'lucide-react';
import { IAMPolicy, ProcessedIAMData, IAMUser, IAMRole, IAMGroup } from '@/lib/types';
import { formatDateTime, findAttachedEntities } from '@/lib/iam-utils';
import { JSONViewer } from '@/components/ui/json-viewer';

export default function PolicyDetailsPage() {
  const [policy, setPolicy] = useState<IAMPolicy | null>(null);
  const [data, setData] = useState<ProcessedIAMData | null>(null);
  const [policyDocument, setPolicyDocument] = useState<Record<string, unknown> | null>(null);
  const [attachedUsers, setAttachedUsers] = useState<IAMUser[]>([]);
  const [attachedRoles, setAttachedRoles] = useState<IAMRole[]>([]);
  const [attachedGroups, setAttachedGroups] = useState<IAMGroup[]>([]);
  const router = useRouter();
  const params = useParams();
  const policyId = params.policyId as string;

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

    const policyData = upload.data.policies[policyId];
    if (!policyData) {
      router.push('/dashboard');
      return;
    }

    setData(upload.data);
    setPolicy(policyData);

    // Find the default policy version document
    const document = policyData.PolicyVersionList?.find((version: { VersionId: string; Document: Record<string, unknown> }) => 
      version.VersionId === policyData.DefaultVersionId
    )?.Document;
    setPolicyDocument(document);

    // Find attached entities
    const { users, roles, groups } = findAttachedEntities(policyData.Arn, upload.data);
    setAttachedUsers(users);
    setAttachedRoles(roles);
    setAttachedGroups(groups);
  }, [policyId, router]);

  if (!policy || !data) {
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
          <h1 className="text-3xl font-bold">Policy Details: {policy.PolicyName}</h1>
          <p className="text-muted-foreground">Comprehensive policy information and attachments</p>
        </div>
      </div>

      <div className="space-y-8">
        {/* Policy Information */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 flex items-center space-x-2">
            <FileText className="h-5 w-5" />
            <span>Policy Information</span>
          </h2>
          <div className="bg-muted/50 rounded-lg p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Policy Name</label>
                <CopyField value={policy.PolicyName}>
                  <p className="text-sm font-medium">{policy.PolicyName}</p>
                </CopyField>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Policy ID</label>
                <CopyField value={policy.PolicyId}>
                  <p className="text-sm">{policy.PolicyId}</p>
                </CopyField>
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-muted-foreground">ARN</label>
                <CopyField value={policy.Arn}>
                  <p className="text-sm font-mono break-all">{policy.Arn}</p>
                </CopyField>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Created</label>
                <CopyField value={formatDateTime(policy.CreateDate)}>
                  <p className="text-sm">{formatDateTime(policy.CreateDate)}</p>
                </CopyField>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Attachment Count</label>
                <Badge variant="secondary">{policy.AttachmentCount}</Badge>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Attachable</label>
                <div className="mt-1">
                  <Badge variant={policy.IsAttachable ? "default" : "destructive"}>
                    {policy.IsAttachable ? "Yes" : "No"}
                  </Badge>
                </div>
              </div>
            </div>
            {policy.Description && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Description</label>
                <p className="text-sm">{policy.Description}</p>
              </div>
            )}
          </div>
        </section>

        {/* Policy Document */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 flex items-center space-x-2">
            <FileText className="h-5 w-5" />
            <span>Policy Document</span>
            <span className="text-sm font-normal text-muted-foreground">
              (Default version {policy.DefaultVersionId})
            </span>
          </h2>
          <div className="bg-muted/50 rounded-lg p-6">
            {policyDocument ? (
              <JSONViewer data={policyDocument} />
            ) : (
              <p className="text-muted-foreground">Policy document not available</p>
            )}
          </div>
        </section>

        {/* Attached to Users */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 flex items-center space-x-2">
            <Users className="h-5 w-5" />
            <span>Attached to Users</span>
            <span className="text-sm font-normal text-muted-foreground">
              ({attachedUsers.length} user{attachedUsers.length !== 1 ? 's' : ''})
            </span>
          </h2>
          {attachedUsers.length > 0 ? (
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
                  {attachedUsers.map((user) => (
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
              <p className="text-muted-foreground">Not attached to any users</p>
            </div>
          )}
        </section>

        {/* Attached to Roles */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 flex items-center space-x-2">
            <Shield className="h-5 w-5" />
            <span>Attached to Roles</span>
            <span className="text-sm font-normal text-muted-foreground">
              ({attachedRoles.length} role{attachedRoles.length !== 1 ? 's' : ''})
            </span>
          </h2>
          {attachedRoles.length > 0 ? (
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
                  {attachedRoles.map((role) => (
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
              <p className="text-muted-foreground">Not attached to any roles</p>
            </div>
          )}
        </section>

        {/* Attached to Groups */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 flex items-center space-x-2">
            <UserCheck className="h-5 w-5" />
            <span>Attached to Groups</span>
            <span className="text-sm font-normal text-muted-foreground">
              ({attachedGroups.length} group{attachedGroups.length !== 1 ? 's' : ''})
            </span>
          </h2>
          {attachedGroups.length > 0 ? (
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
                  {attachedGroups.map((group) => (
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
              <p className="text-muted-foreground">Not attached to any groups</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
} 