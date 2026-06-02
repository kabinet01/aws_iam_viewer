'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { useRouter } from 'next/navigation';
import ReactFlow, {
  addEdge,
  ConnectionMode,
  Controls,
  Edge,
  MarkerType,
  MiniMap,
  Node,
  Panel,
  Position,
  ReactFlowInstance,
  useEdgesState,
  useNodesState,
} from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ClickableTableRow } from '@/components/clickable-table-row';
import { JSONViewer } from '@/components/ui/json-viewer';
import { Input } from '@/components/ui/input';
import { ProcessedIAMData, IAMUser, IAMRole, IAMPolicy, IAMGroup } from '@/lib/types';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ExternalLink,
  FileText,
  Filter,
  Network,
  RotateCcw,
  Search,
  Shield,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  formatDateTime,
  findAttachedEntities,
  findAssumableRoles,
  findAssumableRolesForRole,
  findRoleAssumptionChain,
} from '@/lib/iam-utils';
import { indexedDBService } from '@/lib/indexeddb';
import { analyzePolicyForPrivesc, CATEGORY_LABELS } from '@/lib/privesc';
import { getDefaultPolicyDocument } from '@/lib/analysis';

const AWS_MANAGED_POLICY_PREFIX = 'arn:aws:iam::aws:policy/';

const nodeTypes = {
  user: { color: '#3B82F6', bgColor: '#DBEAFE' },
  group: { color: '#10B981', bgColor: '#D1FAE5' },
  role: { color: '#F59E0B', bgColor: '#FEF3C7' },
  policy: { color: '#EF4444', bgColor: '#FEE2E2' },
} as const;

type SelectedNodeType =
  | {
      type: 'user' | 'group' | 'role' | 'policy';
      data: IAMUser | IAMGroup | IAMRole | IAMPolicy;
    }
  | null;

type FilterTab = 'users' | 'groups' | 'roles' | 'policies';
type GraphLoadState = 'loading' | 'ready' | 'missingUpload' | 'missingData' | 'error';

type RelationshipFilters = {
  policyAttachments: boolean;
  groupMemberships: boolean;
  roleAssumptions: boolean;
};

type GraphState = {
  data: ProcessedIAMData | null;
  currentUploadName: string | null;
  loadState: GraphLoadState;
  selectedNode: SelectedNodeType;
  isModalOpen: boolean;
  selectedFilters: string[];
  isFilterOpen: boolean;
  searchQuery: string;
  activeTab: FilterTab;
  relationshipFilters: RelationshipFilters;
  hideAWSPolicies: boolean;
  highlightedEdges: string[];
  hoveredEdge: string | null;
};

type GraphAction =
  | { type: 'set_loaded'; data: ProcessedIAMData; currentUploadName: string }
  | { type: 'set_load_state'; loadState: GraphLoadState }
  | { type: 'set_selected_node'; selectedNode: SelectedNodeType }
  | { type: 'set_modal_open'; isModalOpen: boolean }
  | { type: 'set_selected_filters'; selectedFilters: string[] }
  | { type: 'set_filter_open'; isFilterOpen: boolean }
  | { type: 'set_search_query'; searchQuery: string }
  | { type: 'set_active_tab'; activeTab: FilterTab }
  | { type: 'set_relationship_filters'; relationshipFilters: RelationshipFilters }
  | { type: 'set_hide_aws_policies'; hideAWSPolicies: boolean }
  | { type: 'set_highlighted_edges'; highlightedEdges: string[] }
  | { type: 'set_hovered_edge'; hoveredEdge: string | null }
  | { type: 'clear_highlights' };

const initialGraphState: GraphState = {
  data: null,
  currentUploadName: null,
  loadState: 'loading',
  selectedNode: null,
  isModalOpen: false,
  selectedFilters: [],
  isFilterOpen: false,
  searchQuery: '',
  activeTab: 'users',
  relationshipFilters: {
    policyAttachments: true,
    groupMemberships: true,
    roleAssumptions: true,
  },
  hideAWSPolicies: false,
  highlightedEdges: [],
  hoveredEdge: null,
};

function graphReducer(state: GraphState, action: GraphAction): GraphState {
  switch (action.type) {
    case 'set_loaded':
      return {
        ...state,
        data: action.data,
        currentUploadName: action.currentUploadName,
        loadState: 'ready',
      };
    case 'set_load_state':
      return {
        ...state,
        data: action.loadState === 'ready' ? state.data : null,
        currentUploadName: action.loadState === 'ready' ? state.currentUploadName : null,
        loadState: action.loadState,
      };
    case 'set_selected_node':
      return { ...state, selectedNode: action.selectedNode };
    case 'set_modal_open':
      return { ...state, isModalOpen: action.isModalOpen };
    case 'set_selected_filters':
      return { ...state, selectedFilters: action.selectedFilters };
    case 'set_filter_open':
      return { ...state, isFilterOpen: action.isFilterOpen };
    case 'set_search_query':
      return { ...state, searchQuery: action.searchQuery };
    case 'set_active_tab':
      return { ...state, activeTab: action.activeTab };
    case 'set_relationship_filters':
      return { ...state, relationshipFilters: action.relationshipFilters };
    case 'set_hide_aws_policies':
      return { ...state, hideAWSPolicies: action.hideAWSPolicies };
    case 'set_highlighted_edges':
      return { ...state, highlightedEdges: action.highlightedEdges };
    case 'set_hovered_edge':
      return { ...state, hoveredEdge: action.hoveredEdge };
    case 'clear_highlights':
      return { ...state, highlightedEdges: [], isModalOpen: false };
    default:
      return state;
  }
}

type EntityCollection = {
  users: IAMUser[];
  groups: IAMGroup[];
  roles: IAMRole[];
  policies: IAMPolicy[];
};

function filterEntitiesBySearch<T extends IAMUser | IAMGroup | IAMRole | IAMPolicy>(entities: T[], searchQuery: string): T[] {
  const query = searchQuery.trim().toLowerCase();
  if (!query) return entities;

  return entities.filter((entity) => {
    const name =
      ('UserName' in entity && entity.UserName) ||
      ('GroupName' in entity && entity.GroupName) ||
      ('RoleName' in entity && entity.RoleName) ||
      ('PolicyName' in entity && entity.PolicyName) ||
      '';
    return name.toLowerCase().includes(query);
  });
}

function calculateNodeImportance(
  entity: IAMUser | IAMRole | IAMPolicy | IAMGroup,
  type: 'user' | 'group' | 'role' | 'policy'
): number {
  if (type === 'user') {
    return (entity as IAMUser).AttachedManagedPolicies.length + (entity as IAMUser).GroupList.length;
  }
  if (type === 'role') {
    return (entity as IAMRole).AttachedManagedPolicies.length;
  }
  if (type === 'policy') {
    return (entity as IAMPolicy).AttachmentCount;
  }
  return (entity as IAMGroup).AttachedManagedPolicies.length;
}

function getLayoutedElements(nodes: Node[], edges: Edge[], direction = 'LR') {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: direction,
    ranksep: 150,
    nodesep: 100,
    edgesep: 50,
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: node.style?.width || 300,
      height: node.style?.height || 60,
    });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  return {
    nodes: nodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      return {
        ...node,
        position: {
          x: nodeWithPosition.x - ((node.style?.width as number) || 300) / 2,
          y: nodeWithPosition.y - ((node.style?.height as number) || 60) / 2,
        },
      };
    }),
    edges,
  };
}

function getNodeLabel(name: string, isRisky = false) {
  return (
    <div className="flex items-center justify-center p-2 h-full w-full relative">
      <span className="text-xs font-medium text-center leading-tight break-words max-w-full overflow-hidden">{name}</span>
      {isRisky && (
        <span className="absolute -top-1 -right-1 flex size-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full size-3 bg-red-500" />
        </span>
      )}
    </div>
  );
}

function buildPolicyIdByArn(data: ProcessedIAMData | null) {
  if (!data) return new Map<string, string>();
  return new Map(Object.values(data.policies).map((policy) => [policy.Arn, policy.PolicyId]));
}

function buildPolicyRiskMap(data: ProcessedIAMData | null) {
  if (!data) return {};

  const riskMap: Record<string, number> = {};
  for (const policy of Object.values(data.policies)) {
    if (policy.Arn.startsWith(AWS_MANAGED_POLICY_PREFIX)) continue;
    const document = getDefaultPolicyDocument(policy);
    if (!document) continue;

    const matches = analyzePolicyForPrivesc(document);
    if (matches.length > 0) {
      riskMap[policy.PolicyId] = matches.length;
    }
  }
  return riskMap;
}

