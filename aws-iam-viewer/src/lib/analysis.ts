import {
  IAMGroup,
  IAMPolicy,
  IAMPolicyDocument,
  IAMPolicyStatement,
  IAMRole,
  IAMUser,
  IAMValue,
  ProcessedIAMData,
} from "./types";
import { analyzePolicyForPrivesc, CATEGORY_LABELS, PrivescMatch } from "./privesc";

export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";
export type FindingCategory =
  | "privilege-escalation"
  | "administrative-access"
  | "trust-policy"
  | "policy-hygiene"
  | "effective-access"
  | "unused-access";

export interface PolicySource {
  sourceId: string;
  policyType: "managed" | "inline";
  attachmentType: "direct" | "group" | "assumed-role" | "standalone";
  ownerType: "user" | "group" | "role" | "policy";
  ownerId: string;
  ownerName: string;
  ownerArn?: string;
  policyName: string;
  policyArn?: string;
}

export interface PermissionEntry {
  effect: "Allow" | "Deny";
  actions: string[];
  notActions: string[];
  resources: string[];
  notResources: string[];
  hasConditions: boolean;
  conditionKeys: string[];
  source: PolicySource;
  statementIndex: number;
}

export interface RoleReachability {
  roleId: string;
  roleName: string;
  roleArn: string;
  depth: number;
  viaPrincipalArn: string;
  trustMatched: boolean;
  identityAllowsAssumeRole: boolean;
  reason: string;
}

export interface EffectivePermissions {
  principalType: "user" | "role";
  principalId: string;
  principalName: string;
  principalArn: string;
  directEntries: PermissionEntry[];
  inheritedEntries: PermissionEntry[];
  explicitDenies: PermissionEntry[];
  reachableRoles: RoleReachability[];
  serviceActionCounts: Array<{ service: string; count: number }>;
  highRiskActions: string[];
  hasAdministrativeAccess: boolean;
  hasBroadIamAccess: boolean;
  hasPassRoleWildcard: boolean;
}

export interface SecurityFinding {
  id: string;
  severity: FindingSeverity;
  category: FindingCategory;
  entityType: "user" | "role" | "group" | "policy" | "account";
  entityId: string;
  entityName: string;
  title: string;
  description: string;
  evidence: string[];
  recommendation: string;
  source?: PolicySource;
  relatedEntityIds?: string[];
  privescMatches?: PrivescMatch[];
}

export interface AttackPath {
  id: string;
  startType: "user" | "role";
  startId: string;
  startName: string;
  endRoleId?: string;
  endRoleName?: string;
  findingId?: string;
  severity: FindingSeverity;
  steps: string[];
}

export interface EntityDiff<T = unknown> {
  added: T[];
  removed: T[];
  changed: Array<{ before: T; after: T; changes: string[] }>;
}

export interface UploadDiff {
  users: EntityDiff<IAMUser>;
  roles: EntityDiff<IAMRole>;
  groups: EntityDiff<IAMGroup>;
  policies: EntityDiff<IAMPolicy>;
  findings: {
    added: SecurityFinding[];
    removed: SecurityFinding[];
  };
}

const ADMIN_ACTIONS = new Set(["*", "*:*"]);
const HIGH_RISK_ACTION_PATTERNS = [
  "iam:*",
  "iam:PassRole",
  "iam:CreateAccessKey",
  "iam:CreateLoginProfile",
  "iam:UpdateLoginProfile",
  "iam:AttachUserPolicy",
  "iam:AttachRolePolicy",
  "iam:PutUserPolicy",
  "iam:PutRolePolicy",
  "iam:CreatePolicyVersion",
  "iam:SetDefaultPolicyVersion",
  "sts:AssumeRole",
  "lambda:CreateFunction",
  "lambda:UpdateFunctionCode",
  "cloudformation:CreateStack",
  "cloudformation:UpdateStack",
  "ec2:RunInstances",
  "ssm:SendCommand",
  "ssm:StartSession",
];

