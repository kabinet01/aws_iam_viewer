import { ProcessedIAMData, RawIAMData, IAMUser, IAMRole, IAMPolicy, IAMGroup } from './types';

export function processAuthDetails(authDetails: RawIAMData): ProcessedIAMData {
  const users: Record<string, IAMUser> = {};
  const roles: Record<string, IAMRole> = {};
  const policies: Record<string, IAMPolicy> = {};
  const groups: Record<string, IAMGroup> = {};

  // Process users
  for (const user of authDetails.UserDetailList || []) {
    const userId = user.UserId;
    users[userId] = {
      UserId: userId,
      UserName: user.UserName,
      Arn: user.Arn,
      CreateDate: user.CreateDate,
      AttachedManagedPolicies: user.AttachedManagedPolicies || [],
      GroupList: user.GroupList || [],
      UserPolicyList: user.UserPolicyList || [],
      Tags: user.Tags || [],
    };
  }

  // Process roles
  for (const role of authDetails.RoleDetailList || []) {
    const roleId = role.RoleId;
    roles[roleId] = {
      RoleId: roleId,
      RoleName: role.RoleName,
      Arn: role.Arn,
      CreateDate: role.CreateDate,
      AssumeRolePolicyDocument: role.AssumeRolePolicyDocument || { Statement: [] },
      AttachedManagedPolicies: role.AttachedManagedPolicies || [],
      RolePolicyList: role.RolePolicyList || [],
      Tags: role.Tags || [],
    };
  }

  // Process policies
  for (const policy of authDetails.Policies || []) {
    const policyId = policy.PolicyId;
    policies[policyId] = {
      PolicyId: policyId,
      PolicyName: policy.PolicyName,
      Arn: policy.Arn,
      CreateDate: policy.CreateDate,
      DefaultVersionId: policy.DefaultVersionId,
      PolicyVersionList: policy.PolicyVersionList || [],
      AttachmentCount: policy.AttachmentCount,
      IsAttachable: policy.IsAttachable,
      Description: policy.Description || '',
    };
  }

  // Process groups
  for (const group of authDetails.GroupDetailList || []) {
    const groupId = group.GroupId;
    groups[groupId] = {
      GroupId: groupId,
      GroupName: group.GroupName,
      Arn: group.Arn,
      CreateDate: group.CreateDate,
      AttachedManagedPolicies: group.AttachedManagedPolicies || [],
      GroupPolicyList: group.GroupPolicyList || [],
    };
  }

  return { users, roles, policies, groups };
}

export function formatDateTime(value: string): string {
  try {
    const dt = new Date(value);
    return dt.toLocaleString();
  } catch {
    return value;
  }
}

export function formatFileSize(size: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let fileSize = size;
  let unitIndex = 0;

  while (fileSize >= 1024 && unitIndex < units.length - 1) {
    fileSize /= 1024;
    unitIndex++;
  }

  return `${fileSize.toFixed(2)} ${units[unitIndex]}`;
}

export function truncateArn(arn: string, maxLength: number = 40): string {
  if (arn.length <= maxLength) return arn;
  return arn.substring(0, maxLength) + '...';
}

export function findAssumableRoles(user: IAMUser, roles: Record<string, IAMRole>): IAMRole[] {
  const assumableRoles: IAMRole[] = [];

  for (const role of Object.values(roles)) {
    const assumeRolePolicy = role.AssumeRolePolicyDocument;
    const statements = assumeRolePolicy?.Statement || [];

    for (const statement of statements) {
      if (statement.Effect !== 'Allow') continue;

      const principal = statement.Principal;
      const awsPrincipal = principal?.AWS;

      if (!awsPrincipal) continue;

      const principalArns = Array.isArray(awsPrincipal) ? awsPrincipal : [awsPrincipal];

      for (const principalArn of principalArns) {
        if (user.Arn === principalArn || principalArn === '*') {
          assumableRoles.push(role);
          break;
        }
      }
    }
  }

  return assumableRoles;
}

export function findAttachedEntities(
  policyArn: string,
  data: ProcessedIAMData
): {
  users: IAMUser[];
  roles: IAMRole[];
  groups: IAMGroup[];
} {
  const attachedUsers: IAMUser[] = [];
  const attachedRoles: IAMRole[] = [];
  const attachedGroups: IAMGroup[] = [];

  // Find users with this policy
  for (const user of Object.values(data.users)) {
    for (const attachedPolicy of user.AttachedManagedPolicies) {
      if (attachedPolicy.PolicyArn === policyArn) {
        attachedUsers.push(user);
        break;
      }
    }
  }

  // Find roles with this policy
  for (const role of Object.values(data.roles)) {
    for (const attachedPolicy of role.AttachedManagedPolicies) {
      if (attachedPolicy.PolicyArn === policyArn) {
        attachedRoles.push(role);
        break;
      }
    }
  }

  // Find groups with this policy
  for (const group of Object.values(data.groups)) {
    for (const attachedPolicy of group.AttachedManagedPolicies) {
      if (attachedPolicy.PolicyArn === policyArn) {
        attachedGroups.push(group);
        break;
      }
    }
  }

  return { users: attachedUsers, roles: attachedRoles, groups: attachedGroups };
}

export function findGroupUsers(groupName: string, users: Record<string, IAMUser>): IAMUser[] {
  return Object.values(users).filter(user => user.GroupList.includes(groupName));
} 