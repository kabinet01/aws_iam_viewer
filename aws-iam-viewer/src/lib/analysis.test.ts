import { describe, expect, it } from "vitest";
import {
  analyzeEffectivePermissions,
  analyzeSecurityFindings,
  diffUploads,
} from "./analysis";
import { analyzePolicyForPrivesc } from "./privesc";
import { IAMPolicyDocument, ProcessedIAMData } from "./types";

const accountId = "123456789012";

function policyDocument(actions: string | string[], resource: string | string[] = "*"): IAMPolicyDocument {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: actions,
        Resource: resource,
      },
    ],
  };
}

function baseData(): ProcessedIAMData {
  return {
    users: {
      alice: {
        UserId: "alice",
        UserName: "alice",
        Arn: `arn:aws:iam::${accountId}:user/alice`,
        CreateDate: "2024-01-01T00:00:00Z",
        AttachedManagedPolicies: [{ PolicyArn: `arn:aws:iam::${accountId}:policy/AssumeOps` }],
        GroupList: [],
        UserPolicyList: [],
        Tags: [],
      },
    },
    roles: {
      ops: {
        RoleId: "ops",
        RoleName: "OpsAdmin",
        Arn: `arn:aws:iam::${accountId}:role/OpsAdmin`,
        CreateDate: "2024-01-01T00:00:00Z",
        AssumeRolePolicyDocument: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { AWS: `arn:aws:iam::${accountId}:user/alice` },
              Action: "sts:AssumeRole",
            },
          ],
        },
        AttachedManagedPolicies: [{ PolicyArn: `arn:aws:iam::${accountId}:policy/Admin` }],
        RolePolicyList: [],
        Tags: [],
      },
    },
    policies: {
      assume: {
        PolicyId: "assume",
        PolicyName: "AssumeOps",
        Arn: `arn:aws:iam::${accountId}:policy/AssumeOps`,
        CreateDate: "2024-01-01T00:00:00Z",
        DefaultVersionId: "v1",
        PolicyVersionList: [{ VersionId: "v1", Document: policyDocument("sts:AssumeRole", `arn:aws:iam::${accountId}:role/OpsAdmin`) }],
        AttachmentCount: 1,
        IsAttachable: true,
        Description: "",
      },
      admin: {
        PolicyId: "admin",
        PolicyName: "Admin",
        Arn: `arn:aws:iam::${accountId}:policy/Admin`,
        CreateDate: "2024-01-01T00:00:00Z",
        DefaultVersionId: "v1",
        PolicyVersionList: [{ VersionId: "v1", Document: policyDocument("*", "*") }],
        AttachmentCount: 1,
        IsAttachable: true,
        Description: "",
      },
    },
    groups: {},
  };
}

describe("analysis", () => {
  it("detects administrative wildcard findings", () => {
    const findings = analyzeSecurityFindings(baseData());

    expect(findings.some((finding) => finding.title === "Administrative wildcard access")).toBe(true);
    expect(findings.some((finding) => finding.severity === "critical")).toBe(true);
  });

  it("computes effective permissions through assumable roles", () => {
    const effective = analyzeEffectivePermissions(baseData(), "user", "alice");

    expect(effective).not.toBeNull();
    expect(effective?.reachableRoles).toHaveLength(1);
    expect(effective?.reachableRoles[0].roleName).toBe("OpsAdmin");
    expect(effective?.hasAdministrativeAccess).toBe(true);
  });

  it("flags risky trust policies", () => {
    const data = baseData();
    data.roles.ops.AssumeRolePolicyDocument = {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { AWS: `arn:aws:iam::999999999999:root` },
          Action: "sts:AssumeRole",
        },
      ],
    };

    const findings = analyzeSecurityFindings(data);

    expect(findings.some((finding) => finding.title === "Cross-account trust lacks ExternalId")).toBe(true);
    expect(findings.some((finding) => finding.title === "Role trusts account root")).toBe(true);
  });

  it("diffs added findings between uploads", () => {
    const before = baseData();
    before.roles.ops.AttachedManagedPolicies = [];
    before.policies.admin.PolicyVersionList = [{ VersionId: "v1", Document: policyDocument("s3:ListBucket", "*") }];
    before.policies.admin.AttachmentCount = 0;

    const after = baseData();
    const diff = diffUploads(before, after);

    expect(diff.roles.changed).toHaveLength(1);
    expect(diff.findings.added.length).toBeGreaterThan(0);
  });

  it("does not treat single partial privesc ingredients as confirmed paths by default", () => {
    const partialOnly = policyDocument("iam:PassRole", "*");

    expect(analyzePolicyForPrivesc(partialOnly)).toHaveLength(0);

    const partialMatches = analyzePolicyForPrivesc(partialOnly, { includePartial: true });
    expect(partialMatches.length).toBeGreaterThan(0);
    expect(partialMatches.every((match) => !match.allRequiredPresent)).toBe(true);
  });
});