function getRelatedEntities(iamData: ProcessedIAMData, filterType: string, filterEntityId: string): EntityCollection {
  const relatedUsers: IAMUser[] = [];
  const relatedGroups: IAMGroup[] = [];
  const relatedRoles: IAMRole[] = [];
  const relatedPolicies: IAMPolicy[] = [];

  const groupsByName = new Map(Object.values(iamData.groups).map((group) => [group.GroupName, group]));
  const policiesByArn = new Map(Object.values(iamData.policies).map((policy) => [policy.Arn, policy]));

  if (filterType === 'user') {
    const selectedUser = iamData.users[filterEntityId];
    if (selectedUser) {
      relatedUsers.push(selectedUser);

      selectedUser.GroupList.forEach((groupName) => {
        const group = groupsByName.get(groupName);
        if (group && !relatedGroups.some((candidate) => candidate.GroupId === group.GroupId)) {
          relatedGroups.push(group);
        }
      });

      selectedUser.AttachedManagedPolicies.forEach((policy) => {
        const policyObj = policiesByArn.get(policy.PolicyArn);
        if (policyObj && !relatedPolicies.some((candidate) => candidate.PolicyId === policyObj.PolicyId)) {
          relatedPolicies.push(policyObj);
        }
      });

      relatedGroups.forEach((group) => {
        group.AttachedManagedPolicies.forEach((policy) => {
          const policyObj = policiesByArn.get(policy.PolicyArn);
          if (policyObj && !relatedPolicies.some((candidate) => candidate.PolicyId === policyObj.PolicyId)) {
            relatedPolicies.push(policyObj);
          }
        });
      });

      const assumableRoles = findAssumableRoles(selectedUser, iamData.roles);
      assumableRoles.forEach((role) => {
        if (!relatedRoles.some((candidate) => candidate.RoleId === role.RoleId)) {
          relatedRoles.push(role);
        }

        role.AttachedManagedPolicies.forEach((policy) => {
          const policyObj = policiesByArn.get(policy.PolicyArn);
          if (policyObj && !relatedPolicies.some((candidate) => candidate.PolicyId === policyObj.PolicyId)) {
            relatedPolicies.push(policyObj);
          }
        });
      });
    }
  } else if (filterType === 'group') {
    const selectedGroup = iamData.groups[filterEntityId];
    if (selectedGroup) {
      relatedGroups.push(selectedGroup);

      Object.values(iamData.users).forEach((user) => {
        if (user.GroupList.includes(selectedGroup.GroupName)) {
          relatedUsers.push(user);
        }
      });

      selectedGroup.AttachedManagedPolicies.forEach((policy) => {
        const policyObj = policiesByArn.get(policy.PolicyArn);
        if (policyObj && !relatedPolicies.some((candidate) => candidate.PolicyId === policyObj.PolicyId)) {
          relatedPolicies.push(policyObj);
        }
      });
    }
  } else if (filterType === 'role') {
    const selectedRole = iamData.roles[filterEntityId];
    if (selectedRole) {
      const chainRoles = findRoleAssumptionChain(selectedRole, iamData.roles);

      chainRoles.forEach((role) => {
        if (!relatedRoles.some((candidate) => candidate.RoleId === role.RoleId)) {
          relatedRoles.push(role);
        }

        role.AttachedManagedPolicies.forEach((policy) => {
          const policyObj = policiesByArn.get(policy.PolicyArn);
          if (policyObj && !relatedPolicies.some((candidate) => candidate.PolicyId === policyObj.PolicyId)) {
            relatedPolicies.push(policyObj);
          }
        });
      });

      Object.values(iamData.users).forEach((user) => {
        const assumableRoles = findAssumableRoles(user, iamData.roles);
        const canReachChain = assumableRoles.some((role) => chainRoles.some((chainRole) => chainRole.RoleId === role.RoleId));
        if (!canReachChain) return;

        if (!relatedUsers.some((candidate) => candidate.UserId === user.UserId)) {
          relatedUsers.push(user);
        }

        user.AttachedManagedPolicies.forEach((policy) => {
          const policyObj = policiesByArn.get(policy.PolicyArn);
          if (policyObj && !relatedPolicies.some((candidate) => candidate.PolicyId === policyObj.PolicyId)) {
            relatedPolicies.push(policyObj);
          }
        });

        user.GroupList.forEach((groupName) => {
          const group = groupsByName.get(groupName);
          if (group && !relatedGroups.some((candidate) => candidate.GroupId === group.GroupId)) {
            relatedGroups.push(group);

            group.AttachedManagedPolicies.forEach((policy) => {
              const policyObj = policiesByArn.get(policy.PolicyArn);
              if (policyObj && !relatedPolicies.some((candidate) => candidate.PolicyId === policyObj.PolicyId)) {
                relatedPolicies.push(policyObj);
              }
            });
          }
        });
      });
    }
  } else if (filterType === 'policy') {
    const selectedPolicy = iamData.policies[filterEntityId];
    if (selectedPolicy) {
      relatedPolicies.push(selectedPolicy);
      const attachedEntities = findAttachedEntities(selectedPolicy.Arn, iamData);
      relatedUsers.push(...attachedEntities.users);
      relatedGroups.push(...attachedEntities.groups);
      relatedRoles.push(...attachedEntities.roles);
    }
  }

  return {
    users: relatedUsers,
    groups: relatedGroups,
    roles: relatedRoles,
    policies: relatedPolicies,
  };
}

