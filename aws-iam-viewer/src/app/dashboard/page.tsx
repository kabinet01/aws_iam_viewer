'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { CopyField } from '@/components/ui/copy-field';
import { Search, Users, Shield, FileText, UserCheck } from 'lucide-react';
import { ProcessedIAMData, IAMRole, IAMPolicy } from '@/lib/types';
import { formatDateTime, truncateArn } from '@/lib/iam-utils';

export default function DashboardPage() {
  const [data, setData] = useState<ProcessedIAMData | null>(null);
  const [currentUpload, setCurrentUpload] = useState<{ name: string; data: ProcessedIAMData } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('users');
  const router = useRouter();

  useEffect(() => {
    // Load current upload data from localStorage
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

    setCurrentUpload(upload);
    setData(upload.data);
  }, [router]);

  if (!data || !currentUpload) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const { users, roles, policies, groups } = data;

  const filteredUsers = Object.entries(users).filter(([, user]) =>
    user.UserName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.Arn.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Categorize roles into user-defined and AWS service roles
  const categorizeRoles = (roles: Record<string, IAMRole>) => {
    const userRoles: [string, IAMRole][] = [];
    const serviceRoles: [string, IAMRole][] = [];
    
    Object.entries(roles).forEach(([roleId, role]) => {
      // AWS service roles have pattern: arn:aws:iam::accountid:role/aws-service-role/service.amazonaws.com/rolename
      if (role.Arn.includes('/aws-service-role/')) {
        serviceRoles.push([roleId, role]);
      } else {
        userRoles.push([roleId, role]);
      }
    });
    
    return { userRoles, serviceRoles };
  };

  const { userRoles, serviceRoles } = categorizeRoles(roles);

  const filteredUserRoles = userRoles.filter(([, role]) =>
    role.RoleName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    role.Arn.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredServiceRoles = serviceRoles.filter(([, role]) =>
    role.RoleName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    role.Arn.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Categorize policies into user-defined, AWS service role policies, and AWS managed policies
  const categorizePolicies = (policies: Record<string, IAMPolicy>) => {
    const userPolicies: [string, IAMPolicy][] = [];
    const serviceRolePolicies: [string, IAMPolicy][] = [];
    const managedPolicies: [string, IAMPolicy][] = [];
    
    Object.entries(policies).forEach(([policyId, policy]) => {
      // AWS service role policies have pattern: arn:aws:iam::aws:policy/aws-service-role/policy name
      // or arn:aws:iam::aws:policy/service-role/policy name
      if (policy.Arn.includes('::aws:policy/aws-service-role/') || policy.Arn.includes(':policy/service-role/')) {
        serviceRolePolicies.push([policyId, policy]);
      }
      // AWS managed policies have pattern: arn:aws:iam::aws:policy/policy-name (without service-role path)
      else if (policy.Arn.includes('::aws:policy/') && !policy.Arn.includes('/aws-service-role/') && !policy.Arn.includes('/service-role/')) {
        managedPolicies.push([policyId, policy]);
      } else {
        userPolicies.push([policyId, policy]);
      }
    });
    
    return { userPolicies, serviceRolePolicies, managedPolicies };
  };

  const { userPolicies, serviceRolePolicies, managedPolicies } = categorizePolicies(policies);

  const filteredUserPolicies = userPolicies.filter(([, policy]) =>
    policy.PolicyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    policy.Arn.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredServiceRolePolicies = serviceRolePolicies.filter(([, policy]) =>
    policy.PolicyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    policy.Arn.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredManagedPolicies = managedPolicies.filter(([, policy]) =>
    policy.PolicyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    policy.Arn.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredGroups = Object.entries(groups).filter(([, group]) =>
    group.GroupName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    group.Arn.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">IAM Dashboard</h1>
          <p className="text-muted-foreground">
            Analyzing: {currentUpload.name}
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push('/')}>
          Upload New File
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Object.keys(users).length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Roles</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Object.keys(roles).length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Policies</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Object.keys(policies).length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Groups</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Object.keys(groups).length}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
          <TabsTrigger value="groups">Groups</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <div className="flex items-center space-x-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>Users</CardTitle>
              <CardDescription>
                {filteredUsers.length} of {Object.keys(users).length} users
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User Name</TableHead>
                    <TableHead>ARN</TableHead>
                    <TableHead>Create Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map(([userId, user]) => (
                    <TableRow key={userId}>
                      <TableCell className="font-medium">
                        <CopyField value={user.UserName}>
                          {user.UserName}
                        </CopyField>
                      </TableCell>
                      <TableCell>
                        <CopyField value={user.Arn} displayValue={truncateArn(user.Arn)} />
                      </TableCell>
                      <TableCell>
                        <CopyField value={formatDateTime(user.CreateDate)}>
                          {formatDateTime(user.CreateDate)}
                        </CopyField>
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => router.push(`/user/${userId}`)}
                        >
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles" className="space-y-6">
          <div className="flex items-center space-x-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search roles..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>
          
          {/* User-Defined Roles */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Shield className="h-5 w-5" />
                <span>User-Defined Roles</span>
                <Badge variant="secondary">{userRoles.length}</Badge>
              </CardTitle>
              <CardDescription>
                {filteredUserRoles.length} of {userRoles.length} user-defined roles
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredUserRoles.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Role Name</TableHead>
                      <TableHead>ARN</TableHead>
                      <TableHead>Create Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUserRoles.map(([roleId, role]) => (
                      <TableRow key={roleId}>
                        <TableCell className="font-medium">
                          <CopyField value={role.RoleName}>
                            {role.RoleName}
                          </CopyField>
                        </TableCell>
                        <TableCell>
                          <CopyField value={role.Arn} displayValue={truncateArn(role.Arn)} />
                        </TableCell>
                        <TableCell>
                          <CopyField value={formatDateTime(role.CreateDate)}>
                            {formatDateTime(role.CreateDate)}
                          </CopyField>
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => router.push(`/role/${roleId}`)}
                          >
                            View Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    {searchTerm ? 'No user-defined roles match your search.' : 'No user-defined roles found.'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* AWS Service Roles */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Shield className="h-5 w-5" />
                <span>AWS Service-Linked Roles</span>
                <Badge variant="secondary">{serviceRoles.length}</Badge>
              </CardTitle>
              <CardDescription>
                {filteredServiceRoles.length} of {serviceRoles.length} AWS service-linked roles
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredServiceRoles.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Role Name</TableHead>
                      <TableHead>ARN</TableHead>
                      <TableHead>Create Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredServiceRoles.map(([roleId, role]) => (
                      <TableRow key={roleId}>
                        <TableCell className="font-medium">
                          <CopyField value={role.RoleName}>
                            {role.RoleName}
                          </CopyField>
                        </TableCell>
                        <TableCell>
                          <CopyField value={role.Arn} displayValue={truncateArn(role.Arn)} />
                        </TableCell>
                        <TableCell>
                          <CopyField value={formatDateTime(role.CreateDate)}>
                            {formatDateTime(role.CreateDate)}
                          </CopyField>
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => router.push(`/role/${roleId}`)}
                          >
                            View Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    {searchTerm ? 'No AWS service roles match your search.' : 'No AWS service roles found.'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="policies" className="space-y-6">
          <div className="flex items-center space-x-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search policies..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>
          
          {/* User-Defined Policies */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileText className="h-5 w-5" />
                <span>User-Defined Policies</span>
                <Badge variant="secondary">{userPolicies.length}</Badge>
              </CardTitle>
              <CardDescription>
                {filteredUserPolicies.length} of {userPolicies.length} user-defined policies
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredUserPolicies.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Policy Name</TableHead>
                      <TableHead>ARN</TableHead>
                      <TableHead>Create Date</TableHead>
                      <TableHead>Attachment Count</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUserPolicies.map(([policyId, policy]) => (
                      <TableRow key={policyId}>
                        <TableCell className="font-medium">
                          <CopyField value={policy.PolicyName}>
                            {policy.PolicyName}
                          </CopyField>
                        </TableCell>
                        <TableCell>
                          <CopyField value={policy.Arn} displayValue={truncateArn(policy.Arn)} />
                        </TableCell>
                        <TableCell>
                          <CopyField value={formatDateTime(policy.CreateDate)}>
                            {formatDateTime(policy.CreateDate)}
                          </CopyField>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{policy.AttachmentCount}</Badge>
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => router.push(`/policy/${policyId}`)}
                          >
                            View Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    {searchTerm ? 'No user-defined policies match your search.' : 'No user-defined policies found.'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* AWS Service Role Policies */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileText className="h-5 w-5" />
                <span>AWS Service Role Policies</span>
                <Badge variant="secondary">{serviceRolePolicies.length}</Badge>
              </CardTitle>
              <CardDescription>
                {filteredServiceRolePolicies.length} of {serviceRolePolicies.length} AWS service role policies
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredServiceRolePolicies.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Policy Name</TableHead>
                      <TableHead>ARN</TableHead>
                      <TableHead>Create Date</TableHead>
                      <TableHead>Attachment Count</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredServiceRolePolicies.map(([policyId, policy]) => (
                      <TableRow key={policyId}>
                        <TableCell className="font-medium">
                          <CopyField value={policy.PolicyName}>
                            {policy.PolicyName}
                          </CopyField>
                        </TableCell>
                        <TableCell>
                          <CopyField value={policy.Arn} displayValue={truncateArn(policy.Arn)} />
                        </TableCell>
                        <TableCell>
                          <CopyField value={formatDateTime(policy.CreateDate)}>
                            {formatDateTime(policy.CreateDate)}
                          </CopyField>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{policy.AttachmentCount}</Badge>
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => router.push(`/policy/${policyId}`)}
                          >
                            View Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    {searchTerm ? 'No AWS service role policies match your search.' : 'No AWS service role policies found.'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* AWS Managed Policies */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileText className="h-5 w-5" />
                <span>AWS Managed Policies</span>
                <Badge variant="secondary">{managedPolicies.length}</Badge>
              </CardTitle>
              <CardDescription>
                {filteredManagedPolicies.length} of {managedPolicies.length} AWS managed policies
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredManagedPolicies.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Policy Name</TableHead>
                      <TableHead>ARN</TableHead>
                      <TableHead>Create Date</TableHead>
                      <TableHead>Attachment Count</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredManagedPolicies.map(([policyId, policy]) => (
                      <TableRow key={policyId}>
                        <TableCell className="font-medium">
                          <CopyField value={policy.PolicyName}>
                            {policy.PolicyName}
                          </CopyField>
                        </TableCell>
                        <TableCell>
                          <CopyField value={policy.Arn} displayValue={truncateArn(policy.Arn)} />
                        </TableCell>
                        <TableCell>
                          <CopyField value={formatDateTime(policy.CreateDate)}>
                            {formatDateTime(policy.CreateDate)}
                          </CopyField>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{policy.AttachmentCount}</Badge>
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => router.push(`/policy/${policyId}`)}
                          >
                            View Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    {searchTerm ? 'No AWS managed policies match your search.' : 'No AWS managed policies found.'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="groups" className="space-y-4">
          <div className="flex items-center space-x-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search groups..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>Groups</CardTitle>
              <CardDescription>
                {filteredGroups.length} of {Object.keys(groups).length} groups
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Group Name</TableHead>
                    <TableHead>ARN</TableHead>
                    <TableHead>Create Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGroups.map(([groupId, group]) => (
                    <TableRow key={groupId}>
                      <TableCell className="font-medium">
                        <CopyField value={group.GroupName}>
                          {group.GroupName}
                        </CopyField>
                      </TableCell>
                      <TableCell>
                        <CopyField value={group.Arn} displayValue={truncateArn(group.Arn)} />
                      </TableCell>
                      <TableCell>
                        <CopyField value={formatDateTime(group.CreateDate)}>
                          {formatDateTime(group.CreateDate)}
                        </CopyField>
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => router.push(`/group/${groupId}`)}
                        >
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
} 