export function toArray(value: IAMValue | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function normalizeStatements(document: IAMPolicyDocument | null | undefined): IAMPolicyStatement[] {
  if (!document?.Statement) return [];
  return Array.isArray(document.Statement) ? document.Statement : [document.Statement];
}

export function normalizeAction(action: string): string {
  return action.trim().toLowerCase();
}

export function actionMatchesPattern(action: string, pattern: string): boolean {
  const normAction = normalizeAction(action);
  const normPattern = normalizeAction(pattern);

  if (normPattern === "*" || normPattern === "*:*") return true;
  if (normAction === normPattern) return true;

  const patternRegex = new RegExp(
    `^${normPattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`
  );
  return patternRegex.test(normAction);
}

function resourceMatchesPattern(resource: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (resource === pattern) return true;
  const patternRegex = new RegExp(
    `^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`
  );
  return patternRegex.test(resource);
}

export function getDefaultPolicyDocument(policy: IAMPolicy): IAMPolicyDocument | null {
  return (
    policy.PolicyVersionList?.find((version) => version.VersionId === policy.DefaultVersionId)?.Document ||
    policy.PolicyVersionList?.find((version) => version.IsDefaultVersion)?.Document ||
    policy.PolicyVersionList?.[0]?.Document ||
    null
  );
}

function findPolicyByArn(data: ProcessedIAMData, policyArn: string): IAMPolicy | undefined {
  return Object.values(data.policies).find((policy) => policy.Arn === policyArn);
}

function collectPermissionEntries(
  document: IAMPolicyDocument | null | undefined,
  source: PolicySource
): PermissionEntry[] {
  return normalizeStatements(document).flatMap((statement, statementIndex) => {
    const effect = statement.Effect === "Deny" ? "Deny" : statement.Effect === "Allow" ? "Allow" : null;
    if (!effect) return [];

    return [
      {
        effect,
        actions: toArray(statement.Action).map(normalizeAction),
        notActions: toArray(statement.NotAction).map(normalizeAction),
        resources: toArray(statement.Resource),
        notResources: toArray(statement.NotResource),
        hasConditions: !!statement.Condition && Object.keys(statement.Condition).length > 0,
        conditionKeys: getConditionKeys(statement.Condition),
        source,
        statementIndex,
      },
    ];
  });
}

export function statementAllowsAction(entry: PermissionEntry, action: string, resource = "*"): boolean {
  if (entry.effect !== "Allow") return false;

  const actionAllowed =
    entry.notActions.length > 0
      ? !entry.notActions.some((notAction) => actionMatchesPattern(action, notAction))
      : entry.actions.some((allowedAction) => actionMatchesPattern(action, allowedAction));

  if (!actionAllowed) return false;
  if (entry.notResources.length > 0) {
    return !entry.notResources.some((notResource) => resourceMatchesPattern(resource, notResource));
  }

  const resources = entry.resources.length > 0 ? entry.resources : ["*"];
  return resources.some((allowedResource) => resourceMatchesPattern(resource, allowedResource));
}

function getPrincipalPolicyEntries(
  data: ProcessedIAMData,
  principalType: "user" | "role",
  principalId: string,
  attachmentType: PolicySource["attachmentType"] = "direct"
): PermissionEntry[] {
  const principal = principalType === "user" ? data.users[principalId] : data.roles[principalId];
  if (!principal) return [];

  const entries: PermissionEntry[] = [];
  const inlinePolicies = principalType === "user"
    ? (principal as IAMUser).UserPolicyList
    : (principal as IAMRole).RolePolicyList;
  const attachedPolicies = principal.AttachedManagedPolicies || [];
  const ownerName = principalType === "user" ? (principal as IAMUser).UserName : (principal as IAMRole).RoleName;

  attachedPolicies.forEach((attachedPolicy) => {
    const policy = findPolicyByArn(data, attachedPolicy.PolicyArn);
    if (!policy) return;
    entries.push(
      ...collectPermissionEntries(getDefaultPolicyDocument(policy), {
        sourceId: `${principalType}-${principalId}-managed-${policy.PolicyId}`,
        policyType: "managed",
        attachmentType,
        ownerType: principalType,
        ownerId: principalId,
        ownerName,
        ownerArn: principal.Arn,
        policyName: policy.PolicyName,
        policyArn: policy.Arn,
      })
    );
  });

  inlinePolicies.forEach((policy) => {
    entries.push(
      ...collectPermissionEntries(policy.PolicyDocument, {
        sourceId: `${principalType}-${principalId}-inline-${policy.PolicyName}`,
        policyType: "inline",
        attachmentType,
        ownerType: principalType,
        ownerId: principalId,
        ownerName,
        ownerArn: principal.Arn,
        policyName: policy.PolicyName,
      })
    );
  });

  return entries;
}

function getGroupPolicyEntries(data: ProcessedIAMData, group: IAMGroup): PermissionEntry[] {
  const entries: PermissionEntry[] = [];

  group.AttachedManagedPolicies.forEach((attachedPolicy) => {
    const policy = findPolicyByArn(data, attachedPolicy.PolicyArn);
    if (!policy) return;
    entries.push(
      ...collectPermissionEntries(getDefaultPolicyDocument(policy), {
        sourceId: `group-${group.GroupId}-managed-${policy.PolicyId}`,
        policyType: "managed",
        attachmentType: "group",
        ownerType: "group",
        ownerId: group.GroupId,
        ownerName: group.GroupName,
        ownerArn: group.Arn,
        policyName: policy.PolicyName,
        policyArn: policy.Arn,
      })
    );
  });

  group.GroupPolicyList.forEach((policy) => {
    entries.push(
      ...collectPermissionEntries(policy.PolicyDocument, {
        sourceId: `group-${group.GroupId}-inline-${policy.PolicyName}`,
        policyType: "inline",
        attachmentType: "group",
        ownerType: "group",
        ownerId: group.GroupId,
        ownerName: group.GroupName,
        ownerArn: group.Arn,
        policyName: policy.PolicyName,
      })
    );
  });

  return entries;
}

export function analyzeEffectivePermissions(
  data: ProcessedIAMData,
  principalType: "user" | "role",
  principalId: string,
  maxAssumeDepth = 3
): EffectivePermissions | null {
  const principal = principalType === "user" ? data.users[principalId] : data.roles[principalId];
  if (!principal) return null;

  const principalName = principalType === "user" ? (principal as IAMUser).UserName : (principal as IAMRole).RoleName;
  const directEntries = getPrincipalPolicyEntries(data, principalType, principalId);

  if (principalType === "user") {
    const user = principal as IAMUser;
    user.GroupList.forEach((groupName) => {
      const group = Object.values(data.groups).find((candidate) => candidate.GroupName === groupName);
      if (group) {
        directEntries.push(...getGroupPolicyEntries(data, group));
      }
    });
  }

  const inheritedEntries: PermissionEntry[] = [];
  const reachableRoles: RoleReachability[] = [];
  const visitedRoles = new Set<string>();

  const traverseAssumableRoles = (
    currentArn: string,
    currentEntries: PermissionEntry[],
    depth: number
  ) => {
    if (depth > maxAssumeDepth) return;

    for (const targetRole of Object.values(data.roles)) {
      if (visitedRoles.has(targetRole.RoleId)) continue;

      const trustMatched = roleTrustsPrincipal(targetRole, currentArn);
      if (!trustMatched) continue;

      const identityAllowsAssumeRole = entriesAllowAction(currentEntries, "sts:AssumeRole", targetRole.Arn);
      const trustIsExplicitSameAccount = getAccountIdFromArn(currentArn) === getAccountIdFromArn(targetRole.Arn);

      if (!identityAllowsAssumeRole && !trustIsExplicitSameAccount) continue;

      visitedRoles.add(targetRole.RoleId);
      reachableRoles.push({
        roleId: targetRole.RoleId,
        roleName: targetRole.RoleName,
        roleArn: targetRole.Arn,
        depth,
        viaPrincipalArn: currentArn,
        trustMatched,
        identityAllowsAssumeRole,
        reason: identityAllowsAssumeRole
          ? "Trust policy matched and identity policy allows sts:AssumeRole."
          : "Trust policy explicitly references a same-account principal.",
      });

      const roleEntries = getPrincipalPolicyEntries(data, "role", targetRole.RoleId, "assumed-role");
      inheritedEntries.push(...roleEntries);
      traverseAssumableRoles(targetRole.Arn, roleEntries, depth + 1);
    }
  };

  traverseAssumableRoles(principal.Arn, directEntries, 1);

  const explicitDenies = [...directEntries, ...inheritedEntries].filter((entry) => entry.effect === "Deny");
  const allowedEntries = [...directEntries, ...inheritedEntries].filter((entry) => entry.effect === "Allow");
  const serviceActionCounts = summarizeServiceActions(allowedEntries);
  const highRiskActions = getHighRiskActions(allowedEntries);

  return {
    principalType,
    principalId,
    principalName,
    principalArn: principal.Arn,
    directEntries,
    inheritedEntries,
    explicitDenies,
    reachableRoles,
    serviceActionCounts,
    highRiskActions,
    hasAdministrativeAccess: allowedEntries.some(hasAdministrativeStatement),
    hasBroadIamAccess: allowedEntries.some((entry) =>
      entry.actions.some((action) => actionMatchesPattern("iam:CreateRole", action) && actionMatchesPattern("iam:AttachRolePolicy", action))
    ),
    hasPassRoleWildcard: allowedEntries.some(
      (entry) =>
        statementAllowsAction(entry, "iam:PassRole") &&
        (entry.resources.length === 0 || entry.resources.includes("*"))
    ),
  };
}

export function analyzeSecurityFindings(data: ProcessedIAMData): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  collectAllPolicyDocuments(data).forEach(({ document, source }) => {
    const entries = collectPermissionEntries(document, source);
    entries.forEach((entry) => {
      if (entry.effect !== "Allow") return;

      if (hasAdministrativeStatement(entry)) {
        findings.push({
          id: findingId("admin", source.sourceId, entry.statementIndex),
          severity: "critical",
          category: "administrative-access",
          entityType: source.ownerType,
          entityId: source.ownerId,
          entityName: source.ownerName,
          title: "Administrative wildcard access",
          description: "This policy statement allows all actions and all resources.",
          evidence: [
            `Policy: ${source.policyName}`,
            `Actions: ${formatList(entry.actions.length ? entry.actions : ["NotAction"])}`,
            `Resources: ${formatList(entry.resources.length ? entry.resources : ["*"])}`,
          ],
          recommendation: "Replace wildcard administrative access with least-privilege service actions and resource constraints.",
          source,
        });
      }

      if (entry.notActions.length > 0) {
        findings.push({
          id: findingId("allow-not-action", source.sourceId, entry.statementIndex),
          severity: "high",
          category: "policy-hygiene",
          entityType: source.ownerType,
          entityId: source.ownerId,
          entityName: source.ownerName,
          title: "Allow statement uses NotAction",
          description: "Allow with NotAction grants every action except the listed exclusions, which is usually broader than intended.",
          evidence: [`Policy: ${source.policyName}`, `NotAction: ${formatList(entry.notActions)}`],
          recommendation: "Replace NotAction allow statements with explicit action allow lists.",
          source,
        });
      }

      if (statementAllowsAction(entry, "iam:PassRole") && isWildcardResource(entry)) {
        findings.push({
          id: findingId("passrole-wildcard", source.sourceId, entry.statementIndex),
          severity: entry.conditionKeys.includes("iam:PassedToService") ? "medium" : "high",
          category: "privilege-escalation",
          entityType: source.ownerType,
          entityId: source.ownerId,
          entityName: source.ownerName,
          title: "iam:PassRole is not resource-scoped",
          description: "A principal that can pass arbitrary roles may combine this with service creation permissions to inherit stronger privileges.",
          evidence: [
            `Policy: ${source.policyName}`,
            `Resource: ${formatList(entry.resources.length ? entry.resources : ["*"])}`,
            entry.conditionKeys.length ? `Conditions: ${formatList(entry.conditionKeys)}` : "No conditions detected",
          ],
          recommendation: "Restrict iam:PassRole to specific role ARNs and add iam:PassedToService conditions.",
          source,
        });
      }

      const broadServiceActions = entry.actions.filter(
        (action) => action.endsWith(":*") && !action.startsWith("cloudwatch:") && !action.startsWith("logs:")
      );
      if (broadServiceActions.length > 0 && isWildcardResource(entry)) {
        findings.push({
          id: findingId("broad-service", source.sourceId, entry.statementIndex),
          severity: broadServiceActions.some((action) => action.startsWith("iam:")) ? "high" : "medium",
          category: "policy-hygiene",
          entityType: source.ownerType,
          entityId: source.ownerId,
          entityName: source.ownerName,
          title: "Broad service wildcard on all resources",
          description: "This statement grants all actions for at least one service across all resources.",
          evidence: [`Policy: ${source.policyName}`, `Actions: ${formatList(broadServiceActions)}`],
          recommendation: "Replace service wildcards with the specific API actions required for the workload.",
          source,
        });
      }
    });

    const privescMatches = analyzePolicyForPrivesc(document);
    if (privescMatches.length > 0) {
      const completeMatches = privescMatches.filter((match) => match.allRequiredPresent);
      findings.push({
        id: findingId("privesc", source.sourceId),
        severity: completeMatches.length > 0 ? "critical" : "high",
        category: "privilege-escalation",
        entityType: source.ownerType,
        entityId: source.ownerId,
        entityName: source.ownerName,
        title: "Known privilege-escalation permissions",
        description: "This policy matches known AWS privilege-escalation techniques.",
        evidence: privescMatches.slice(0, 5).map((match) => {
          const label = CATEGORY_LABELS[match.path.category] || match.path.category;
          return `${label}: ${match.path.name}${match.allRequiredPresent ? "" : ` (missing ${match.missingPermissions.join(", ")})`}`;
        }),
        recommendation: "Review each matched path, reduce the listed permissions, and constrain role-passing and resource creation actions.",
        source,
        privescMatches,
      });
    }
  });

  Object.values(data.roles).forEach((role) => {
    findings.push(...analyzeRoleTrustFindings(role));
  });

  Object.values(data.policies).forEach((policy) => {
    if (policy.AttachmentCount === 0 && !policy.Arn.includes("::aws:policy/")) {
      findings.push({
        id: findingId("unused-policy", policy.PolicyId),
        severity: "low",
        category: "unused-access",
        entityType: "policy",
        entityId: policy.PolicyId,
        entityName: policy.PolicyName,
        title: "Customer-managed policy is unattached",
        description: "The policy has no current attachments and may be stale.",
        evidence: [`Policy ARN: ${policy.Arn}`],
        recommendation: "Confirm whether the policy is still needed. Delete stale policies to reduce review surface.",
      });
    }
  });

  Object.values(data.users).forEach((user) => {
    const effective = analyzeEffectivePermissions(data, "user", user.UserId);
    if (!effective) return;
    if (effective.hasAdministrativeAccess || effective.reachableRoles.some((role) => role.depth > 0)) {
      findings.push({
        id: findingId("effective-access", user.UserId),
        severity: effective.hasAdministrativeAccess ? "critical" : "medium",
        category: "effective-access",
        entityType: "user",
        entityId: user.UserId,
        entityName: user.UserName,
        title: effective.hasAdministrativeAccess ? "User has effective administrative access" : "User can assume roles",
        description: "The user's direct, group, and assumable-role permissions expand their effective access.",
        evidence: [
          `${effective.reachableRoles.length} reachable role(s)`,
          `${effective.highRiskActions.length} high-risk action pattern(s)`,
        ],
        recommendation: "Review group memberships, trust policies, and sts:AssumeRole grants for this user.",
        relatedEntityIds: effective.reachableRoles.map((role) => role.roleId),
      });
    }
  });

  return sortFindings(dedupeFindings(findings));
}

