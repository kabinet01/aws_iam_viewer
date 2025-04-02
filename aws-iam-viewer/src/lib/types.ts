export interface IAMUser {
  UserId: string;
  UserName: string;
  Arn: string;
  CreateDate: string;
  AttachedManagedPolicies: Array<{ PolicyArn: string }>;
  GroupList: string[];
  UserPolicyList: Array<{
    PolicyName: string;
    PolicyDocument: Record<string, unknown>;
  }>;
  Tags: Array<{ Key: string; Value: string }>;
}

export interface IAMRole {
  RoleId: string;
  RoleName: string;
  Arn: string;
  CreateDate: string;
  AssumeRolePolicyDocument: {
    Statement: Array<{
      Effect: string;
      Principal: {
        AWS: string | string[];
      };
    }>;
  };
  AttachedManagedPolicies: Array<{ PolicyArn: string }>;
  RolePolicyList: Array<{
    PolicyName: string;
    PolicyDocument: Record<string, unknown>;
  }>;
  Tags: Array<{ Key: string; Value: string }>;
}

export interface IAMPolicy {
  PolicyId: string;
  PolicyName: string;
  Arn: string;
  CreateDate: string;
  DefaultVersionId: string;
  PolicyVersionList: Array<{
    VersionId: string;
    Document: Record<string, unknown>;
  }>;
  AttachmentCount: number;
  IsAttachable: boolean;
  Description: string;
}

export interface IAMGroup {
  GroupId: string;
  GroupName: string;
  Arn: string;
  CreateDate: string;
  AttachedManagedPolicies: Array<{ PolicyArn: string }>;
  GroupPolicyList: Array<{
    PolicyName: string;
    PolicyDocument: Record<string, unknown>;
  }>;
}

export interface ProcessedIAMData {
  users: Record<string, IAMUser>;
  roles: Record<string, IAMRole>;
  policies: Record<string, IAMPolicy>;
  groups: Record<string, IAMGroup>;
}

export interface UploadMetadata {
  id: string;
  name: string;
  original_filename: string;
  filepath: string;
  uploaded_at: string;
  size: number;
}

export interface RawIAMData {
  UserDetailList: IAMUser[];
  RoleDetailList: IAMRole[];
  Policies: IAMPolicy[];
  GroupDetailList: IAMGroup[];
} 