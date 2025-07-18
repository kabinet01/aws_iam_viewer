'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CopyField } from '@/components/ui/copy-field';
import { ArrowLeft, Shield, FileText } from 'lucide-react';
import { IAMRole, ProcessedIAMData, IAMPolicy } from '@/lib/types';
import { formatDateTime } from '@/lib/iam-utils';
import { JSONViewer } from '@/components/ui/json-viewer';

export default function RoleDetailsPage() {
  const [role, setRole] = useState<IAMRole | null>(null);
  const [data, setData] = useState<ProcessedIAMData | null>(null);
  const [rolePolicies, setRolePolicies] = useState<IAMPolicy[]>([]);
  const router = useRouter();
  const params = useParams();
  const roleId = params.roleId as string;

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

    const roleData = upload.data.roles[roleId];
    if (!roleData) {
      router.push('/dashboard');
      return;
    }

    setData(upload.data);
    setRole(roleData);

    // Get policy details for this role
    const policies = roleData.AttachedManagedPolicies.map((attachedPolicy: { PolicyArn: string }) => {
      const policyArn = attachedPolicy.PolicyArn;
      return Object.values(upload.data.policies).find((policy) => (policy as IAMPolicy).Arn === policyArn);
    }).filter((policy: unknown): policy is IAMPolicy => policy !== undefined);

    setRolePolicies(policies);
  }, [roleId, router]);

  if (!role || !data) {
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
          <h1 className="text-3xl font-bold">Role Details: {role.RoleName}</h1>
          <p className="text-muted-foreground">Comprehensive role information and permissions</p>
        </div>
      </div>

      <div className="space-y-8">
        {/* Role Information */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 flex items-center space-x-2">
            <Shield className="h-5 w-5" />
            <span>Role Information</span>
          </h2>
          <div className="bg-muted/50 rounded-lg p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Role Name</label>
                <CopyField value={role.RoleName}>
                  <p className="text-sm font-medium">{role.RoleName}</p>
                </CopyField>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Role ID</label>
                <CopyField value={role.RoleId}>
                  <p className="text-sm">{role.RoleId}</p>
                </CopyField>
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-muted-foreground">ARN</label>
                <CopyField value={role.Arn}>
                  <p className="text-sm font-mono break-all">{role.Arn}</p>
                </CopyField>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Created</label>
                <CopyField value={formatDateTime(role.CreateDate)}>
                  <p className="text-sm">{formatDateTime(role.CreateDate)}</p>
                </CopyField>
              </div>
            </div>
            {role.Tags && role.Tags.length > 0 && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Tags</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {role.Tags.map((tag, index) => (
                    <Badge key={index} variant="outline">
                      {tag.Key}: {tag.Value}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Assume Role Policy */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 flex items-center space-x-2">
            <Shield className="h-5 w-5" />
            <span>Assume Role Policy</span>
            <span className="text-sm font-normal text-muted-foreground">
              (Who can assume this role)
            </span>
          </h2>
          <div className="bg-muted/50 rounded-lg p-6">
            {role.AssumeRolePolicyDocument && Object.keys(role.AssumeRolePolicyDocument).length > 0 ? (
              <JSONViewer data={role.AssumeRolePolicyDocument} />
            ) : (
              <p className="text-muted-foreground">Assume role policy not available</p>
            )}
          </div>
        </section>

        {/* Attached Policies */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 flex items-center space-x-2">
            <FileText className="h-5 w-5" />
            <span>Attached Policies</span>
            <span className="text-sm font-normal text-muted-foreground">
              ({rolePolicies.length} polic{rolePolicies.length !== 1 ? 'ies' : 'y'})
            </span>
          </h2>
          {rolePolicies.length > 0 ? (
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
                  {rolePolicies.map((policy) => (
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
              <p className="text-muted-foreground">No policies directly attached to this role</p>
            </div>
          )}
        </section>

        {/* Inline Policies */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 flex items-center space-x-2">
            <FileText className="h-5 w-5" />
            <span>Inline Policies</span>
            <span className="text-sm font-normal text-muted-foreground">
              ({role.RolePolicyList?.length || 0} polic{role.RolePolicyList?.length !== 1 ? 'ies' : 'y'})
            </span>
          </h2>
          {role.RolePolicyList && role.RolePolicyList.length > 0 ? (
            <div className="bg-muted/50 rounded-lg p-6 space-y-6">
              {role.RolePolicyList.map((policy, index: number) => (
                <div key={index} className="space-y-2">
                  <h3 className="text-lg font-medium">{policy.PolicyName}</h3>
                  <JSONViewer data={policy.PolicyDocument} />
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-muted/50 rounded-lg p-6">
              <p className="text-muted-foreground">No inline policies defined for this role</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
} 