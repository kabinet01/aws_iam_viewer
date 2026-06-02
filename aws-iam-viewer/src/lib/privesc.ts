import privescPaths from "@/data/privesc-paths.json";
import { IAMPolicyDocument } from "@/lib/types";

export interface PrivescPermission {
  permission: string;
  resourceConstraints?: string;
}

export interface PrivescPath {
  id: string;
  name: string;
  category: string;
  services: string[];
  description: string;
  permissions: {
    required?: PrivescPermission[];
    additional?: PrivescPermission[];
  };
  recommendation: string;
  references: Array<{ title: string; url: string }>;
  relatedPaths: string[];
}

export interface PrivescMatch {
  path: PrivescPath;
  matchedPermissions: string[];
  missingPermissions: string[];
  allRequiredPresent: boolean;
  confidence: "confirmed" | "partial";
  matchedPermissionCount: number;
  requiredPermissionCount: number;
}

export interface AnalyzePrivescOptions {
  includePartial?: boolean;
  minMatchedPermissions?: number;
}

const paths: PrivescPath[] = privescPaths as PrivescPath[];

// Build a map from permission string to array of paths that require it
const permissionToPaths: Map<string, PrivescPath[]> = new Map();

function buildLookup() {
  if (permissionToPaths.size > 0) return;
  for (const path of paths) {
    const required = path.permissions.required || [];
    for (const req of required) {
      const existing = permissionToPaths.get(req.permission) || [];
      existing.push(path);
      permissionToPaths.set(req.permission, existing);
    }
  }
}

function normalizeAction(action: string): string {
  return action.trim().toLowerCase();
}

function actionMatchesPattern(action: string, pattern: string): boolean {
  const normAction = normalizeAction(action);
  const normPattern = normalizeAction(pattern);

  if (normPattern === "*") return true;

  if (normPattern.endsWith("*")) {
    const prefix = normPattern.slice(0, -1);
    return normAction.startsWith(prefix);
  }

  return normAction === normPattern;
}

function extractPermissionsFromPolicy(
  policyDocument: IAMPolicyDocument | null
): string[] {
  if (!policyDocument?.Statement) return [];

  const statements = Array.isArray(policyDocument.Statement)
    ? policyDocument.Statement
    : [policyDocument.Statement];

  const permissions = new Set<string>();

  for (const statement of statements) {
    if (statement.Effect !== "Allow") continue;

    if (statement.NotAction) {
      // "NotAction" can represent broad allow logic that is difficult to reason about safely
      // for fixed signature matching. Skip it here and rely on explicit actions.
      continue;
    }

    const actions = statement.Action || [];
    const actionList = Array.isArray(actions) ? actions : [actions];

    for (const action of actionList) {
      permissions.add(normalizeAction(action));
    }
  }

  return Array.from(permissions);
}

function getDefaultPolicyDocument(
  policy: NonNullable<Parameters<typeof analyzeEntityPolicies>[0][number]>
): IAMPolicyDocument | null {
  if (!policy.PolicyVersionList || policy.PolicyVersionList.length === 0) return null;

  for (const version of policy.PolicyVersionList) {
    if (version.VersionId === policy.DefaultVersionId) {
      return version.Document || null;
    }
  }

  return policy.PolicyVersionList[0]?.Document || null;
}

