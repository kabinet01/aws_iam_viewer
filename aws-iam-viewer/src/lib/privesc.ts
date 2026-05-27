import privescPaths from "@/data/privesc-paths.json";

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
}

interface StatementBlock {
  Effect?: string;
  Action?: string | string[];
  NotAction?: string | string[];
  Resource?: string | string[];
}

interface PolicyDocument {
  Version?: string;
  Statement?: StatementBlock | StatementBlock[];
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
  policyDocument: PolicyDocument | null
): string[] {
  if (!policyDocument?.Statement) return [];

  const statements = Array.isArray(policyDocument.Statement)
    ? policyDocument.Statement
    : [policyDocument.Statement];

  const permissions = new Set<string>();

  for (const statement of statements) {
    if (statement.Effect !== "Allow") continue;

    const notActions = statement.NotAction;
    if (notActions) {
      // Allow + NotAction = all actions EXCEPT those listed.
      // This is inherently broad — treat as wildcard to flag all known privesc paths.
      permissions.add("*");
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

export function analyzePolicyForPrivesc(
  policyDocument: PolicyDocument | null
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
          };
          matchedPaths.set(path.id, match);
        }

        // Check each required permission of this path
        const required = path.permissions.required || [];
        for (const req of required) {
          if (!match.matchedPermissions.includes(req.permission)) {
            // Check if any of the extracted actions satisfies this requirement
            const satisfied = extractedActions.some((a) =>
              actionMatchesPattern(req.permission, a) ||
              actionMatchesPattern(a, req.permission)
            );
            if (satisfied && !match.matchedPermissions.includes(req.permission)) {
              match.matchedPermissions.push(req.permission);
              match.missingPermissions = match.missingPermissions.filter(
                (m) => m !== req.permission
              );
            }
          }
        }

        match.allRequiredPresent = match.missingPermissions.length === 0;
      }
    }
  }

  return Array.from(matchedPaths.values());
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
      Document?: PolicyDocument;
    }>;
    DefaultVersionId?: string;
  }>,
  inlinePolicies: Array<{
    PolicyName: string;
    PolicyDocument?: PolicyDocument;
  }>
): EntityPrivescResult[] {
  const results: EntityPrivescResult[] = [];

  for (const policy of managedPolicies) {
    const defaultVersion = policy.PolicyVersionList?.find(
      (v) => v.VersionId === policy.DefaultVersionId
    );
    const document = defaultVersion?.Document || null;
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