export function buildAttackPaths(data: ProcessedIAMData): AttackPath[] {
  const findings = analyzeSecurityFindings(data);
  const paths: AttackPath[] = [];

  (["user", "role"] as const).forEach((principalType) => {
    const principals = principalType === "user" ? Object.values(data.users) : Object.values(data.roles);
    principals.forEach((principal) => {
      const id = principalType === "user" ? (principal as IAMUser).UserId : (principal as IAMRole).RoleId;
      const name = principalType === "user" ? (principal as IAMUser).UserName : (principal as IAMRole).RoleName;
      const effective = analyzeEffectivePermissions(data, principalType, id);
      if (!effective) return;

      effective.reachableRoles.forEach((role) => {
        const roleFindings = findings.filter(
          (finding) =>
            finding.entityType === "role" &&
            finding.entityId === role.roleId &&
            (finding.severity === "critical" || finding.severity === "high")
        );

        if (roleFindings.length === 0 && !effective.hasAdministrativeAccess) return;

        const finding = roleFindings[0];
        paths.push({
          id: `${principalType}-${id}-to-role-${role.roleId}-${finding?.id || "effective"}`,
          startType: principalType,
          startId: id,
          startName: name,
          endRoleId: role.roleId,
          endRoleName: role.roleName,
          findingId: finding?.id,
          severity: finding?.severity || "high",
          steps: [
            `${name} starts as ${principalType}`,
            role.reason,
            `Assume ${role.roleName}`,
            finding ? `${role.roleName} has finding: ${finding.title}` : "Inherited permissions include administrative access",
          ],
        });
      });
    });
  });

  return paths.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

export function diffUploads(before: ProcessedIAMData, after: ProcessedIAMData): UploadDiff {
  const beforeFindings = analyzeSecurityFindings(before);
  const afterFindings = analyzeSecurityFindings(after);

  return {
    users: diffEntityMap(before.users, after.users, "UserName"),
    roles: diffEntityMap(before.roles, after.roles, "RoleName"),
    groups: diffEntityMap(before.groups, after.groups, "GroupName"),
    policies: diffEntityMap(before.policies, after.policies, "PolicyName"),
    findings: {
      added: afterFindings.filter((finding) => !beforeFindings.some((candidate) => candidate.id === finding.id)),
      removed: beforeFindings.filter((finding) => !afterFindings.some((candidate) => candidate.id === finding.id)),
    },
  };
}

export function exportFindingsAsMarkdown(findings: SecurityFinding[]): string {
  const lines = ["# AWS IAM Viewer Findings", ""];

  if (findings.length === 0) {
    lines.push("No findings detected.");
    return lines.join("\n");
  }

  findings.forEach((finding, index) => {
    lines.push(`## ${index + 1}. [${finding.severity.toUpperCase()}] ${finding.title}`);
    lines.push("");
    lines.push(`- Entity: ${finding.entityType} ${finding.entityName}`);
    lines.push(`- Category: ${finding.category}`);
    lines.push(`- Description: ${finding.description}`);
    if (finding.source) {
      lines.push(`- Policy: ${finding.source.policyName}`);
    }
    lines.push("- Evidence:");
    finding.evidence.forEach((evidence) => lines.push(`  - ${evidence}`));
    lines.push(`- Recommendation: ${finding.recommendation}`);
    lines.push("");
  });

  return lines.join("\n");
}

export function exportFindingsAsCsv(findings: SecurityFinding[]): string {
  const rows = [
    ["severity", "category", "entity_type", "entity_name", "title", "policy", "evidence", "recommendation"],
    ...findings.map((finding) => [
      finding.severity,
      finding.category,
      finding.entityType,
      finding.entityName,
      finding.title,
      finding.source?.policyName || "",
      finding.evidence.join(" | "),
      finding.recommendation,
    ]),
  ];

  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

export function exportEffectivePermissionsAsMarkdown(effective: EffectivePermissions): string {
  const lines = [
    `# Effective Permissions: ${effective.principalName}`,
    "",
    `Principal: ${effective.principalType} ${effective.principalArn}`,
    "",
    "## Summary",
    "",
    `- Administrative access: ${effective.hasAdministrativeAccess ? "yes" : "no"}`,
    `- Broad IAM access: ${effective.hasBroadIamAccess ? "yes" : "no"}`,
    `- PassRole wildcard: ${effective.hasPassRoleWildcard ? "yes" : "no"}`,
    `- Reachable roles: ${effective.reachableRoles.length}`,
    `- High-risk actions: ${effective.highRiskActions.length}`,
    "",
    "## Reachable Roles",
    "",
  ];

  if (effective.reachableRoles.length === 0) {
    lines.push("No assumable roles detected.");
  } else {
    effective.reachableRoles.forEach((role) => {
      lines.push(`- ${role.roleName}: ${role.reason}`);
    });
  }

  lines.push("", "## Top Services", "");
  effective.serviceActionCounts.slice(0, 20).forEach((item) => {
    lines.push(`- ${item.service}: ${item.count} action pattern(s)`);
  });

  return lines.join("\n");
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function collectAllPolicyDocuments(data: ProcessedIAMData): Array<{ document: IAMPolicyDocument | null; source: PolicySource }> {
  const documents: Array<{ document: IAMPolicyDocument | null; source: PolicySource }> = [];

  Object.values(data.policies).forEach((policy) => {
    documents.push({
      document: getDefaultPolicyDocument(policy),
      source: {
        sourceId: `policy-${policy.PolicyId}`,
        policyType: "managed",
        attachmentType: "standalone",
        ownerType: "policy",
        ownerId: policy.PolicyId,
        ownerName: policy.PolicyName,
        ownerArn: policy.Arn,
        policyName: policy.PolicyName,
        policyArn: policy.Arn,
      },
    });
  });

  Object.values(data.users).forEach((user) => {
    user.UserPolicyList.forEach((policy) => {
      documents.push({
        document: policy.PolicyDocument,
        source: {
          sourceId: `user-${user.UserId}-inline-${policy.PolicyName}`,
          policyType: "inline",
          attachmentType: "direct",
          ownerType: "user",
          ownerId: user.UserId,
          ownerName: user.UserName,
          ownerArn: user.Arn,
          policyName: policy.PolicyName,
        },
      });
    });
  });

  Object.values(data.roles).forEach((role) => {
    role.RolePolicyList.forEach((policy) => {
      documents.push({
        document: policy.PolicyDocument,
        source: {
          sourceId: `role-${role.RoleId}-inline-${policy.PolicyName}`,
          policyType: "inline",
          attachmentType: "direct",
          ownerType: "role",
          ownerId: role.RoleId,
          ownerName: role.RoleName,
          ownerArn: role.Arn,
          policyName: policy.PolicyName,
        },
      });
    });
  });

  Object.values(data.groups).forEach((group) => {
    group.GroupPolicyList.forEach((policy) => {
      documents.push({
        document: policy.PolicyDocument,
        source: {
          sourceId: `group-${group.GroupId}-inline-${policy.PolicyName}`,
          policyType: "inline",
          attachmentType: "group",
          ownerType: "group",
          ownerId: group.GroupId,
          ownerName: group.GroupName,
          ownerArn: group.Arn,
          policyName: policy.PolicyName,
        },
      });
    });
  });

  return documents;
}

function analyzeRoleTrustFindings(role: IAMRole): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const roleAccountId = getAccountIdFromArn(role.Arn);

  normalizeStatements(role.AssumeRolePolicyDocument).forEach((statement, statementIndex) => {
    if (statement.Effect !== "Allow") return;

    const principalValues = getPrincipalValues(statement);
    const conditionKeys = getConditionKeys(statement.Condition);
    const hasMfa = conditionKeys.includes("aws:MultiFactorAuthPresent");
    const hasExternalId = conditionKeys.includes("sts:ExternalId");

    principalValues.forEach((principal) => {
      if (principal === "*") {
        findings.push({
          id: findingId("trust-wildcard", role.RoleId, statementIndex),
          severity: "critical",
          category: "trust-policy",
          entityType: "role",
          entityId: role.RoleId,
          entityName: role.RoleName,
          title: "Role trust allows any principal",
          description: "The trust policy uses a wildcard principal.",
          evidence: [`Principal: ${principal}`, `Conditions: ${conditionKeys.length ? conditionKeys.join(", ") : "none"}`],
          recommendation: "Replace wildcard trust with explicit principal ARNs and strong conditions.",
        });
      }

      if (principal.endsWith(":root")) {
        const principalAccountId = getAccountIdFromArn(principal);
        findings.push({
          id: findingId("trust-root", role.RoleId, statementIndex, principal),
          severity: principalAccountId && principalAccountId !== roleAccountId && !hasExternalId ? "high" : "medium",
          category: "trust-policy",
          entityType: "role",
          entityId: role.RoleId,
          entityName: role.RoleName,
          title: "Role trusts account root",
          description: "Trusting account root delegates access to every principal in that account that has sts:AssumeRole.",
          evidence: [
            `Principal: ${principal}`,
            principalAccountId && principalAccountId !== roleAccountId ? "Cross-account trust" : "Same-account root trust",
            hasExternalId ? "ExternalId condition present" : "ExternalId condition not detected",
          ],
          recommendation: "Trust explicit role/user ARNs. For third-party accounts, require sts:ExternalId.",
        });
      }

      const principalAccountId = getAccountIdFromArn(principal);
      if (principalAccountId && roleAccountId && principalAccountId !== roleAccountId && !hasExternalId) {
        findings.push({
          id: findingId("trust-cross-account-no-external-id", role.RoleId, statementIndex, principal),
          severity: "high",
          category: "trust-policy",
          entityType: "role",
          entityId: role.RoleId,
          entityName: role.RoleName,
          title: "Cross-account trust lacks ExternalId",
          description: "Cross-account role assumptions without ExternalId can expose the role to confused-deputy risk.",
          evidence: [`Principal: ${principal}`, `Role account: ${roleAccountId}`, `Principal account: ${principalAccountId}`],
          recommendation: "Add a sts:ExternalId condition for third-party cross-account trusts.",
        });
      }
    });

    if (!hasMfa && principalValues.some((principal) => principal.includes(":user/") || principal.endsWith(":root"))) {
      findings.push({
        id: findingId("trust-no-mfa", role.RoleId, statementIndex),
        severity: "medium",
        category: "trust-policy",
        entityType: "role",
        entityId: role.RoleId,
        entityName: role.RoleName,
        title: "Human-assumable role does not require MFA",
        description: "The trust policy appears assumable by human principals without an MFA condition.",
        evidence: [`Principals: ${principalValues.join(", ")}`, "aws:MultiFactorAuthPresent condition not detected"],
        recommendation: "Require MFA for sensitive human role assumptions.",
      });
    }
  });

  return findings;
}

function roleTrustsPrincipal(role: IAMRole, principalArn: string): boolean {
  const principalAccountId = getAccountIdFromArn(principalArn);

  return normalizeStatements(role.AssumeRolePolicyDocument).some((statement) => {
    if (statement.Effect !== "Allow") return false;

    return getPrincipalValues(statement).some((trustedPrincipal) => {
      if (trustedPrincipal === "*") return true;
      if (trustedPrincipal === principalArn) return true;
      if (trustedPrincipal.endsWith(":root")) {
        return getAccountIdFromArn(trustedPrincipal) === principalAccountId;
      }
      return false;
    });
  });
}

function entriesAllowAction(entries: PermissionEntry[], action: string, resource: string): boolean {
  const explicitDeny = entries.some((entry) => entry.effect === "Deny" && statementAllowsAction(entry, action, resource));
  if (explicitDeny) return false;
  return entries.some((entry) => statementAllowsAction(entry, action, resource));
}

function summarizeServiceActions(entries: PermissionEntry[]): Array<{ service: string; count: number }> {
  const serviceMap = new Map<string, Set<string>>();

  entries.forEach((entry) => {
    const actions = entry.notActions.length > 0 ? ["*"] : entry.actions;
    actions.forEach((action) => {
      const service = action.includes(":") ? action.split(":")[0] : "*";
      const existing = serviceMap.get(service) || new Set<string>();
      existing.add(action);
      serviceMap.set(service, existing);
    });
  });

  return Array.from(serviceMap.entries())
    .map(([service, actions]) => ({ service, count: actions.size }))
    .sort((a, b) => b.count - a.count || a.service.localeCompare(b.service));
}

function getHighRiskActions(entries: PermissionEntry[]): string[] {
  const matched = new Set<string>();
  entries.forEach((entry) => {
    const actions = entry.notActions.length > 0 ? ["*"] : entry.actions;
    HIGH_RISK_ACTION_PATTERNS.forEach((pattern) => {
      if (actions.some((action) => actionMatchesPattern(pattern, action) || actionMatchesPattern(action, pattern))) {
        matched.add(pattern);
      }
    });
  });
  return Array.from(matched).sort();
}

function hasAdministrativeStatement(entry: PermissionEntry): boolean {
  const actions = entry.actions.map(normalizeAction);
  const resources = entry.resources.length ? entry.resources : ["*"];
  const allActions = actions.some((action) => ADMIN_ACTIONS.has(action));
  const allResources = resources.includes("*");
  return entry.effect === "Allow" && allActions && allResources;
}

function isWildcardResource(entry: PermissionEntry): boolean {
  return entry.resources.length === 0 || entry.resources.includes("*");
}

function getPrincipalValues(statement: IAMPolicyStatement): string[] {
  const principal = statement.Principal;
  if (!principal) return [];
  if (typeof principal === "string") return [principal];

  return [
    ...toArray(principal.AWS),
    ...toArray(principal.Service),
    ...toArray(principal.Federated),
    ...toArray(principal.CanonicalUser),
  ];
}

function getConditionKeys(condition: Record<string, unknown> | undefined): string[] {
  if (!condition) return [];

  const keys = new Set<string>();
  Object.values(condition).forEach((conditionValue) => {
    if (!conditionValue || typeof conditionValue !== "object" || Array.isArray(conditionValue)) return;
    Object.keys(conditionValue).forEach((key) => keys.add(key));
  });
  return Array.from(keys).sort();
}

function getAccountIdFromArn(arn: string | undefined): string | null {
  if (!arn) return null;
  const parts = arn.split(":");
  return parts.length > 4 && /^\d{12}$/.test(parts[4]) ? parts[4] : null;
}

function formatList(values: string[]): string {
  if (values.length === 0) return "none";
  if (values.length <= 5) return values.join(", ");
  return `${values.slice(0, 5).join(", ")} and ${values.length - 5} more`;
}

function findingId(...parts: Array<string | number | undefined>): string {
  return parts.filter((part) => part !== undefined).join(":").replace(/\s+/g, "-");
}

function sortFindings(findings: SecurityFinding[]): SecurityFinding[] {
  return findings.toSorted(
    (a, b) =>
      severityRank(b.severity) - severityRank(a.severity) ||
      a.category.localeCompare(b.category) ||
      a.entityName.localeCompare(b.entityName)
  );
}

function dedupeFindings(findings: SecurityFinding[]): SecurityFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    if (seen.has(finding.id)) return false;
    seen.add(finding.id);
    return true;
  });
}

