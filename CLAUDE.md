# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AWS IAM Viewer is a Next.js 15 client-side application that allows users to upload and analyze AWS IAM `account-authorization-details.json` files. All processing happens locally in the browser - no data is sent to external servers. The app uses IndexedDB for client-side storage and ReactFlow for graph visualizations.

## Development Commands


All commands should be run from the `aws-iam-viewer/` subdirectory:

```bash
cd aws-iam-viewer

# Development
npm run dev              # Start dev server with Turbopack on http://localhost:3000
npm run build           # Build for production (outputs to standalone)
npm run start           # Start production server
npm run lint            # Run ESLint

# Docker (run from repository root)
cd ..
docker compose up --build  # Build and run containerized app on port 3000
```

## Architecture

### Data Flow

1. **Upload & Processing** (src/app/page.tsx):
   - User uploads `account-authorization-details.json` file
   - File is parsed and processed by `processAuthDetails()` in `src/lib/iam-utils.ts`
   - Raw AWS IAM data is transformed into normalized format (users, roles, policies, groups keyed by ID)
   - Processed data is stored in IndexedDB via `indexedDBService`

2. **Client-Side Storage** (src/lib/indexeddb.ts):
   - Uses IndexedDB with three object stores:
     - `uploads`: Full IAM data for each upload
     - `metadata`: Quick access to upload info (name, size, date)
     - `currentUpload`: Tracks which upload is currently active
   - Singleton service pattern (`indexedDBService`)
   - Each upload gets a unique UUID identifier

3. **Data Access Pattern**:
   - Pages fetch current upload ID from IndexedDB
   - Load full upload data using the ID
   - Extract specific entities (users/roles/policies/groups) from the loaded data
   - All pages follow this pattern: check for data → redirect to home if missing → display entity details

### Key Libraries & Utilities

**src/lib/iam-utils.ts** - Core IAM analysis functions:
- `processAuthDetails()`: Transforms raw AWS IAM JSON into normalized structure
- `findAssumableRoles()`: Determines which roles a user can assume
- `findAssumableRolesForRole()`: Determines which roles a role can assume
- `findRoleAssumptionChain()`: Recursively finds all roles in assumption chain (upstream + downstream)
- `findAttachedEntities()`: Given a policy ARN, finds all users/roles/groups attached to it
- `findGroupUsers()`: Finds all users that belong to a specific group
- Formatting utilities: `formatDateTime()`, `formatFileSize()`, `truncateArn()`

**src/lib/types.ts** - TypeScript interfaces:
- `IAMUser`, `IAMRole`, `IAMPolicy`, `IAMGroup`: Core IAM entity types
- `ProcessedIAMData`: Normalized structure with entities keyed by ID
- `RawIAMData`: Raw AWS API response format
- `UploadMetadata`: Upload tracking information

### Routing Structure

Next.js App Router with client-side pages:

- `/` - Home page with file upload
- `/dashboard` - Overview statistics and entity listings
- `/uploads` - Manage multiple uploads (switch between/delete)
- `/user/[userId]` - User details with attached policies, groups, assumable roles
- `/role/[roleId]` - Role details with trust policy, attached policies, assumption chains
- `/policy/[policyId]` - Policy document viewer with attached entities
- `/group/[groupId]` - Group details with members and attached policies
- `/graph` - Interactive ReactFlow visualization of IAM relationships

### Graph Visualization

The `/graph` page uses ReactFlow with Dagre layout for an interactive network diagram:

**Node Types & Sizing:**
- Users (blue), Groups (green), Roles (orange), Policies (red)
- Node size scales with importance (number of connections/attachments)
- Larger nodes = more privileged/connected entities

**Edge Types:**
- Policy Attachments: Red solid lines (→)
- Group Memberships: Green solid lines (→)
- Role Assumptions: Purple solid lines (→)
- All edges use `smoothstep` type for clean routing

**Features:**
- **Automatic Layout**: Dagre hierarchical layout (left-to-right flow)
- **Relationship Filters**: Toggle visibility of policy attachments, group memberships, role assumptions
- **AWS Policy Filter**: Hide AWS managed policies (arn:aws:iam::aws:policy/*)
- **Path Highlighting**: Click nodes to highlight connected edges
- **Edge Hover**: Hover over edges to see relationship type in top-left panel
- **Enhanced Minimap**: Highlights filtered/selected nodes in different colors
- **Auto-fit View**: Automatically centers and zooms when filters change
- **Entity Search**: Search and filter by specific users/roles/policies/groups

**Layout Algorithm:**
Uses Dagre with settings: rankdir=LR, ranksep=150, nodesep=100, edgesep=50

### UI Components

Built with shadcn/ui (Radix UI + Tailwind CSS):
- Located in `src/components/ui/`
- Custom components: `copy-field.tsx`, `json-viewer.tsx`
- Theme support via `next-themes` (light/dark mode)
- Uses Tailwind CSS v4 with Tailwind Animate

### Docker Configuration

Multi-stage build:
1. `deps`: Install dependencies
2. `builder`: Build Next.js app with standalone output
3. `runner`: Production image with minimal footprint

Next.js standalone output is enabled in `next.config.ts` for optimized Docker builds.

## Important Implementation Notes

### Data Normalization
The raw AWS IAM data uses arrays (`UserDetailList`, `RoleDetailList`, etc.). The `processAuthDetails()` function converts these to objects keyed by entity ID for O(1) lookup performance. Always use the processed format when working with the data in components.

### Entity Relationships
- Users → Groups (GroupList array on user)
- Users/Roles/Groups → Managed Policies (AttachedManagedPolicies array)
- Users/Roles/Groups → Inline Policies (UserPolicyList/RolePolicyList/GroupPolicyList)
- Roles → Trust Policies (AssumeRolePolicyDocument with Principal.AWS)
- Roles → Assumable Roles (determined by parsing trust policies)

### Role Assumption Logic
Role assumption is determined by the `AssumeRolePolicyDocument.Statement` where:
- `Effect: "Allow"`****
- `Principal.AWS` contains the user/role ARN (or "*" for any)

The `findRoleAssumptionChain()` function traverses both upstream (who can assume this role) and downstream (what this role can assume) to build a complete chain.

### Client-Side Only
This app has NO backend. All file processing, data storage (IndexedDB), and analysis happens in the browser. The Next.js app is purely for serving static assets and client-side hydration.

## Testing with Sample Data

Sample IAM data from [iam-vulnerable](https://github.com/BishopFox/iam-vulnerable) is available at:
```
sample_data/iam-vulnerable.json
```

Use this file for testing when you don't have real AWS IAM data.

## Path Aliases

TypeScript paths are configured:
- `@/*` maps to `src/*`
- Always use absolute imports with `@/` prefix in source files
