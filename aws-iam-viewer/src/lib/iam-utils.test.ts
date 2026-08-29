import { describe, expect, it } from 'vitest';
import { collectInlinePolicies, processAuthDetails } from './iam-utils';
import { IAMPolicyDocument, RawIAMData } from './types';

const inlineDocument: IAMPolicyDocument = {
  Version: '2012-10-17',
  Statement: {
    Effect: 'Allow',
    Action: 's3:GetObject',
    Resource: '*',
  },
};

describe('inline policy collection', () => {
  it('discovers inline policies owned by users, roles, and groups', () => {
    const rawData = {
      UserDetailList: [
        {
          UserId: 'user-id',
          UserName: 'alice',
          Arn: 'arn:aws:iam::123456789012:user/alice',
          CreateDate: '2024-01-01T00:00:00Z',
          AttachedManagedPolicies: [],
          GroupList: [],
          UserPolicyList: [{ PolicyName: 'user-inline', PolicyDocument: inlineDocument }],
          Tags: [],
        },
      ],
      RoleDetailList: [
        {
          RoleId: 'role-id',
          RoleName: 'app-role',
          Arn: 'arn:aws:iam::123456789012:role/app-role',
          CreateDate: '2024-01-01T00:00:00Z',
          AssumeRolePolicyDocument: { Statement: [] },
          AttachedManagedPolicies: [],
          RolePolicyList: [{ PolicyName: 'role-inline', PolicyDocument: inlineDocument }],
          Tags: [],
        },
      ],
      Policies: [],
      GroupDetailList: [
        {
          GroupId: 'group-id',
          GroupName: 'developers',
          Arn: 'arn:aws:iam::123456789012:group/developers',
          CreateDate: '2024-01-01T00:00:00Z',
          AttachedManagedPolicies: [],
          GroupPolicyList: [{ PolicyName: 'group-inline', PolicyDocument: inlineDocument }],
        },
      ],
    } satisfies RawIAMData;

    const policies = collectInlinePolicies(processAuthDetails(rawData));

    expect(policies).toHaveLength(3);
    expect(policies.map((policy) => ({
      id: policy.id,
      ownerType: policy.ownerType,
      ownerName: policy.ownerName,
      policyName: policy.PolicyName,
    }))).toEqual([
      { id: 'user:user-id:user-inline', ownerType: 'user', ownerName: 'alice', policyName: 'user-inline' },
      { id: 'role:role-id:role-inline', ownerType: 'role', ownerName: 'app-role', policyName: 'role-inline' },
      { id: 'group:group-id:group-inline', ownerType: 'group', ownerName: 'developers', policyName: 'group-inline' },
    ]);
  });
});