function severityRank(severity: FindingSeverity): number {
  switch (severity) {
    case "critical":
      return 5;
    case "high":
      return 4;
    case "medium":
      return 3;
    case "low":
      return 2;
    case "info":
      return 1;
  }
}

function diffEntityMap<T extends object>(
  before: Record<string, T>,
  after: Record<string, T>,
  nameKey: keyof T
): EntityDiff<T> {
  const added: T[] = [];
  const removed: T[] = [];
  const changed: Array<{ before: T; after: T; changes: string[] }> = [];

  for (const [id, value] of Object.entries(after)) {
    const beforeValue = before[id];
    if (!beforeValue) {
      added.push(value);
      continue;
    }

    if (stableJson(beforeValue) !== stableJson(value)) {
      changed.push({
        before: beforeValue,
        after: value,
        changes: summarizeObjectChanges(beforeValue, value, String(nameKey)),
      });
    }
  }

  for (const [id, value] of Object.entries(before)) {
    if (!after[id]) {
      removed.push(value);
    }
  }

  return { added, removed, changed };
}

function summarizeObjectChanges<T extends object>(before: T, after: T, nameKey: string): string[] {
  const ignored = new Set([nameKey]);
  const beforeRecord = before as Record<string, unknown>;
  const afterRecord = after as Record<string, unknown>;
  const keys = new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)]);
  const changes: string[] = [];

  keys.forEach((key) => {
    if (ignored.has(key)) return;
    if (stableJson(beforeRecord[key]) !== stableJson(afterRecord[key])) {
      changes.push(key);
    }
  });

  return changes;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}