function buildGraphData(args: {
  data: ProcessedIAMData;
  selectedFilters: string[];
  relationshipFilters: RelationshipFilters;
  hideAWSPolicies: boolean;
  highlightedEdges: string[];
  policyRiskMap: Record<string, number>;
}) {
  const { data, selectedFilters, relationshipFilters, hideAWSPolicies, highlightedEdges, policyRiskMap } = args;
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  let usersToShow = Object.values(data.users);
  let groupsToShow = Object.values(data.groups);
  let rolesToShow = Object.values(data.roles);
  let policiesToShow = Object.values(data.policies);

  if (hideAWSPolicies) {
    policiesToShow = policiesToShow.filter((policy) => !policy.Arn.startsWith(AWS_MANAGED_POLICY_PREFIX));
  }

  if (selectedFilters.length > 0) {
    const allRelatedUsers = new Set<IAMUser>();
    const allRelatedGroups = new Set<IAMGroup>();
    const allRelatedRoles = new Set<IAMRole>();
    const allRelatedPolicies = new Set<IAMPolicy>();

    selectedFilters.forEach((filter) => {
      const [filterType, filterEntityId] = filter.split('-', 2);
      const relatedEntities = getRelatedEntities(data, filterType, filterEntityId);
      relatedEntities.users.forEach((user) => allRelatedUsers.add(user));
      relatedEntities.groups.forEach((group) => allRelatedGroups.add(group));
      relatedEntities.roles.forEach((role) => allRelatedRoles.add(role));
      relatedEntities.policies.forEach((policy) => allRelatedPolicies.add(policy));
    });

    usersToShow = Array.from(allRelatedUsers);
    groupsToShow = Array.from(allRelatedGroups);
    rolesToShow = Array.from(allRelatedRoles);
    policiesToShow = Array.from(allRelatedPolicies);

    if (hideAWSPolicies) {
      policiesToShow = policiesToShow.filter((policy) => !policy.Arn.startsWith(AWS_MANAGED_POLICY_PREFIX));
    }
  }

  const groupByName = new Map(groupsToShow.map((group) => [group.GroupName, group]));
  const policyByArn = new Map(policiesToShow.map((policy) => [policy.Arn, policy]));
  const highlightedEdgeSet = new Set(highlightedEdges);

  usersToShow.forEach((user) => {
    const importance = calculateNodeImportance(user, 'user');
    nodes.push({
      id: `user-${user.UserId}`,
      type: 'default',
      position: { x: 0, y: 0 },
      data: { label: getNodeLabel(user.UserName) },
      style: {
        background: nodeTypes.user.bgColor,
        border: `2px solid ${nodeTypes.user.color}`,
        borderRadius: '6px',
        width: 250 + Math.min(importance * 10, 100),
        height: 60 + Math.min(importance * 5, 40),
        fontSize: '12px',
        cursor: 'pointer',
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      draggable: true,
      selectable: true,
    });
  });

  groupsToShow.forEach((group) => {
    const importance = calculateNodeImportance(group, 'group');
    nodes.push({
      id: `group-${group.GroupId}`,
      type: 'default',
      position: { x: 0, y: 0 },
      data: { label: getNodeLabel(group.GroupName) },
      style: {
        background: nodeTypes.group.bgColor,
        border: `2px solid ${nodeTypes.group.color}`,
        borderRadius: '6px',
        width: 250 + Math.min(importance * 10, 100),
        height: 60 + Math.min(importance * 5, 40),
        fontSize: '12px',
        cursor: 'pointer',
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });
  });

  rolesToShow.forEach((role) => {
    const importance = calculateNodeImportance(role, 'role');
    nodes.push({
      id: `role-${role.RoleId}`,
      type: 'default',
      position: { x: 0, y: 0 },
      data: { label: getNodeLabel(role.RoleName) },
      style: {
        background: nodeTypes.role.bgColor,
        border: `2px solid ${nodeTypes.role.color}`,
        borderRadius: '6px',
        width: 250 + Math.min(importance * 10, 100),
        height: 60 + Math.min(importance * 5, 40),
        fontSize: '12px',
        cursor: 'pointer',
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });
  });

  policiesToShow.forEach((policy) => {
    const importance = calculateNodeImportance(policy, 'policy');
    const isRisky = (policyRiskMap[policy.PolicyId] || 0) > 0;
    nodes.push({
      id: `policy-${policy.PolicyId}`,
      type: 'default',
      position: { x: 0, y: 0 },
      data: { label: getNodeLabel(policy.PolicyName, isRisky) },
      style: {
        background: isRisky ? '#FEE2E2' : nodeTypes.policy.bgColor,
        border: isRisky ? '2px solid #DC2626' : `2px solid ${nodeTypes.policy.color}`,
        borderRadius: '6px',
        width: 280 + Math.min(importance * 8, 120),
        height: 60 + Math.min(importance * 3, 40),
        fontSize: '12px',
        cursor: 'pointer',
        boxShadow: isRisky ? '0 0 8px rgba(220, 38, 38, 0.4)' : undefined,
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });
  });

  if (relationshipFilters.groupMemberships) {
    usersToShow.forEach((user) => {
      user.GroupList.forEach((groupName) => {
        const group = groupByName.get(groupName);
        if (!group) return;

        const edgeId = `user-${user.UserId}-group-${group.GroupId}`;
        const isHighlighted = highlightedEdgeSet.has(edgeId);
        edges.push({
          id: edgeId,
          source: `user-${user.UserId}`,
          target: `group-${group.GroupId}`,
          type: 'smoothstep',
          animated: false,
          style: {
            stroke: isHighlighted ? '#FF6B6B' : '#10B981',
            strokeWidth: isHighlighted ? 2.5 : 1.5,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: isHighlighted ? '#FF6B6B' : '#10B981',
            width: 16,
            height: 16,
          },
          data: { label: 'member of', type: 'groupMembership' },
        });
      });
    });
  }

  if (relationshipFilters.policyAttachments) {
    const addPolicyEdge = (prefix: string, ownerId: string, policyArn: string) => {
      const policy = policyByArn.get(policyArn);
      if (!policy) return;

      const edgeId = `${prefix}-${ownerId}-policy-${policy.PolicyId}`;
      const isHighlighted = highlightedEdgeSet.has(edgeId);
      edges.push({
        id: edgeId,
        source: `${prefix}-${ownerId}`,
        target: `policy-${policy.PolicyId}`,
        type: 'smoothstep',
        animated: false,
        style: {
          stroke: isHighlighted ? '#FF6B6B' : '#EF4444',
          strokeWidth: isHighlighted ? 2.5 : 1.5,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isHighlighted ? '#FF6B6B' : '#EF4444',
          width: 16,
          height: 16,
        },
        data: { label: 'attached to', type: 'policyAttachment' },
      });
    };

    usersToShow.forEach((user) => {
      user.AttachedManagedPolicies.forEach((policy) => addPolicyEdge('user', user.UserId, policy.PolicyArn));
    });
    groupsToShow.forEach((group) => {
      group.AttachedManagedPolicies.forEach((policy) => addPolicyEdge('group', group.GroupId, policy.PolicyArn));
    });
    rolesToShow.forEach((role) => {
      role.AttachedManagedPolicies.forEach((policy) => addPolicyEdge('role', role.RoleId, policy.PolicyArn));
    });
  }

  if (relationshipFilters.roleAssumptions) {
    const graphRolesById = Object.fromEntries(rolesToShow.map((role) => [role.RoleId, role]));

    usersToShow.forEach((user) => {
      const assumableRoles = findAssumableRoles(user, graphRolesById);
      assumableRoles.forEach((role) => {
        const edgeId = `user-${user.UserId}-assume-role-${role.RoleId}`;
        const isHighlighted = highlightedEdgeSet.has(edgeId);
        edges.push({
          id: edgeId,
          source: `user-${user.UserId}`,
          target: `role-${role.RoleId}`,
          type: 'smoothstep',
          animated: false,
          style: {
            stroke: isHighlighted ? '#FF6B6B' : '#8B5CF6',
            strokeWidth: isHighlighted ? 2.5 : 1.5,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: isHighlighted ? '#FF6B6B' : '#8B5CF6',
            width: 16,
            height: 16,
          },
          data: { label: 'can assume', type: 'roleAssumption' },
        });
      });
    });

    rolesToShow.forEach((role) => {
      const assumableRoles = findAssumableRolesForRole(role, graphRolesById);
      assumableRoles.forEach((targetRole) => {
        const edgeId = `role-${role.RoleId}-assume-role-${targetRole.RoleId}`;
        const isHighlighted = highlightedEdgeSet.has(edgeId);
        edges.push({
          id: edgeId,
          source: `role-${role.RoleId}`,
          target: `role-${targetRole.RoleId}`,
          type: 'smoothstep',
          animated: false,
          style: {
            stroke: isHighlighted ? '#FF6B6B' : '#8B5CF6',
            strokeWidth: isHighlighted ? 2.5 : 1.5,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: isHighlighted ? '#FF6B6B' : '#8B5CF6',
            width: 16,
            height: 16,
          },
          data: { label: 'can assume', type: 'roleAssumption' },
        });
      });
    });
  }

  return getLayoutedElements(nodes, edges);
}

function getSelectedNodeName(selectedNode: SelectedNodeType) {
  if (!selectedNode) return '';
  if (selectedNode.type === 'user') return (selectedNode.data as IAMUser).UserName;
  if (selectedNode.type === 'group') return (selectedNode.data as IAMGroup).GroupName;
  if (selectedNode.type === 'role') return (selectedNode.data as IAMRole).RoleName;
  return (selectedNode.data as IAMPolicy).PolicyName;
}

function getSelectedNodeHref(selectedNode: SelectedNodeType) {
  if (!selectedNode) return '';
  if (selectedNode.type === 'user') return `/user/${(selectedNode.data as IAMUser).UserId}`;
  if (selectedNode.type === 'group') return `/group/${(selectedNode.data as IAMGroup).GroupId}`;
  if (selectedNode.type === 'role') return `/role/${(selectedNode.data as IAMRole).RoleId}`;
  return `/policy/${(selectedNode.data as IAMPolicy).PolicyId}`;
}

function useGraphPageState() {
  const [state, dispatch] = useReducer(graphReducer, initialGraphState);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);

  const {
    data,
    loadState,
    selectedFilters,
    isFilterOpen,
    searchQuery,
    relationshipFilters,
    hideAWSPolicies,
    highlightedEdges,
  } = state;

  const policyIdByArn = useMemo(() => buildPolicyIdByArn(data), [data]);
  const policyRiskMap = useMemo(() => buildPolicyRiskMap(data), [data]);

  const filteredEntitiesByTab = useMemo(() => {
    if (!data) {
      return {
        users: [] as IAMUser[],
        groups: [] as IAMGroup[],
        roles: [] as IAMRole[],
        policies: [] as IAMPolicy[],
      };
    }

    const policies = hideAWSPolicies
      ? Object.values(data.policies).filter((policy) => !policy.Arn.startsWith(AWS_MANAGED_POLICY_PREFIX))
      : Object.values(data.policies);

    return {
      users: filterEntitiesBySearch(Object.values(data.users), searchQuery),
      groups: filterEntitiesBySearch(Object.values(data.groups), searchQuery),
      roles: filterEntitiesBySearch(Object.values(data.roles), searchQuery),
      policies: filterEntitiesBySearch(policies, searchQuery),
    };
  }, [data, hideAWSPolicies, searchQuery]);

  const entityCounts = useMemo(() => {
    if (!data) return { users: 0, groups: 0, roles: 0, policies: 0 };
    return {
      users: Object.keys(data.users).length,
      groups: Object.keys(data.groups).length,
      roles: Object.keys(data.roles).length,
      policies: hideAWSPolicies
        ? Object.values(data.policies).filter((policy) => !policy.Arn.startsWith(AWS_MANAGED_POLICY_PREFIX)).length
        : Object.keys(data.policies).length,
    };
  }, [data, hideAWSPolicies]);

  const onConnect = useCallback(
    (params: Parameters<typeof addEdge>[0]) => setEdges((currentEdges) => addEdge(params, currentEdges)),
    [setEdges]
  );

  const onInit = useCallback((instance: ReactFlowInstance) => {
    reactFlowInstanceRef.current = instance;
  }, []);

  const onEdgeMouseEnter = useCallback((_event: React.MouseEvent, edge: Edge) => {
    dispatch({ type: 'set_hovered_edge', hoveredEdge: edge.id });
  }, []);

  const onEdgeMouseLeave = useCallback(() => {
    dispatch({ type: 'set_hovered_edge', hoveredEdge: null });
  }, []);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (!data) return;

      const connectedEdgeIds: string[] = [];
      for (const edge of edges) {
        if (edge.source === node.id || edge.target === node.id) {
          connectedEdgeIds.push(edge.id);
        }
      }
      dispatch({ type: 'set_highlighted_edges', highlightedEdges: connectedEdgeIds });

      const [nodeType, entityId] = node.id.split('-', 2);
      let nextSelectedNode: SelectedNodeType = null;

      if (nodeType === 'user' && data.users[entityId]) {
        nextSelectedNode = { type: 'user', data: data.users[entityId] };
      } else if (nodeType === 'group' && data.groups[entityId]) {
        nextSelectedNode = { type: 'group', data: data.groups[entityId] };
      } else if (nodeType === 'role' && data.roles[entityId]) {
        nextSelectedNode = { type: 'role', data: data.roles[entityId] };
      } else if (nodeType === 'policy' && data.policies[entityId]) {
        nextSelectedNode = { type: 'policy', data: data.policies[entityId] };
      }

      if (nextSelectedNode) {
        dispatch({ type: 'set_selected_node', selectedNode: nextSelectedNode });
        dispatch({ type: 'set_modal_open', isModalOpen: true });
      }
    },
    [data, edges]
  );

  useEffect(() => {
    let cancelled = false;

    const loadCurrentUpload = async () => {
      try {
        const currentUploadId = await indexedDBService.getCurrentUploadId();
        if (cancelled) return;
        if (!currentUploadId) {
          dispatch({ type: 'set_load_state', loadState: 'missingUpload' });
          return;
        }

        const upload = await indexedDBService.getUpload(currentUploadId);
        if (cancelled) return;
        if (!upload) {
          dispatch({ type: 'set_load_state', loadState: 'missingData' });
          return;
        }

        dispatch({
          type: 'set_loaded',
          data: upload.data,
          currentUploadName: upload.name,
        });
      } catch (error) {
        console.error('Failed to load current upload:', error);
        if (!cancelled) {
          dispatch({ type: 'set_load_state', loadState: 'error' });
        }
      }
    };

    void loadCurrentUpload();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!data || loadState !== 'ready') return;
    const layouted = buildGraphData({
      data,
      selectedFilters,
      relationshipFilters,
      hideAWSPolicies,
      highlightedEdges,
      policyRiskMap,
    });
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
  }, [data, highlightedEdges, hideAWSPolicies, loadState, policyRiskMap, relationshipFilters, selectedFilters, setEdges, setNodes]);

  useEffect(() => {
    if (loadState !== 'ready') return;
    const timer = setTimeout(() => {
      reactFlowInstanceRef.current?.fitView({ padding: 0.2, duration: 800 });
    }, 100);
    return () => clearTimeout(timer);
  }, [loadState, nodes.length, edges.length]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedFilters.length > 0) {
        dispatch({ type: 'set_selected_filters', selectedFilters: [] });
      }

      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault();
        dispatch({ type: 'set_filter_open', isFilterOpen: true });
        setTimeout(() => {
          if (searchInputRef.current) {
            searchInputRef.current.focus();
            searchInputRef.current.select();
            return;
          }

          const searchInput = document.querySelector('input[placeholder*="Search entities"]') as HTMLInputElement | null;
          if (searchInput) {
            searchInput.focus();
            searchInput.select();
          }
        }, 200);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedFilters.length]);

  useEffect(() => {
    if (!isFilterOpen || !searchInputRef.current) return;

    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);

    return () => clearTimeout(timer);
  }, [isFilterOpen]);

  const setModalOpen = useCallback((open: boolean) => {
    dispatch({ type: 'set_modal_open', isModalOpen: open });
  }, []);

  const setSelectedFilters = useCallback((nextFilters: string[]) => {
    dispatch({ type: 'set_selected_filters', selectedFilters: nextFilters });
  }, []);

  const toggleFilterValue = useCallback(
    (value: string) => {
      const nextFilters = selectedFilters.includes(value)
        ? selectedFilters.filter((filter) => filter !== value)
        : [...selectedFilters, value];
      dispatch({ type: 'set_selected_filters', selectedFilters: nextFilters });
    },
    [selectedFilters]
  );

  const clearFilters = useCallback(() => {
    dispatch({ type: 'set_selected_filters', selectedFilters: [] });
  }, []);

  const clearHighlights = useCallback(() => {
    dispatch({ type: 'clear_highlights' });
  }, []);

  const setRelationshipFilters = useCallback((nextFilters: RelationshipFilters) => {
    dispatch({ type: 'set_relationship_filters', relationshipFilters: nextFilters });
  }, []);

  const setFilterOpen = useCallback((open: boolean) => {
    dispatch({ type: 'set_filter_open', isFilterOpen: open });
  }, []);

  const zoomIn = useCallback(() => {
    reactFlowInstanceRef.current?.zoomIn();
  }, []);

  const zoomOut = useCallback(() => {
    reactFlowInstanceRef.current?.zoomOut();
  }, []);

  const fitView = useCallback(() => {
    reactFlowInstanceRef.current?.fitView({ padding: 0.1 });
  }, []);

  return {
    router,
    searchInputRef,
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onInit,
    onNodeClick,
    onEdgeMouseEnter,
    onEdgeMouseLeave,
    state,
    entityCounts,
    filteredEntitiesByTab,
    policyIdByArn,
    setModalOpen,
    setSelectedFilters,
    toggleFilterValue,
    clearFilters,
    clearHighlights,
    setRelationshipFilters,
    setFilterOpen,
    setSearchQuery: (nextSearchQuery: string) => dispatch({ type: 'set_search_query', searchQuery: nextSearchQuery }),
    setActiveTab: (nextTab: FilterTab) => dispatch({ type: 'set_active_tab', activeTab: nextTab }),
    setHideAWSPolicies: (nextValue: boolean) => dispatch({ type: 'set_hide_aws_policies', hideAWSPolicies: nextValue }),
    fitView,
    zoomIn,
    zoomOut,
  };
}