export function analyzePolicyForPrivesc(
  policyDocument: IAMPolicyDocument | null,
  options: AnalyzePrivescOptions = {}
): PrivescMatch[] {
  if (!policyDocument) return [];

  buildLookup();

  const extractedActions = extractPermissionsFromPolicy(policyDocument);
  if (extractedActions.length === 0) return [];

  const matchedPaths = new Map<string, PrivescMatch>();

  for (const action of extractedActions) {
    // Check each known escalation permission against this action
    for (const [privescPerm, candidatePaths] of permissionToPaths) {
      if (!actionMatchesPattern(privescPerm, action) && !actionMatchesPattern(action, privescPerm)) {
        // Check both directions: action matching the known perm (e.g. iam:* matches iam:CreatePolicyVersion)
        // AND known perm matching action (e.g. action is specific, known perm is pattern)
        continue;
      }

      for (const path of candidatePaths) {
        let match = matchedPaths.get(path.id);
        if (!match) {
          const required = (path.permissions.required || []).map((p) => p.permission);
          match = {
            path,
            matchedPermissions: [],
            missingPermissions: [...required],
            allRequiredPresent: false,
            confidence: "partial",
            matchedPermissionCount: 0,
            requiredPermissionCount: required.length,
          };
          matchedPaths.set(path.id, match);
        }

        // Check each required permission of this path
        const required = path.permissions.required || [];
        const matchedPermissions = new Set(match.matchedPermissions);
        const missingPermissions = new Set(match.missingPermissions);

        for (const req of required) {
          if (!matchedPermissions.has(req.permission)) {
            // Check if any of the extracted actions satisfies this requirement
            const satisfied = extractedActions.some((a) =>
              actionMatchesPattern(req.permission, a) ||
              actionMatchesPattern(a, req.permission)
            );
            if (satisfied) {
              matchedPermissions.add(req.permission);
              missingPermissions.delete(req.permission);
            }
          }
        }

        match.matchedPermissions = Array.from(matchedPermissions);
        match.missingPermissions = Array.from(missingPermissions);
        match.allRequiredPresent = match.missingPermissions.length === 0;
        match.confidence = match.allRequiredPresent ? "confirmed" : "partial";
        match.matchedPermissionCount = match.matchedPermissions.length;
        match.requiredPermissionCount = required.length;
      }
    }
  }

  const includePartial = options.includePartial ?? false;
  const minMatchedPermissions = options.minMatchedPermissions ?? 1;

  return Array.from(matchedPaths.values())
    .filter((match) =>
      match.allRequiredPresent ||
      (includePartial && match.matchedPermissionCount >= minMatchedPermissions)
    )
    .sort((a, b) => {
      if (a.allRequiredPresent !== b.allRequiredPresent) {
        return a.allRequiredPresent ? -1 : 1;
      }
      return b.matchedPermissionCount - a.matchedPermissionCount || a.path.name.localeCompare(b.path.name);
    });
}

export interface EntityPrivescResult {
  policyName: string;
  policyArn?: string;
  policyType: "managed" | "inline";
  matches: PrivescMatch[];
}

export function analyzeEntityPolicies(
  managedPolicies: Array<{
    PolicyName: string;
    Arn: string;
    PolicyVersionList?: Array<{
      VersionId: string;
      Document?: IAMPolicyDocument;
    }>;
    DefaultVersionId?: string;
  }>,
  inlinePolicies: Array<{
    PolicyName: string;
    PolicyDocument?: IAMPolicyDocument;
  }>
): EntityPrivescResult[] {
  const results: EntityPrivescResult[] = [];

  for (const policy of managedPolicies) {
    const document = getDefaultPolicyDocument(policy);
    const matches = analyzePolicyForPrivesc(document);

    if (matches.length > 0) {
      results.push({
        policyName: policy.PolicyName,
        policyArn: policy.Arn,
        policyType: "managed",
        matches,
      });
    }
  }

  for (const policy of inlinePolicies) {
    const matches = analyzePolicyForPrivesc(policy.PolicyDocument || null);

    if (matches.length > 0) {
      results.push({
        policyName: policy.PolicyName,
        policyType: "inline",
        matches,
      });
    }
  }

  return results;
}

export const CATEGORY_LABELS: Record<string, string> = {
  "self-escalation": "Self Escalation",
  "new-passrole": "PassRole (New Resource)",
  "existing-passrole": "PassRole (Existing Resource)",
  "principal-access": "Principal Access",
};
