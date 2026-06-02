export type IAMValue = string | string[];

export interface IAMPolicyStatement {
  Sid?: string;
  Effect?: string;
  Action?: IAMValue;
  NotAction?: IAMValue;
  Resource?: IAMValue;
  NotResource?: IAMValue;
  Principal?: {
    AWS?: IAMValue;
    Service?: IAMValue;
    Federated?: IAMValue;
    CanonicalUser?: IAMValue;
  } | string;
  NotPrincipal?: Record<string, unknown> | string;
  Condition?: Record<string, unknown>;
}

export interface IAMPolicyDocument {
  Version?: string;
  Statement?: IAMPolicyStatement | IAMPolicyStatement[];
}

export interface IAMPermissionsBoundary {
  PermissionsBoundaryType?: string;
  PermissionsBoundaryArn?: string;
}

export interface IAMUser {
  UserId: string;
  UserName: string;
  Arn: string;
  Path?: string;
  CreateDate: string;
  AttachedManagedPolicies: Array<{ PolicyArn: string }>;
  GroupList: string[];
  UserPolicyList: Array<{
    PolicyName: string;
    PolicyDocument: IAMPolicyDocument;
  }>;
  Tags: Array<{ Key: string; Value: string }>;
  PermissionsBoundary?: IAMPermissionsBoundary;
  PasswordLastUsed?: string;
}

export interface IAMRole {
  RoleId: string;
  RoleName: string;
  Arn: string;
  Path?: string;
  CreateDate: string;
  AssumeRolePolicyDocument: IAMPolicyDocument;
  AttachedManagedPolicies: Array<{ PolicyArn: string }>;
  RolePolicyList: Array<{
    PolicyName: string;
    PolicyDocument: IAMPolicyDocument;
  }>;
  Tags: Array<{ Key: string; Value: string }>;
  PermissionsBoundary?: IAMPermissionsBoundary;
  MaxSessionDuration?: number;
  RoleLastUsed?: {
    LastUsedDate?: string;
    Region?: string;
  };
}

export interface IAMPolicy {
  PolicyId: string;
  PolicyName: string;
  Arn: string;
  Path?: string;
  CreateDate: string;
  UpdateDate?: string;
  DefaultVersionId: string;
  PolicyVersionList: Array<{
    VersionId: string;
    Document: IAMPolicyDocument;
    CreateDate?: string;
    IsDefaultVersion?: boolean;
  }>;
  AttachmentCount: number;
  IsAttachable: boolean;
  Description: string;
}

export interface IAMGroup {
  GroupId: string;
  GroupName: string;
  Arn: string;
  Path?: string;
  CreateDate: string;
  AttachedManagedPolicies: Array<{ PolicyArn: string }>;
  GroupPolicyList: Array<{
    PolicyName: string;
    PolicyDocument: IAMPolicyDocument;
  }>;
}

export interface ProcessedIAMData {
  users: Record<string, IAMUser>;
  roles: Record<string, IAMRole>;
  policies: Record<string, IAMPolicy>;
  groups: Record<string, IAMGroup>;
}

export interface RawIAMData {
  UserDetailList: IAMUser[];
  RoleDetailList: IAMRole[];
  Policies: IAMPolicy[];
  GroupDetailList: IAMGroup[];
} 