export default function GraphPage() {
  const model = useGraphPageState();
  const {
    router,
    searchInputRef,
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onInit,
    onNodeClick,
    onEdgeMouseEnter,
    onEdgeMouseLeave,
    state,
    entityCounts,
    filteredEntitiesByTab,
    policyIdByArn,
    setModalOpen,
    setSelectedFilters,
    toggleFilterValue,
    clearFilters,
    clearHighlights,
    setRelationshipFilters,
    setFilterOpen,
    setSearchQuery,
    setActiveTab,
    setHideAWSPolicies,
    fitView,
    zoomIn,
    zoomOut,
  } = model;
  const {
    data,
    currentUploadName,
    loadState,
    selectedNode,
    isModalOpen,
    selectedFilters,
    isFilterOpen,
    searchQuery,
    activeTab,
    relationshipFilters,
    hideAWSPolicies,
    highlightedEdges,
    hoveredEdge,
  } = state;

  if (loadState === 'loading') {
    return <GraphLoadingState />;
  }

  if (loadState !== 'ready' || !data || !currentUploadName) {
    return <GraphLoadFailureState loadState={loadState} onUpload={() => router.push('/')} onDashboard={() => router.push('/dashboard')} />;
  }

  return (
    <div className="space-y-6">
      <GraphHeader uploadName={currentUploadName} onBack={() => router.push('/dashboard')} />

      <GraphControlPanel
        data={data}
        entityCounts={entityCounts}
        filteredEntitiesByTab={filteredEntitiesByTab}
        selectedFilters={selectedFilters}
        isFilterOpen={isFilterOpen}
        searchQuery={searchQuery}
        activeTab={activeTab}
        relationshipFilters={relationshipFilters}
        hideAWSPolicies={hideAWSPolicies}
        searchInputRef={searchInputRef}
        onFilterOpenChange={setFilterOpen}
        onSearchQueryChange={setSearchQuery}
        onClearSearch={() => setSearchQuery('')}
        onClearFilters={clearFilters}
        onActiveTabChange={setActiveTab}
        onToggleFilter={toggleFilterValue}
        onSelectFilters={setSelectedFilters}
        onRelationshipFiltersChange={setRelationshipFilters}
        onHideAWSPoliciesChange={setHideAWSPolicies}
        onClearHighlights={clearHighlights}
      />

      <GraphLegend data={data} hideAWSPolicies={hideAWSPolicies} />

      <GraphCanvasCard
        nodes={nodes}
        edges={edges}
        hoveredEdge={hoveredEdge}
        selectedFilters={selectedFilters}
        highlightedEdges={highlightedEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeMouseEnter={onEdgeMouseEnter}
        onEdgeMouseLeave={onEdgeMouseLeave}
        onInit={onInit}
        onResetFilters={clearFilters}
        onFitView={fitView}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
      />

      <GraphStats nodes={nodes} edges={edges} />

      <NodeDetailsDialog
        open={isModalOpen}
        onOpenChange={setModalOpen}
        selectedNode={selectedNode}
        data={data}
        policyIdByArn={policyIdByArn}
        onOpenPage={(href) => router.push(href)}
      />
    </div>
  );
}

function GraphLoadingState() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <Network className="size-12 mx-auto mb-4 text-muted-foreground animate-pulse" />
        <p className="text-muted-foreground">Loading graph…</p>
      </div>
    </div>
  );
}

function GraphLoadFailureState({
  loadState,
  onUpload,
  onDashboard,
}: {
  loadState: GraphLoadState;
  onUpload: () => void;
  onDashboard: () => void;
}) {
  const message =
    loadState === 'missingUpload'
      ? 'Upload IAM authorization details to build the graph.'
      : loadState === 'missingData'
        ? 'The active upload could not be found in local storage.'
        : 'There was a problem loading the current IAM dataset.';

  return (
    <div className="space-y-6">
      <Alert>
        <Network className="size-4" />
        <AlertTitle>Graph data is unavailable</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
      <div className="flex gap-2">
        <Button onClick={onUpload}>Upload IAM Data</Button>
        <Button variant="outline" onClick={onDashboard}>
          Back to Dashboard
        </Button>
      </div>
    </div>
  );
}

function GraphHeader({ uploadName, onBack }: { uploadName: string; onBack: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Network className="size-8" />
          <span>IAM Relationship Graph</span>
        </h1>
        <p className="text-muted-foreground">Interactive visualization of IAM relationships for: {uploadName}</p>
      </div>
      <Button variant="outline" onClick={onBack}>
        Back to Dashboard
      </Button>
    </div>
  );
}

function GraphControlPanel(props: {
  data: ProcessedIAMData;
  entityCounts: Record<FilterTab, number>;
  filteredEntitiesByTab: {
    users: IAMUser[];
    groups: IAMGroup[];
    roles: IAMRole[];
    policies: IAMPolicy[];
  };
  selectedFilters: string[];
  isFilterOpen: boolean;
  searchQuery: string;
  activeTab: FilterTab;
  relationshipFilters: RelationshipFilters;
  hideAWSPolicies: boolean;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onFilterOpenChange: (open: boolean) => void;
  onSearchQueryChange: (value: string) => void;
  onClearSearch: () => void;
  onClearFilters: () => void;
  onActiveTabChange: (tab: FilterTab) => void;
  onToggleFilter: (value: string) => void;
  onSelectFilters: (filters: string[]) => void;
  onRelationshipFiltersChange: (filters: RelationshipFilters) => void;
  onHideAWSPoliciesChange: (value: boolean) => void;
  onClearHighlights: () => void;
}) {
  const {
    data,
    entityCounts,
    filteredEntitiesByTab,
    selectedFilters,
    isFilterOpen,
    searchQuery,
    activeTab,
    relationshipFilters,
    hideAWSPolicies,
    searchInputRef,
    onFilterOpenChange,
    onSearchQueryChange,
    onClearSearch,
    onClearFilters,
    onActiveTabChange,
    onToggleFilter,
    onSelectFilters,
    onRelationshipFiltersChange,
    onHideAWSPoliciesChange,
    onClearHighlights,
  } = props;

  const currentSelectionLabel =
    selectedFilters.length === 0
      ? 'Show all relationships'
      : selectedFilters.length === 1
        ? getEntityNameFromFilterId(data, selectedFilters[0])
        : `${selectedFilters.length} entities selected`;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <EntityFilterControl
            data={data}
            entityCounts={entityCounts}
            filteredEntitiesByTab={filteredEntitiesByTab}
            selectedFilters={selectedFilters}
            currentSelectionLabel={currentSelectionLabel}
            isFilterOpen={isFilterOpen}
            searchQuery={searchQuery}
            activeTab={activeTab}
            searchInputRef={searchInputRef}
            onFilterOpenChange={onFilterOpenChange}
            onSearchQueryChange={onSearchQueryChange}
            onClearSearch={onClearSearch}
            onClearFilters={onClearFilters}
            onActiveTabChange={onActiveTabChange}
            onToggleFilter={onToggleFilter}
            onSelectFilters={onSelectFilters}
          />

          <RelationshipFilterControl
            relationshipFilters={relationshipFilters}
            onChange={onRelationshipFiltersChange}
          />

          <GraphOptionsControl
            hideAWSPolicies={hideAWSPolicies}
            onHideAWSPoliciesChange={onHideAWSPoliciesChange}
            onClearHighlights={onClearHighlights}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function EntityFilterControl(props: {
  data: ProcessedIAMData;
  entityCounts: Record<FilterTab, number>;
  filteredEntitiesByTab: {
    users: IAMUser[];
    groups: IAMGroup[];
    roles: IAMRole[];
    policies: IAMPolicy[];
  };
  selectedFilters: string[];
  currentSelectionLabel: string;
  isFilterOpen: boolean;
  searchQuery: string;
  activeTab: FilterTab;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onFilterOpenChange: (open: boolean) => void;
  onSearchQueryChange: (value: string) => void;
  onClearSearch: () => void;
  onClearFilters: () => void;
  onActiveTabChange: (tab: FilterTab) => void;
  onToggleFilter: (value: string) => void;
  onSelectFilters: (filters: string[]) => void;
}) {
  const {
    entityCounts,
    filteredEntitiesByTab,
    selectedFilters,
    currentSelectionLabel,
    isFilterOpen,
    searchQuery,
    activeTab,
    searchInputRef,
    onFilterOpenChange,
    onSearchQueryChange,
    onClearSearch,
    onClearFilters,
    onActiveTabChange,
    onToggleFilter,
    onSelectFilters,
  } = props;

  return (
    <div className="flex items-center gap-2">
      <Filter className="size-4 flex-shrink-0" />
      <Collapsible open={isFilterOpen} onOpenChange={onFilterOpenChange} className="flex-1">
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-[350px] justify-between">
            <span className="truncate">{currentSelectionLabel}</span>
            <div className="flex items-center gap-2">
              {selectedFilters.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {selectedFilters.length}
                </Badge>
              )}
              <ChevronDown className="size-4" />
            </div>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="absolute z-50 mt-1 w-[500px] bg-background border rounded-md shadow-lg max-h-[600px]">
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1">
                <Search className="size-4 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  placeholder="Search entities… (Ctrl+K)"
                  value={searchQuery}
                  onChange={(event) => onSearchQueryChange(event.target.value)}
                  className="flex-1"
                />
                {searchQuery && (
                  <Button variant="ghost" size="sm" onClick={onClearSearch} className="size-8 p-0">
                    <X className="size-4" />
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {selectedFilters.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={onClearFilters} className="text-red-600" title="Clear all filters (Esc)">
                    <RotateCcw className="size-4 mr-1" />
                    Clear All
                  </Button>
                )}
                <div className="text-xs text-muted-foreground">
                  <div>Ctrl+K: Search</div>
                  <div>Esc: Clear filters</div>
                </div>
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={(value) => onActiveTabChange(value as FilterTab)}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="users" className="flex items-center gap-1">
                  <Users className="size-3" />
                  <span>Users</span>
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {entityCounts.users}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="groups" className="flex items-center gap-1">
                  <UserCheck className="size-3" />
                  <span>Groups</span>
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {entityCounts.groups}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="roles" className="flex items-center gap-1">
                  <Shield className="size-3" />
                  <span>Roles</span>
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {entityCounts.roles}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="policies" className="flex items-center gap-1">
                  <FileText className="size-3" />
                  <span>Policies</span>
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {entityCounts.policies}
                  </Badge>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="users" className="mt-4">
                <EntitySelectionList
                  prefix="user"
                  items={filteredEntitiesByTab.users}
                  selectedFilters={selectedFilters}
                  emptyMessage={searchQuery ? 'No users found matching your search.' : 'No users available.'}
                  getId={(user) => user.UserId}
                  getLabel={(user) => user.UserName}
                  onToggleFilter={onToggleFilter}
                  onSelectFilters={onSelectFilters}
                />
              </TabsContent>
              <TabsContent value="groups" className="mt-4">
                <EntitySelectionList
                  prefix="group"
                  items={filteredEntitiesByTab.groups}
                  selectedFilters={selectedFilters}
                  emptyMessage={searchQuery ? 'No groups found matching your search.' : 'No groups available.'}
                  getId={(group) => group.GroupId}
                  getLabel={(group) => group.GroupName}
                  onToggleFilter={onToggleFilter}
                  onSelectFilters={onSelectFilters}
                />
              </TabsContent>
              <TabsContent value="roles" className="mt-4">
                <EntitySelectionList
                  prefix="role"
                  items={filteredEntitiesByTab.roles}
                  selectedFilters={selectedFilters}
                  emptyMessage={searchQuery ? 'No roles found matching your search.' : 'No roles available.'}
                  getId={(role) => role.RoleId}
                  getLabel={(role) => role.RoleName}
                  onToggleFilter={onToggleFilter}
                  onSelectFilters={onSelectFilters}
                />
              </TabsContent>
              <TabsContent value="policies" className="mt-4">
                <EntitySelectionList
                  prefix="policy"
                  items={filteredEntitiesByTab.policies}
                  selectedFilters={selectedFilters}
                  emptyMessage={searchQuery ? 'No policies found matching your search.' : 'No policies available.'}
                  getId={(policy) => policy.PolicyId}
                  getLabel={(policy) => policy.PolicyName}
                  onToggleFilter={onToggleFilter}
                  onSelectFilters={onSelectFilters}
                />
              </TabsContent>
            </Tabs>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function EntitySelectionList<T>({
  prefix,
  items,
  selectedFilters,
  emptyMessage,
  getId,
  getLabel,
  onToggleFilter,
  onSelectFilters,
}: {
  prefix: 'user' | 'group' | 'role' | 'policy';
  items: T[];
  selectedFilters: string[];
  emptyMessage: string;
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  onToggleFilter: (value: string) => void;
  onSelectFilters: (filters: string[]) => void;
}) {
  const itemValues = items.map((item) => `${prefix}-${getId(item)}`);
  const currentPrefixFilters = selectedFilters.filter((filter) => filter.startsWith(`${prefix}-`));
  const allSelected = itemValues.length > 0 && itemValues.every((value) => selectedFilters.includes(value));

  const handleToggleAll = () => {
    const otherFilters = selectedFilters.filter((filter) => !filter.startsWith(`${prefix}-`));
    onSelectFilters(allSelected ? otherFilters : [...otherFilters, ...itemValues]);
  };

  return (
    <div className="space-y-1 max-h-[400px] overflow-y-auto">
      <div className="flex items-center justify-between pb-2 border-b">
        <span className="text-sm font-medium">{items.length} {prefix}{items.length === 1 ? '' : 's'}</span>
        {items.length > 0 && (
          <Button variant="ghost" size="sm" onClick={handleToggleAll} className="text-xs">
            {allSelected && currentPrefixFilters.length === itemValues.length ? 'Deselect All' : 'Select All'}
          </Button>
        )}
      </div>

      {items.map((item) => {
        const value = `${prefix}-${getId(item)}`;
        const isSelected = selectedFilters.includes(value);

        return (
          <Button
            key={value}
            variant="ghost"
            size="sm"
            onClick={() => onToggleFilter(value)}
            className="w-full justify-start"
          >
            <div className="flex items-center gap-2 w-full">
              <div className="size-4 flex items-center justify-center">
                {isSelected && <Check className="size-3" />}
              </div>
              <span className="truncate">{getLabel(item)}</span>
            </div>
          </Button>
        );
      })}

      {items.length === 0 && (
        <p className="text-muted-foreground text-sm py-2 text-center">{emptyMessage}</p>
      )}
    </div>
  );
}

function RelationshipFilterControl({
  relationshipFilters,
  onChange,
}: {
  relationshipFilters: RelationshipFilters;
  onChange: (filters: RelationshipFilters) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">Show Relationships</div>
      <div className="space-y-2">
        <GraphCheckbox
          id="policyAttachments"
          checked={relationshipFilters.policyAttachments}
          onCheckedChange={(checked) => onChange({ ...relationshipFilters, policyAttachments: checked })}
          label="Policy Attachments"
          swatchClassName="bg-[#EF4444]"
        />
        <GraphCheckbox
          id="groupMemberships"
          checked={relationshipFilters.groupMemberships}
          onCheckedChange={(checked) => onChange({ ...relationshipFilters, groupMemberships: checked })}
          label="Group Memberships"
          swatchClassName="bg-[#10B981]"
        />
        <GraphCheckbox
          id="roleAssumptions"
          checked={relationshipFilters.roleAssumptions}
          onCheckedChange={(checked) => onChange({ ...relationshipFilters, roleAssumptions: checked })}
          label="Role Assumptions"
          swatchClassName="bg-[#8B5CF6]"
        />
      </div>
    </div>
  );
}

function GraphOptionsControl({
  hideAWSPolicies,
  onHideAWSPoliciesChange,
  onClearHighlights,
}: {
  hideAWSPolicies: boolean;
  onHideAWSPoliciesChange: (value: boolean) => void;
  onClearHighlights: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">Options</div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="hideAWSPolicies"
            checked={hideAWSPolicies}
            onChange={(event) => onHideAWSPoliciesChange(event.target.checked)}
            className="size-4"
          />
          <label htmlFor="hideAWSPolicies" className="text-sm cursor-pointer">
            Hide AWS Managed Policies
          </label>
        </div>
        <Button variant="outline" size="sm" onClick={onClearHighlights} className="w-full">
          Clear Highlights
        </Button>
      </div>
    </div>
  );
}

function GraphCheckbox({
  id,
  checked,
  onCheckedChange,
  label,
  swatchClassName,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  swatchClassName: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
        className="size-4"
      />
      <label htmlFor={id} className="text-sm cursor-pointer flex items-center gap-1">
        <div className={`w-6 h-0.5 ${swatchClassName}`} />
        {label}
      </label>
    </div>
  );
}

function GraphLegend({ data, hideAWSPolicies }: { data: ProcessedIAMData; hideAWSPolicies: boolean }) {
  const policyCount = hideAWSPolicies
    ? Object.values(data.policies).filter((policy) => !policy.Arn.startsWith(AWS_MANAGED_POLICY_PREFIX)).length
    : Object.keys(data.policies).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Legend</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold mb-2">Entity Types</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <LegendNode label={`Users (${Object.keys(data.users).length})`} color={nodeTypes.user.color} bgColor={nodeTypes.user.bgColor} />
              <LegendNode label={`Groups (${Object.keys(data.groups).length})`} color={nodeTypes.group.color} bgColor={nodeTypes.group.bgColor} />
              <LegendNode label={`Roles (${Object.keys(data.roles).length})`} color={nodeTypes.role.color} bgColor={nodeTypes.role.bgColor} />
              <LegendNode label={`Policies (${policyCount})`} color={nodeTypes.policy.color} bgColor={nodeTypes.policy.bgColor} />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2">Relationships</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <LegendEdge label="Group Membership" color="#10B981" markerId="arrow-green" />
              <LegendEdge label="Policy Attachment" color="#EF4444" markerId="arrow-red" />
              <LegendEdge label="Role Assumption" color="#8B5CF6" markerId="arrow-purple" />
            </div>
          </div>

          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              <strong>Tip:</strong> Larger nodes indicate entities with more connections. Click any node to highlight its relationships and view details.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LegendNode({ label, color, bgColor }: { label: string; color: string; bgColor: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="size-4 rounded border-2" style={{ backgroundColor: bgColor, borderColor: color }} />
      <span className="text-sm">{label}</span>
    </div>
  );
}

function LegendEdge({ label, color, markerId }: { label: string; color: string; markerId: string }) {
  return (
    <div className="flex items-center gap-2">
      <svg width="60" height="20" className="flex-shrink-0">
        <defs>
          <marker id={markerId} markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto">
            <polygon points="0 0, 8 4, 0 8" fill={color} />
          </marker>
        </defs>
        <line x1="0" y1="10" x2="52" y2="10" stroke={color} strokeWidth="1.5" markerEnd={`url(#${markerId})`} />
      </svg>
      <span className="text-sm">{label}</span>
    </div>
  );
}

function GraphCanvasCard(props: {
  nodes: Node[];
  edges: Edge[];
  hoveredEdge: string | null;
  selectedFilters: string[];
  highlightedEdges: string[];
  onNodesChange: ReturnType<typeof useNodesState>[2];
  onEdgesChange: ReturnType<typeof useEdgesState>[2];
  onConnect: (params: Parameters<typeof addEdge>[0]) => void;
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
  onEdgeMouseEnter: (event: React.MouseEvent, edge: Edge) => void;
  onEdgeMouseLeave: () => void;
  onInit: (instance: ReactFlowInstance) => void;
  onResetFilters: () => void;
  onFitView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  const {
    nodes,
    edges,
    hoveredEdge,
    selectedFilters,
    highlightedEdges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onNodeClick,
    onEdgeMouseEnter,
    onEdgeMouseLeave,
    onInit,
    onResetFilters,
    onFitView,
    onZoomIn,
    onZoomOut,
  } = props;

  const highlightedEdgeSet = useMemo(() => new Set(highlightedEdges), [highlightedEdges]);

  return (
    <Card className="h-[900px]">
      <CardContent className="p-0 h-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onEdgeMouseEnter={onEdgeMouseEnter}
          onEdgeMouseLeave={onEdgeMouseLeave}
          onInit={onInit}
          connectionMode={ConnectionMode.Loose}
          fitView={false}
          attributionPosition="top-right"
          defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable
          minZoom={0.1}
          maxZoom={2}
          snapToGrid
          snapGrid={[15, 15]}
        >
          <Controls />
          <MiniMap
            nodeColor={(node) => {
              const isSelected = selectedFilters.includes(node.id);
              const isConnected = edges.some(
                (edge) => highlightedEdgeSet.has(edge.id) && (edge.source === node.id || edge.target === node.id)
              );

              if (isSelected) return '#FF6B6B';
              if (isConnected) return '#FFA500';

              const nodeType = node.id.split('-')[0] as keyof typeof nodeTypes;
              return nodeTypes[nodeType]?.color || '#888';
            }}
            nodeStrokeWidth={3}
            zoomable
            pannable
            maskColor="rgba(0, 0, 0, 0.6)"
          />
          <Panel position="top-left" className="bg-background/80 backdrop-blur-sm rounded-lg p-2 border">
            <div className="text-xs text-muted-foreground">
              <div>Nodes: {nodes.length}</div>
              <div>Edges: {edges.length}</div>
              {hoveredEdge && (
                <HoveredEdgeSummary hoveredEdge={hoveredEdge} edges={edges} />
              )}
            </div>
          </Panel>
          <Panel position="top-right" className="bg-background/80 backdrop-blur-sm rounded-lg p-2 border">
            <div className="flex gap-2">
              {selectedFilters.length > 0 && (
                <Button variant="outline" size="sm" onClick={onResetFilters} className="h-8 px-2 text-red-600" title="Clear all filters">
                  <RotateCcw className="size-4 mr-1" />
                  Reset
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={onFitView} className="h-8 px-2">
                Fit View
              </Button>
              <Button variant="outline" size="sm" onClick={onZoomIn} className="h-8 px-2">
                Zoom In
              </Button>
              <Button variant="outline" size="sm" onClick={onZoomOut} className="h-8 px-2">
                Zoom Out
              </Button>
            </div>
          </Panel>
        </ReactFlow>
      </CardContent>
    </Card>
  );
}

function HoveredEdgeSummary({ hoveredEdge, edges }: { hoveredEdge: string; edges: Edge[] }) {
  const edge = edges.find((candidate) => candidate.id === hoveredEdge);
  if (!edge || !edge.data?.label) return null;

  return (
    <div className="mt-2 pt-2 border-t">
      <strong className="text-foreground">Edge: </strong>
      {String(edge.data.label)}
    </div>
  );
}

function GraphStats({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) {
  const directPolicyAttachments = edges.filter((edge) => edge.data?.label === 'attached to').length;
  const groupMemberships = edges.filter((edge) => edge.data?.label === 'member of').length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard title="Total Relationships" value={edges.length} />
      <StatCard title="Direct Policy Attachments" value={directPolicyAttachments} />
      <StatCard title="Group Memberships" value={groupMemberships} />
      <StatCard title="Total Entities" value={nodes.length} />
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function NodeDetailsDialog({
  open,
  onOpenChange,
  selectedNode,
  data,
  policyIdByArn,
  onOpenPage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedNode: SelectedNodeType;
  data: ProcessedIAMData;
  policyIdByArn: Map<string, string>;
  onOpenPage: (href: string) => void;
}) {
  if (!selectedNode) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="!max-w-none !w-[55vw] max-h-[75vh] h-[75vh] overflow-y-auto" />
      </Dialog>
    );
  }

  const selectedName = getSelectedNodeName(selectedNode);
  const selectedHref = getSelectedNodeHref(selectedNode);
  const isPolicy = selectedNode.type === 'policy';
  const isUser = selectedNode.type === 'user';
  const isGroup = selectedNode.type === 'group';
  const isRole = selectedNode.type === 'role';
  const attachedPolicies = !isPolicy ? (selectedNode.data as IAMUser | IAMGroup | IAMRole).AttachedManagedPolicies : [];
  const tags = (isUser || isRole) ? (selectedNode.data as IAMUser | IAMRole).Tags || [] : [];
  const policyDocument = isPolicy ? getDefaultPolicyDocument(selectedNode.data as IAMPolicy) : null;
  const privescMatches = isPolicy && policyDocument ? analyzePolicyForPrivesc(policyDocument) : [];
  const attachedEntities = isPolicy ? findAttachedEntities((selectedNode.data as IAMPolicy).Arn, data) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-none !w-[55vw] max-h-[75vh] h-[75vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isUser && <Users className="size-5" />}
            {isGroup && <UserCheck className="size-5" />}
            {isRole && <Shield className="size-5" />}
            {isPolicy && <FileText className="size-5" />}
            <span>{selectedName}</span>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline"
              onClick={() => onOpenPage(selectedHref)}
            >
              <ExternalLink className="size-4" />
              Open page
            </button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <BasicInformationCard selectedNode={selectedNode} />

          {isPolicy && privescMatches.length > 0 && (
            <PolicyRiskAlert
              policyId={(selectedNode.data as IAMPolicy).PolicyId}
              matches={privescMatches}
              onOpenPolicy={(policyId) => onOpenPage(`/policy/${policyId}`)}
            />
          )}

          {!isPolicy && (
            <AttachedPoliciesCard attachedPolicies={attachedPolicies} policyIdByArn={policyIdByArn} />
          )}

          {isRole && (selectedNode.data as IAMRole).AssumeRolePolicyDocument && (
            <Card>
              <CardHeader>
                <CardTitle>Assume Role Policy</CardTitle>
              </CardHeader>
              <CardContent>
                <JSONViewer data={(selectedNode.data as IAMRole).AssumeRolePolicyDocument} />
              </CardContent>
            </Card>
          )}

          {isUser && (
            <GroupMembershipCard groupNames={(selectedNode.data as IAMUser).GroupList} />
          )}

          {isPolicy && attachedEntities && (
            <AttachedEntitiesCard attachedEntities={attachedEntities} onOpenPage={onOpenPage} />
          )}

          {isPolicy && policyDocument && (
            <Card>
              <CardHeader>
                <CardTitle>Policy Document</CardTitle>
              </CardHeader>
              <CardContent>
                <JSONViewer data={policyDocument} />
              </CardContent>
            </Card>
          )}

          {(isUser || isRole) && (
            <TagsCard tags={tags} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BasicInformationCard({ selectedNode }: { selectedNode: SelectedNodeType }) {
  if (!selectedNode) return null;

  const isPolicy = selectedNode.type === 'policy';
  const policy = isPolicy ? (selectedNode.data as IAMPolicy) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Basic Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-sm font-medium">Name</div>
            <p className="text-sm">{getSelectedNodeName(selectedNode)}</p>
          </div>
          <div>
            <div className="text-sm font-medium">ARN</div>
            <p className="text-sm font-mono break-all">{selectedNode.data.Arn}</p>
          </div>
          <div>
            <div className="text-sm font-medium">Create Date</div>
            <p className="text-sm">{formatDateTime(selectedNode.data.CreateDate)}</p>
          </div>
          {policy && (
            <>
              <div>
                <div className="text-sm font-medium">Attachment Count</div>
                <Badge variant="secondary">{policy.AttachmentCount}</Badge>
              </div>
              <div>
                <div className="text-sm font-medium">Attachable</div>
                <Badge variant={policy.IsAttachable ? 'default' : 'secondary'}>
                  {policy.IsAttachable ? 'Yes' : 'No'}
                </Badge>
              </div>
            </>
          )}
        </div>
        {policy?.Description && (
          <div>
            <div className="text-sm font-medium">Description</div>
            <p className="text-sm text-muted-foreground">{policy.Description}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PolicyRiskAlert({
  policyId,
  matches,
  onOpenPolicy,
}: {
  policyId: string;
  matches: ReturnType<typeof analyzePolicyForPrivesc>;
  onOpenPolicy: (policyId: string) => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertTriangle className="size-4" />
      <AlertTitle className="font-bold">
        Privilege Escalation Risk Detected ({matches.length} path{matches.length > 1 ? 's' : ''})
      </AlertTitle>
      <AlertDescription>
        <div className="space-y-2 mt-2">
          {matches.slice(0, 3).map((match) => (
            <div key={match.path.id} className="border-l-2 border-destructive/50 pl-3">
              <div className="flex items-center gap-2">
                <Badge variant="destructive" className="text-xs">
                  {CATEGORY_LABELS[match.path.category] || match.path.category}
                </Badge>
                <span className="font-semibold text-sm">{match.path.name}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{match.path.description.slice(0, 200)}…</p>
            </div>
          ))}
          {matches.length > 3 && (
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => onOpenPolicy(policyId)}>
              View all {matches.length} paths on policy page <ExternalLink className="size-3 ml-1" />
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}

function AttachedPoliciesCard({
  attachedPolicies,
  policyIdByArn,
}: {
  attachedPolicies: Array<{ PolicyArn: string }>;
  policyIdByArn: Map<string, string>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Attached Managed Policies</CardTitle>
      </CardHeader>
      <CardContent>
        {attachedPolicies.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Policy ARN</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attachedPolicies.map((attachedPolicy) => {
                const policyId = policyIdByArn.get(attachedPolicy.PolicyArn);
                const rowCell = (
                  <TableCell>
                    <span className="font-mono text-sm">{attachedPolicy.PolicyArn}</span>
                  </TableCell>
                );

                if (!policyId) {
                  return <TableRow key={attachedPolicy.PolicyArn}>{rowCell}</TableRow>;
                }

                return (
                  <ClickableTableRow key={attachedPolicy.PolicyArn} href={`/policy/${policyId}`}>
                    {rowCell}
                  </ClickableTableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <p className="text-muted-foreground">No managed policies attached.</p>
        )}
      </CardContent>
    </Card>
  );
}

function GroupMembershipCard({ groupNames }: { groupNames: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Group Memberships</CardTitle>
      </CardHeader>
      <CardContent>
        {groupNames.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {groupNames.map((groupName) => (
              <Badge key={groupName} variant="secondary">
                {groupName}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">Not a member of any groups.</p>
        )}
      </CardContent>
    </Card>
  );
}

function AttachedEntitiesCard({
  attachedEntities,
  onOpenPage,
}: {
  attachedEntities: ReturnType<typeof findAttachedEntities>;
  onOpenPage: (href: string) => void;
}) {
  const hasAttachments =
    attachedEntities.users.length > 0 ||
    attachedEntities.roles.length > 0 ||
    attachedEntities.groups.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Attached To</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasAttachments ? (
          <p className="text-muted-foreground">Not attached to any entities.</p>
        ) : (
          <Tabs defaultValue="users" className="w-full">
            <TabsList>
              <TabsTrigger value="users">Users ({attachedEntities.users.length})</TabsTrigger>
              <TabsTrigger value="roles">Roles ({attachedEntities.roles.length})</TabsTrigger>
              <TabsTrigger value="groups">Groups ({attachedEntities.groups.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="users">
              <AttachedEntityList
                items={attachedEntities.users.map((user) => ({
                  key: user.UserId,
                  label: user.UserName,
                  description: user.Arn,
                  href: `/user/${user.UserId}`,
                }))}
                emptyMessage="No users attached."
                onOpenPage={onOpenPage}
              />
            </TabsContent>
            <TabsContent value="roles">
              <AttachedEntityList
                items={attachedEntities.roles.map((role) => ({
                  key: role.RoleId,
                  label: role.RoleName,
                  description: role.Arn,
                  href: `/role/${role.RoleId}`,
                }))}
                emptyMessage="No roles attached."
                onOpenPage={onOpenPage}
              />
            </TabsContent>
            <TabsContent value="groups">
              <AttachedEntityList
                items={attachedEntities.groups.map((group) => ({
                  key: group.GroupId,
                  label: group.GroupName,
                  description: group.Arn,
                  href: `/group/${group.GroupId}`,
                }))}
                emptyMessage="No groups attached."
                onOpenPage={onOpenPage}
              />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

function AttachedEntityList({
  items,
  emptyMessage,
  onOpenPage,
}: {
  items: Array<{ key: string; label: string; description: string; href: string }>;
  emptyMessage: string;
  onOpenPage: (href: string) => void;
}) {
  if (items.length === 0) {
    return <p className="text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className="flex w-full items-center justify-between p-2 border rounded hover:bg-muted/50 text-left"
          onClick={() => onOpenPage(item.href)}
        >
          <span className="font-medium">{item.label}</span>
          <span className="font-mono text-xs text-muted-foreground truncate max-w-[360px]">{item.description}</span>
        </button>
      ))}
    </div>
  );
}

function TagsCard({ tags }: { tags: Array<{ Key: string; Value: string }> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tags</CardTitle>
      </CardHeader>
      <CardContent>
        {tags.length > 0 ? (
          <div className="space-y-2">
            {tags.map((tag) => (
              <div key={`${tag.Key}:${tag.Value}`} className="flex items-center gap-2">
                <Badge variant="outline">{tag.Key}</Badge>
                <span className="text-sm">{tag.Value}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">No tags.</p>
        )}
      </CardContent>
    </Card>
  );
}

function getEntityNameFromFilterId(data: ProcessedIAMData, filterId: string) {
  const [type, id] = filterId.split('-', 2);
  if (type === 'user') return data.users[id]?.UserName || filterId;
  if (type === 'group') return data.groups[id]?.GroupName || filterId;
  if (type === 'role') return data.roles[id]?.RoleName || filterId;
  return data.policies[id]?.PolicyName || filterId;
}
