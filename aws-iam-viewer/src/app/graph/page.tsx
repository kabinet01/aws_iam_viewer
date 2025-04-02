'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  ConnectionMode,
  Position,
  MarkerType,
  MiniMap,
  Panel,
} from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CopyField } from '@/components/ui/copy-field';
import { JSONViewer } from '@/components/ui/json-viewer';
import { Input } from '@/components/ui/input';
import { ProcessedIAMData, IAMUser, IAMRole, IAMPolicy, IAMGroup } from '@/lib/types';
import { Network, Users, Shield, FileText, UserCheck, ExternalLink, Filter, Check, ChevronDown, Search, X, RotateCcw } from 'lucide-react';
import { formatDateTime, findAttachedEntities, findAssumableRoles, findAssumableRolesForRole, findRoleAssumptionChain } from '@/lib/iam-utils';
import { indexedDBService } from '@/lib/indexeddb';

// Node types with different colors
const nodeTypes = {
  user: { color: '#3B82F6', icon: Users, bgColor: '#DBEAFE' },
  group: { color: '#10B981', icon: UserCheck, bgColor: '#D1FAE5' },
  role: { color: '#F59E0B', icon: Shield, bgColor: '#FEF3C7' },
  policy: { color: '#EF4444', icon: FileText, bgColor: '#FEE2E2' },
};

type SelectedNodeType = {
  type: 'user' | 'group' | 'role' | 'policy';
  data: IAMUser | IAMGroup | IAMRole | IAMPolicy;
} | null;

export default function GraphPage() {
  const [data, setData] = useState<ProcessedIAMData | null>(null);
  const [currentUpload, setCurrentUpload] = useState<{ name: string; data: ProcessedIAMData } | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<SelectedNodeType>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'users' | 'groups' | 'roles' | 'policies'>('users');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // ReactFlow hook for additional functionality - will be used inside ReactFlow context
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  // New state for enhanced features
  const [relationshipFilters, setRelationshipFilters] = useState({
    policyAttachments: true,
    groupMemberships: true,
    roleAssumptions: true,
  });
  const [hideAWSPolicies, setHideAWSPolicies] = useState(false);
  const [highlightedEdges, setHighlightedEdges] = useState<string[]>([]);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);

  // Helper function to filter entities by search query
  const filterEntitiesBySearch = useCallback((entities: any[], searchTerm: string) => {
    if (!searchTerm.trim()) return entities;
    const query = searchTerm.toLowerCase();
    return entities.filter(entity => {
      const name = entity.UserName || entity.GroupName || entity.RoleName || entity.PolicyName || '';
      return name.toLowerCase().includes(query);
    });
  }, []);

  // Helper function to get filtered entities for current tab
  const getFilteredEntitiesForTab = useCallback((tab: string) => {
    if (!data) return [];
    
    let entities: any[] = [];
    switch (tab) {
      case 'users':
        entities = Object.values(data.users);
        break;
      case 'groups':
        entities = Object.values(data.groups);
        break;
      case 'roles':
        entities = Object.values(data.roles);
        break;
      case 'policies':
        entities = Object.values(data.policies);
        break;
    }
    
    return filterEntitiesBySearch(entities, searchQuery);
  }, [data, searchQuery, filterEntitiesBySearch]);

  // Helper function to get entity count for each type
  const getEntityCounts = useCallback(() => {
    if (!data) return { users: 0, groups: 0, roles: 0, policies: 0 };
    return {
      users: Object.keys(data.users).length,
      groups: Object.keys(data.groups).length,
      roles: Object.keys(data.roles).length,
      policies: Object.keys(data.policies).length,
    };
  }, [data]);

  const onConnect = useCallback(
    (params: any) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onInit = useCallback((instance: any) => {
    setReactFlowInstance(instance);
  }, []);

  const onEdgeMouseEnter = useCallback((_event: React.MouseEvent, edge: Edge) => {
    setHoveredEdge(edge.id);
  }, []);

  const onEdgeMouseLeave = useCallback(() => {
    setHoveredEdge(null);
  }, []);

  // Calculate node importance for sizing
  const calculateNodeImportance = useCallback((entity: IAMUser | IAMRole | IAMPolicy | IAMGroup, type: string): number => {
    let importance = 0;

    if (type === 'user') {
      const user = entity as IAMUser;
      importance = user.AttachedManagedPolicies.length + user.GroupList.length;
    } else if (type === 'role') {
      const role = entity as IAMRole;
      importance = role.AttachedManagedPolicies.length;
    } else if (type === 'policy') {
      const policy = entity as IAMPolicy;
      importance = policy.AttachmentCount;
    } else if (type === 'group') {
      const group = entity as IAMGroup;
      importance = group.AttachedManagedPolicies.length;
    }

    return importance;
  }, []);

  // Apply dagre layout
  const getLayoutedElements = useCallback((nodes: Node[], edges: Edge[], direction = 'LR') => {
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
        height: node.style?.height || 60
      });
    });

    edges.forEach((edge) => {
      dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const layoutedNodes = nodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      return {
        ...node,
        position: {
          x: nodeWithPosition.x - (node.style?.width as number || 300) / 2,
          y: nodeWithPosition.y - (node.style?.height as number || 60) / 2,
        },
      };
    });

    return { nodes: layoutedNodes, edges };
  }, []);

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    if (!data) return;

    const nodeId = node.id;
    const [nodeType, entityId] = nodeId.split('-', 2);

    // Highlight connected edges
    const connectedEdgeIds = edges
      .filter(edge => edge.source === nodeId || edge.target === nodeId)
      .map(edge => edge.id);

    setHighlightedEdges(connectedEdgeIds);

    let selectedEntity: SelectedNodeType = null;

    switch (nodeType) {
      case 'user':
        const user = data.users[entityId];
        if (user) selectedEntity = { type: 'user', data: user };
        break;
      case 'group':
        const group = data.groups[entityId];
        if (group) selectedEntity = { type: 'group', data: group };
        break;
      case 'role':
        const role = data.roles[entityId];
        if (role) selectedEntity = { type: 'role', data: role };
        break;
      case 'policy':
        const policy = data.policies[entityId];
        if (policy) selectedEntity = { type: 'policy', data: policy };
        break;
    }

    if (selectedEntity) {
      setSelectedNode(selectedEntity);
      setIsModalOpen(true);
    }
  }, [data, edges]);

  // Get related entities based on the selected filter
  const getRelatedEntities = useCallback((iamData: ProcessedIAMData, filterType: string, filterEntityId: string) => {
    const relatedUsers: IAMUser[] = [];
    const relatedGroups: IAMGroup[] = [];
    const relatedRoles: IAMRole[] = [];
    const relatedPolicies: IAMPolicy[] = [];

    if (filterType === 'user') {
      const selectedUser = iamData.users[filterEntityId];
      if (selectedUser) {
        relatedUsers.push(selectedUser);
        
        // Add groups the user belongs to
        selectedUser.GroupList.forEach(groupName => {
          const group = Object.values(iamData.groups).find(g => g.GroupName === groupName);
          if (group && !relatedGroups.find(g => g.GroupId === group.GroupId)) {
            relatedGroups.push(group);
          }
        });
        
        // Add policies attached to user
        selectedUser.AttachedManagedPolicies.forEach(policy => {
          const policyObj = Object.values(iamData.policies).find(p => p.Arn === policy.PolicyArn);
          if (policyObj && !relatedPolicies.find(p => p.PolicyId === policyObj.PolicyId)) {
            relatedPolicies.push(policyObj);
          }
        });
        
        // Add policies from user's groups
        relatedGroups.forEach(group => {
          group.AttachedManagedPolicies.forEach(policy => {
            const policyObj = Object.values(iamData.policies).find(p => p.Arn === policy.PolicyArn);
            if (policyObj && !relatedPolicies.find(p => p.PolicyId === policyObj.PolicyId)) {
              relatedPolicies.push(policyObj);
            }
          });
        });
        
        // Add roles the user can assume
        const assumableRoles = findAssumableRoles(selectedUser, iamData.roles);
        assumableRoles.forEach(role => {
          if (!relatedRoles.find(r => r.RoleId === role.RoleId)) {
            relatedRoles.push(role);
          }
          
          // Also add policies attached to these assumable roles
          role.AttachedManagedPolicies.forEach(policy => {
            const policyObj = Object.values(iamData.policies).find(p => p.Arn === policy.PolicyArn);
            if (policyObj && !relatedPolicies.find(p => p.PolicyId === policyObj.PolicyId)) {
              relatedPolicies.push(policyObj);
            }
          });
        });
      }
    } else if (filterType === 'group') {
      const selectedGroup = iamData.groups[filterEntityId];
      if (selectedGroup) {
        relatedGroups.push(selectedGroup);
        
        // Add users in the group
        Object.values(iamData.users).forEach(user => {
          if (user.GroupList.includes(selectedGroup.GroupName)) {
            relatedUsers.push(user);
          }
        });
        
        // Add policies attached to group
        selectedGroup.AttachedManagedPolicies.forEach(policy => {
          const policyObj = Object.values(iamData.policies).find(p => p.Arn === policy.PolicyArn);
          if (policyObj && !relatedPolicies.find(p => p.PolicyId === policyObj.PolicyId)) {
            relatedPolicies.push(policyObj);
          }
        });
      }
    } else if (filterType === 'role') {
      const selectedRole = iamData.roles[filterEntityId];
      if (selectedRole) {
        // Find all roles in the assumption chain
        const chainRoles = findRoleAssumptionChain(selectedRole, iamData.roles);
        chainRoles.forEach(role => {
          if (!relatedRoles.find(r => r.RoleId === role.RoleId)) {
            relatedRoles.push(role);
          }
          
          // Add policies attached to all roles in the chain
          role.AttachedManagedPolicies.forEach(policy => {
            const policyObj = Object.values(iamData.policies).find(p => p.Arn === policy.PolicyArn);
            if (policyObj && !relatedPolicies.find(p => p.PolicyId === policyObj.PolicyId)) {
              relatedPolicies.push(policyObj);
            }
          });
        });
        
        // Add users who can assume any role in the chain
        Object.values(iamData.users).forEach(user => {
          const assumableRoles = findAssumableRoles(user, iamData.roles);
          if (assumableRoles.some(role => chainRoles.some(chainRole => chainRole.RoleId === role.RoleId))) {
            if (!relatedUsers.find(u => u.UserId === user.UserId)) {
              relatedUsers.push(user);
            }
            
            // Add policies directly attached to users who can assume roles in the chain
            user.AttachedManagedPolicies.forEach(policy => {
              const policyObj = Object.values(iamData.policies).find(p => p.Arn === policy.PolicyArn);
              if (policyObj && !relatedPolicies.find(p => p.PolicyId === policyObj.PolicyId)) {
                relatedPolicies.push(policyObj);
              }
            });
            
            // Add groups that users belong to and their policies
            user.GroupList.forEach(groupName => {
              const group = Object.values(iamData.groups).find(g => g.GroupName === groupName);
              if (group && !relatedGroups.find(g => g.GroupId === group.GroupId)) {
                relatedGroups.push(group);
                
                // Add policies from groups
                group.AttachedManagedPolicies.forEach(policy => {
                  const policyObj = Object.values(iamData.policies).find(p => p.Arn === policy.PolicyArn);
                  if (policyObj && !relatedPolicies.find(p => p.PolicyId === policyObj.PolicyId)) {
                    relatedPolicies.push(policyObj);
                  }
                });
              }
            });
          }
        });
      }
    } else if (filterType === 'policy') {
      const selectedPolicy = iamData.policies[filterEntityId];
      if (selectedPolicy) {
        relatedPolicies.push(selectedPolicy);
        
        // Find entities attached to this policy
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
  }, []);

  // Build filtered graph data from IAM data
  const buildGraphData = useCallback((iamData: ProcessedIAMData, filters: string[] = []) => {
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    // Check if any filters are applied
    const isFiltered = filters.length > 0;

    // Determine which entities to show based on filter
    let usersToShow = Object.values(iamData.users);
    let groupsToShow = Object.values(iamData.groups);
    let rolesToShow = Object.values(iamData.roles);
    let policiesToShow = Object.values(iamData.policies);

    // Filter out AWS managed policies if toggle is on
    if (hideAWSPolicies) {
      policiesToShow = policiesToShow.filter(policy =>
        !policy.Arn.startsWith('arn:aws:iam::aws:policy/')
      );
    }

    if (isFiltered) {
      // Combine related entities from all selected filters
      const allRelatedUsers = new Set<IAMUser>();
      const allRelatedGroups = new Set<IAMGroup>();
      const allRelatedRoles = new Set<IAMRole>();
      const allRelatedPolicies = new Set<IAMPolicy>();

      filters.forEach(filter => {
        const [filterType, filterEntityId] = filter.split('-', 2);
        const relatedEntities = getRelatedEntities(iamData, filterType, filterEntityId);

        relatedEntities.users.forEach(user => allRelatedUsers.add(user));
        relatedEntities.groups.forEach(group => allRelatedGroups.add(group));
        relatedEntities.roles.forEach(role => allRelatedRoles.add(role));
        relatedEntities.policies.forEach(policy => allRelatedPolicies.add(policy));
      });

      usersToShow = Array.from(allRelatedUsers);
      groupsToShow = Array.from(allRelatedGroups);
      rolesToShow = Array.from(allRelatedRoles);
      policiesToShow = Array.from(allRelatedPolicies);

      // Re-filter AWS policies after getting related entities
      if (hideAWSPolicies) {
        policiesToShow = policiesToShow.filter(policy =>
          !policy.Arn.startsWith('arn:aws:iam::aws:policy/')
        );
      }
    }

    // Create user nodes with importance-based sizing
    usersToShow.forEach((user) => {
      const importance = calculateNodeImportance(user, 'user');
      const nodeHeight = 60 + Math.min(importance * 5, 40);
      const nodeWidth = 250 + Math.min(importance * 10, 100);

      newNodes.push({
        id: `user-${user.UserId}`,
        type: 'default',
        position: { x: 0, y: 0 }, // Will be set by dagre
        data: {
          label: (
            <div className="flex items-center justify-center p-2 h-full w-full">
              <span className="text-xs font-medium text-center leading-tight break-words max-w-full overflow-hidden">{user.UserName}</span>
            </div>
          ),
        },
        style: {
          background: nodeTypes.user.bgColor,
          border: `2px solid ${nodeTypes.user.color}`,
          borderRadius: '6px',
          width: nodeWidth,
          height: nodeHeight,
          fontSize: '12px',
          cursor: 'pointer',
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: true,
        selectable: true,
      });
    });

    // Create group nodes with importance-based sizing
    groupsToShow.forEach((group) => {
      const importance = calculateNodeImportance(group, 'group');
      const nodeHeight = 60 + Math.min(importance * 5, 40);
      const nodeWidth = 250 + Math.min(importance * 10, 100);

      newNodes.push({
        id: `group-${group.GroupId}`,
        type: 'default',
        position: { x: 0, y: 0 }, // Will be set by dagre
        data: {
          label: (
            <div className="flex items-center justify-center p-2 h-full w-full">
              <span className="text-xs font-medium text-center leading-tight break-words max-w-full overflow-hidden">{group.GroupName}</span>
            </div>
          ),
        },
        style: {
          background: nodeTypes.group.bgColor,
          border: `2px solid ${nodeTypes.group.color}`,
          borderRadius: '6px',
          width: nodeWidth,
          height: nodeHeight,
          fontSize: '12px',
          cursor: 'pointer',
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });
    });

    // Create role nodes with importance-based sizing
    rolesToShow.forEach((role) => {
      const importance = calculateNodeImportance(role, 'role');
      const nodeHeight = 60 + Math.min(importance * 5, 40);
      const nodeWidth = 250 + Math.min(importance * 10, 100);

      newNodes.push({
        id: `role-${role.RoleId}`,
        type: 'default',
        position: { x: 0, y: 0 }, // Will be set by dagre
        data: {
          label: (
            <div className="flex items-center justify-center p-2 h-full w-full">
              <span className="text-xs font-medium text-center leading-tight break-words max-w-full overflow-hidden">{role.RoleName}</span>
            </div>
          ),
        },
        style: {
          background: nodeTypes.role.bgColor,
          border: `2px solid ${nodeTypes.role.color}`,
          borderRadius: '6px',
          width: nodeWidth,
          height: nodeHeight,
          fontSize: '12px',
          cursor: 'pointer',
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });
    });

    // Create policy nodes with importance-based sizing
    policiesToShow.forEach((policy) => {
      const importance = calculateNodeImportance(policy, 'policy');
      const nodeHeight = 60 + Math.min(importance * 3, 40);
      const nodeWidth = 280 + Math.min(importance * 8, 120);

      newNodes.push({
        id: `policy-${policy.PolicyId}`,
        type: 'default',
        position: { x: 0, y: 0 }, // Will be set by dagre
        data: {
          label: (
            <div className="flex items-center justify-center p-2 h-full w-full">
              <span className="text-xs font-medium text-center leading-tight break-words max-w-full overflow-hidden">{policy.PolicyName}</span>
            </div>
          ),
        },
        style: {
          background: nodeTypes.policy.bgColor,
          border: `2px solid ${nodeTypes.policy.color}`,
          borderRadius: '6px',
          width: nodeWidth,
          height: nodeHeight,
          fontSize: '12px',
          cursor: 'pointer',
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });
    });

    // Create edges for user -> group relationships
    if (relationshipFilters.groupMemberships) {
      usersToShow.forEach((user) => {
        user.GroupList.forEach((groupName) => {
          const group = groupsToShow.find(g => g.GroupName === groupName);
          if (group) {
            const edgeId = `user-${user.UserId}-group-${group.GroupId}`;
            const isHighlighted = highlightedEdges.includes(edgeId);

            newEdges.push({
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
          }
        });
      });
    }

    // Create edges for user -> policy relationships (direct attachments)
    if (relationshipFilters.policyAttachments) {
      usersToShow.forEach((user) => {
        user.AttachedManagedPolicies.forEach((attachedPolicy) => {
          const policy = policiesToShow.find(p => p.Arn === attachedPolicy.PolicyArn);
          if (policy) {
            const edgeId = `user-${user.UserId}-policy-${policy.PolicyId}`;
            const isHighlighted = highlightedEdges.includes(edgeId);

            newEdges.push({
              id: edgeId,
              source: `user-${user.UserId}`,
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
          }
        });
      });

      // Create edges for group -> policy relationships
      groupsToShow.forEach((group) => {
        group.AttachedManagedPolicies.forEach((attachedPolicy) => {
          const policy = policiesToShow.find(p => p.Arn === attachedPolicy.PolicyArn);
          if (policy) {
            const edgeId = `group-${group.GroupId}-policy-${policy.PolicyId}`;
            const isHighlighted = highlightedEdges.includes(edgeId);

            newEdges.push({
              id: edgeId,
              source: `group-${group.GroupId}`,
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
          }
        });
      });

      // Create edges for role -> policy relationships
      rolesToShow.forEach((role) => {
        role.AttachedManagedPolicies.forEach((attachedPolicy) => {
          const policy = policiesToShow.find(p => p.Arn === attachedPolicy.PolicyArn);
          if (policy) {
            const edgeId = `role-${role.RoleId}-policy-${policy.PolicyId}`;
            const isHighlighted = highlightedEdges.includes(edgeId);

            newEdges.push({
              id: edgeId,
              source: `role-${role.RoleId}`,
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
          }
        });
      });
    }

    // Create edges for user -> role relationships (assumable roles)
    if (relationshipFilters.roleAssumptions) {
      usersToShow.forEach((user) => {
        const assumableRoles = findAssumableRoles(user, Object.fromEntries(
          rolesToShow.map(role => [role.RoleId, role])
        ));
        assumableRoles.forEach((role) => {
          const roleInGraph = rolesToShow.find(r => r.RoleId === role.RoleId);
          if (roleInGraph) {
            const edgeId = `user-${user.UserId}-assume-role-${role.RoleId}`;
            const isHighlighted = highlightedEdges.includes(edgeId);

            newEdges.push({
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
          }
        });
      });

      // Create edges for role -> role relationships (role assumption)
      rolesToShow.forEach((role) => {
        const assumableRoles = findAssumableRolesForRole(role, Object.fromEntries(
          rolesToShow.map(r => [r.RoleId, r])
        ));
        assumableRoles.forEach((targetRole) => {
          const targetRoleInGraph = rolesToShow.find(r => r.RoleId === targetRole.RoleId);
          if (targetRoleInGraph) {
            const edgeId = `role-${role.RoleId}-assume-role-${targetRole.RoleId}`;
            const isHighlighted = highlightedEdges.includes(edgeId);

            newEdges.push({
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
          }
        });
      });
    }

    // Apply dagre layout
    const layouted = getLayoutedElements(newNodes, newEdges);
    return layouted;
  }, [getRelatedEntities, hideAWSPolicies, relationshipFilters, highlightedEdges, calculateNodeImportance, getLayoutedElements]);

  useEffect(() => {
    const loadCurrentUpload = async () => {
      try {
        const currentUploadId = await indexedDBService.getCurrentUploadId();
        if (!currentUploadId) {
          router.push('/');
          return;
        }

        const upload = await indexedDBService.getUpload(currentUploadId);
        if (!upload) {
          router.push('/');
          return;
        }

        setCurrentUpload(upload);
        setData(upload.data);

        // Build graph data
        const { nodes: graphNodes, edges: graphEdges } = buildGraphData(upload.data, selectedFilters);
        setNodes(graphNodes);
        setEdges(graphEdges);
        setIsLoading(false);

        // Auto-fit view when filters change (after a short delay to ensure layout is complete)
        setTimeout(() => {
          reactFlowInstance?.fitView({ padding: 0.2, duration: 800 });
        }, 100);
      } catch (error) {
        console.error('Failed to load current upload:', error);
        router.push('/');
      }
    };

    loadCurrentUpload();
  }, [router, buildGraphData, setNodes, setEdges, selectedFilters, hideAWSPolicies, relationshipFilters, reactFlowInstance]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Escape key to clear filters
      if (event.key === 'Escape' && selectedFilters.length > 0) {
        setSelectedFilters([]);
      }
      // Ctrl/Cmd + K to focus search
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault();
        console.log('Ctrl+K pressed - opening filter dropdown');
        setIsFilterOpen(true);
        // Focus search input after a longer delay to ensure the dropdown is fully rendered
        setTimeout(() => {
          console.log('Attempting to focus search input...');
          if (searchInputRef.current) {
            console.log('Using ref to focus input');
            searchInputRef.current.focus();
            searchInputRef.current.select();
          } else {
            // Fallback to DOM query if ref is not available
            console.log('Using DOM query to find input');
            const searchInput = document.querySelector('input[placeholder*="Search entities"]') as HTMLInputElement;
            if (searchInput) {
              console.log('Found input via DOM query, focusing...');
              searchInput.focus();
              searchInput.select();
            } else {
              console.log('Could not find search input');
            }
          }
        }, 200);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedFilters.length]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isFilterOpen && searchInputRef.current) {
      const timer = setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isFilterOpen]);

  if (isLoading || !data || !currentUpload) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Network className="h-12 w-12 mx-auto mb-4 text-muted-foreground animate-pulse" />
          <p className="text-muted-foreground">Loading graph...</p>
        </div>
      </div>
    );
  }

  const { users, roles, policies, groups } = data;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center space-x-2">
              <Network className="h-8 w-8" />
              <span>IAM Relationship Graph</span>
            </h1>
            <p className="text-muted-foreground">
              Interactive visualization of IAM relationships for: {currentUpload.name}
            </p>
          </div>
          <Button variant="outline" onClick={() => router.push('/dashboard')}>
            Back to Dashboard
          </Button>
        </div>

        {/* Control Panel */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Entity Filter */}
              <div className="flex items-center space-x-2">
                <Filter className="h-4 w-4 flex-shrink-0" />
                <Collapsible open={isFilterOpen} onOpenChange={setIsFilterOpen} className="flex-1">
                          <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-[350px] justify-between">
                <span className="truncate">
                  {selectedFilters.length === 0 
                    ? "Show all relationships" 
                    : selectedFilters.length === 1 
                      ? (() => {
                          const [type, id] = selectedFilters[0].split('-', 2);
                          const entity = type === 'user' ? data.users[id]?.UserName :
                                       type === 'group' ? data.groups[id]?.GroupName :
                                       type === 'role' ? data.roles[id]?.RoleName :
                                       data.policies[id]?.PolicyName;
                          return entity || selectedFilters[0];
                        })()
                      : `${selectedFilters.length} entities selected`
                  }
                </span>
                <div className="flex items-center space-x-2">
                  {selectedFilters.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {selectedFilters.length}
                    </Badge>
                  )}
                  <ChevronDown className="h-4 w-4" />
                </div>
              </Button>
            </CollapsibleTrigger>
              <CollapsibleContent className="absolute z-50 mt-1 w-[500px] bg-background border rounded-md shadow-lg max-h-[600px]">
                <div className="p-4 space-y-4">
                  {/* Header with search and reset */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 flex-1">
                      <Search className="h-4 w-4 text-muted-foreground" />
                      <Input
                        ref={searchInputRef}
                        placeholder="Search entities... (Ctrl+K)"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="flex-1"
                      />
                      {searchQuery && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSearchQuery('')}
                          className="h-8 w-8 p-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      {selectedFilters.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedFilters([])}
                          className="text-red-600"
                          title="Clear all filters (Esc)"
                        >
                          <RotateCcw className="h-4 w-4 mr-1" />
                          Clear All
                        </Button>
                      )}
                      <div className="text-xs text-muted-foreground">
                        <div>Ctrl+K: Search</div>
                        <div>Esc: Clear filters</div>
                      </div>
                    </div>
                  </div>

                  {/* Tabs for different entity types */}
                  <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'users' | 'groups' | 'roles' | 'policies')}>
                    <TabsList className="grid w-full grid-cols-4">
                      <TabsTrigger value="users" className="flex items-center space-x-1">
                        <Users className="h-3 w-3" />
                        <span>Users</span>
                        <Badge variant="secondary" className="ml-1 text-xs">
                          {getEntityCounts().users}
                        </Badge>
                      </TabsTrigger>
                      <TabsTrigger value="groups" className="flex items-center space-x-1">
                        <UserCheck className="h-3 w-3" />
                        <span>Groups</span>
                        <Badge variant="secondary" className="ml-1 text-xs">
                          {getEntityCounts().groups}
                        </Badge>
                      </TabsTrigger>
                      <TabsTrigger value="roles" className="flex items-center space-x-1">
                        <Shield className="h-3 w-3" />
                        <span>Roles</span>
                        <Badge variant="secondary" className="ml-1 text-xs">
                          {getEntityCounts().roles}
                        </Badge>
                      </TabsTrigger>
                      <TabsTrigger value="policies" className="flex items-center space-x-1">
                        <FileText className="h-3 w-3" />
                        <span>Policies</span>
                        <Badge variant="secondary" className="ml-1 text-xs">
                          {getEntityCounts().policies}
                        </Badge>
                      </TabsTrigger>
                    </TabsList>

                    {/* Users Tab */}
                    <TabsContent value="users" className="mt-4">
                      <div className="space-y-1 max-h-[400px] overflow-y-auto">
                        <div className="flex items-center justify-between pb-2 border-b">
                          <span className="text-sm font-medium">
                            {getFilteredEntitiesForTab('users').length} users
                          </span>
                          {getFilteredEntitiesForTab('users').length > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const userFilters = getFilteredEntitiesForTab('users').map(user => `user-${user.UserId}`);
                                const currentUserFilters = selectedFilters.filter(f => f.startsWith('user-'));
                                const otherFilters = selectedFilters.filter(f => !f.startsWith('user-'));
                                
                                if (currentUserFilters.length === userFilters.length) {
                                  // Deselect all users
                                  setSelectedFilters(otherFilters);
                                } else {
                                  // Select all filtered users
                                  setSelectedFilters([...otherFilters, ...userFilters]);
                                }
                              }}
                              className="text-xs"
                            >
                              {getFilteredEntitiesForTab('users').every(user => 
                                selectedFilters.includes(`user-${user.UserId}`)
                              ) ? 'Deselect All' : 'Select All'}
                            </Button>
                          )}
                        </div>
                        {getFilteredEntitiesForTab('users').map(user => {
                          const value = `user-${user.UserId}`;
                          const isSelected = selectedFilters.includes(value);
                          return (
                            <Button
                              key={value}
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedFilters(prev => prev.filter(f => f !== value));
                                } else {
                                  setSelectedFilters(prev => [...prev, value]);
                                }
                              }}
                              className="w-full justify-start"
                            >
                              <div className="flex items-center space-x-2 w-full">
                                <div className="w-4 h-4 flex items-center justify-center">
                                  {isSelected && <Check className="h-3 w-3" />}
                                </div>
                                <span className="truncate">{user.UserName}</span>
                              </div>
                            </Button>
                          );
                        })}
                        {getFilteredEntitiesForTab('users').length === 0 && (
                          <p className="text-muted-foreground text-sm py-2 text-center">
                            {searchQuery ? 'No users found matching your search.' : 'No users available.'}
                          </p>
                        )}
                      </div>
                    </TabsContent>

                    {/* Groups Tab */}
                    <TabsContent value="groups" className="mt-4">
                      <div className="space-y-1 max-h-[400px] overflow-y-auto">
                        <div className="flex items-center justify-between pb-2 border-b">
                          <span className="text-sm font-medium">
                            {getFilteredEntitiesForTab('groups').length} groups
                          </span>
                          {getFilteredEntitiesForTab('groups').length > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const groupFilters = getFilteredEntitiesForTab('groups').map(group => `group-${group.GroupId}`);
                                const currentGroupFilters = selectedFilters.filter(f => f.startsWith('group-'));
                                const otherFilters = selectedFilters.filter(f => !f.startsWith('group-'));
                                
                                if (currentGroupFilters.length === groupFilters.length) {
                                  // Deselect all groups
                                  setSelectedFilters(otherFilters);
                                } else {
                                  // Select all filtered groups
                                  setSelectedFilters([...otherFilters, ...groupFilters]);
                                }
                              }}
                              className="text-xs"
                            >
                              {getFilteredEntitiesForTab('groups').every(group => 
                                selectedFilters.includes(`group-${group.GroupId}`)
                              ) ? 'Deselect All' : 'Select All'}
                            </Button>
                          )}
                        </div>
                        {getFilteredEntitiesForTab('groups').map(group => {
                          const value = `group-${group.GroupId}`;
                          const isSelected = selectedFilters.includes(value);
                          return (
                            <Button
                              key={value}
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedFilters(prev => prev.filter(f => f !== value));
                                } else {
                                  setSelectedFilters(prev => [...prev, value]);
                                }
                              }}
                              className="w-full justify-start"
                            >
                              <div className="flex items-center space-x-2 w-full">
                                <div className="w-4 h-4 flex items-center justify-center">
                                  {isSelected && <Check className="h-3 w-3" />}
                                </div>
                                <span className="truncate">{group.GroupName}</span>
                              </div>
                            </Button>
                          );
                        })}
                        {getFilteredEntitiesForTab('groups').length === 0 && (
                          <p className="text-muted-foreground text-sm py-2 text-center">
                            {searchQuery ? 'No groups found matching your search.' : 'No groups available.'}
                          </p>
                        )}
                      </div>
                    </TabsContent>

                    {/* Roles Tab */}
                    <TabsContent value="roles" className="mt-4">
                      <div className="space-y-1 max-h-[400px] overflow-y-auto">
                        <div className="flex items-center justify-between pb-2 border-b">
                          <span className="text-sm font-medium">
                            {getFilteredEntitiesForTab('roles').length} roles
                          </span>
                          {getFilteredEntitiesForTab('roles').length > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const roleFilters = getFilteredEntitiesForTab('roles').map(role => `role-${role.RoleId}`);
                                const currentRoleFilters = selectedFilters.filter(f => f.startsWith('role-'));
                                const otherFilters = selectedFilters.filter(f => !f.startsWith('role-'));
                                
                                if (currentRoleFilters.length === roleFilters.length) {
                                  // Deselect all roles
                                  setSelectedFilters(otherFilters);
                                } else {
                                  // Select all filtered roles
                                  setSelectedFilters([...otherFilters, ...roleFilters]);
                                }
                              }}
                              className="text-xs"
                            >
                              {getFilteredEntitiesForTab('roles').every(role => 
                                selectedFilters.includes(`role-${role.RoleId}`)
                              ) ? 'Deselect All' : 'Select All'}
                            </Button>
                          )}
                        </div>
                        {getFilteredEntitiesForTab('roles').map(role => {
                          const value = `role-${role.RoleId}`;
                          const isSelected = selectedFilters.includes(value);
                          return (
                            <Button
                              key={value}
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedFilters(prev => prev.filter(f => f !== value));
                                } else {
                                  setSelectedFilters(prev => [...prev, value]);
                                }
                              }}
                              className="w-full justify-start"
                            >
                              <div className="flex items-center space-x-2 w-full">
                                <div className="w-4 h-4 flex items-center justify-center">
                                  {isSelected && <Check className="h-3 w-3" />}
                                </div>
                                <span className="truncate">{role.RoleName}</span>
                              </div>
                            </Button>
                          );
                        })}
                        {getFilteredEntitiesForTab('roles').length === 0 && (
                          <p className="text-muted-foreground text-sm py-2 text-center">
                            {searchQuery ? 'No roles found matching your search.' : 'No roles available.'}
                          </p>
                        )}
                      </div>
                    </TabsContent>

                    {/* Policies Tab */}
                    <TabsContent value="policies" className="mt-4">
                      <div className="space-y-1 max-h-[400px] overflow-y-auto">
                        <div className="flex items-center justify-between pb-2 border-b">
                          <span className="text-sm font-medium">
                            {getFilteredEntitiesForTab('policies').length} policies
                          </span>
                          {getFilteredEntitiesForTab('policies').length > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const policyFilters = getFilteredEntitiesForTab('policies').map(policy => `policy-${policy.PolicyId}`);
                                const currentPolicyFilters = selectedFilters.filter(f => f.startsWith('policy-'));
                                const otherFilters = selectedFilters.filter(f => !f.startsWith('policy-'));
                                
                                if (currentPolicyFilters.length === policyFilters.length) {
                                  // Deselect all policies
                                  setSelectedFilters(otherFilters);
                                } else {
                                  // Select all filtered policies
                                  setSelectedFilters([...otherFilters, ...policyFilters]);
                                }
                              }}
                              className="text-xs"
                            >
                              {getFilteredEntitiesForTab('policies').every(policy => 
                                selectedFilters.includes(`policy-${policy.PolicyId}`)
                              ) ? 'Deselect All' : 'Select All'}
                            </Button>
                          )}
                        </div>
                        {getFilteredEntitiesForTab('policies').map(policy => {
                          const value = `policy-${policy.PolicyId}`;
                          const isSelected = selectedFilters.includes(value);
                          return (
                            <Button
                              key={value}
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedFilters(prev => prev.filter(f => f !== value));
                                } else {
                                  setSelectedFilters(prev => [...prev, value]);
                                }
                              }}
                              className="w-full justify-start"
                            >
                              <div className="flex items-center space-x-2 w-full">
                                <div className="w-4 h-4 flex items-center justify-center">
                                  {isSelected && <Check className="h-3 w-3" />}
                                </div>
                                <span className="truncate">{policy.PolicyName}</span>
                              </div>
                            </Button>
                          );
                        })}
                        {getFilteredEntitiesForTab('policies').length === 0 && (
                          <p className="text-muted-foreground text-sm py-2 text-center">
                            {searchQuery ? 'No policies found matching your search.' : 'No policies available.'}
                          </p>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              </CollapsibleContent>
            </Collapsible>
              </div>

              {/* Relationship Type Filters */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Show Relationships</label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="policyAttachments"
                      checked={relationshipFilters.policyAttachments}
                      onChange={(e) => setRelationshipFilters({ ...relationshipFilters, policyAttachments: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <label htmlFor="policyAttachments" className="text-sm cursor-pointer flex items-center gap-1">
                      <div className="w-6 h-0.5 bg-[#EF4444]"></div>
                      Policy Attachments
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="groupMemberships"
                      checked={relationshipFilters.groupMemberships}
                      onChange={(e) => setRelationshipFilters({ ...relationshipFilters, groupMemberships: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <label htmlFor="groupMemberships" className="text-sm cursor-pointer flex items-center gap-1">
                      <div className="w-6 h-0.5 bg-[#10B981]"></div>
                      Group Memberships
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="roleAssumptions"
                      checked={relationshipFilters.roleAssumptions}
                      onChange={(e) => setRelationshipFilters({ ...relationshipFilters, roleAssumptions: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <label htmlFor="roleAssumptions" className="text-sm cursor-pointer flex items-center gap-1">
                      <div className="w-6 h-0.5 bg-[#8B5CF6]"></div>
                      Role Assumptions
                    </label>
                  </div>
                </div>
              </div>

              {/* Additional Options */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Options</label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="hideAWSPolicies"
                      checked={hideAWSPolicies}
                      onChange={(e) => setHideAWSPolicies(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <label htmlFor="hideAWSPolicies" className="text-sm cursor-pointer">
                      Hide AWS Managed Policies
                    </label>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setHighlightedEdges([]);
                      setIsModalOpen(false);
                    }}
                    className="w-full"
                  >
                    Clear Highlights
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Enhanced Legend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Legend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Node Types */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Entity Types</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex items-center space-x-2">
                  <div
                    className="w-4 h-4 rounded border-2"
                    style={{
                      backgroundColor: nodeTypes.user.bgColor,
                      borderColor: nodeTypes.user.color
                    }}
                  />
                  <span className="text-sm">Users ({Object.keys(users).length})</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div
                    className="w-4 h-4 rounded border-2"
                    style={{
                      backgroundColor: nodeTypes.group.bgColor,
                      borderColor: nodeTypes.group.color
                    }}
                  />
                  <span className="text-sm">Groups ({Object.keys(groups).length})</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div
                    className="w-4 h-4 rounded border-2"
                    style={{
                      backgroundColor: nodeTypes.role.bgColor,
                      borderColor: nodeTypes.role.color
                    }}
                  />
                  <span className="text-sm">Roles ({Object.keys(roles).length})</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div
                    className="w-4 h-4 rounded border-2"
                    style={{
                      backgroundColor: nodeTypes.policy.bgColor,
                      borderColor: nodeTypes.policy.color
                    }}
                  />
                  <span className="text-sm">Policies ({Object.keys(policies).length})</span>
                </div>
              </div>
            </div>

            {/* Relationship Types */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Relationships</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="flex items-center gap-2">
                  <svg width="60" height="20" className="flex-shrink-0">
                    <defs>
                      <marker id="arrow-green" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto">
                        <polygon points="0 0, 8 4, 0 8" fill="#10B981" />
                      </marker>
                    </defs>
                    <line x1="0" y1="10" x2="52" y2="10" stroke="#10B981" strokeWidth="1.5" markerEnd="url(#arrow-green)"/>
                  </svg>
                  <span className="text-sm">Group Membership</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg width="60" height="20" className="flex-shrink-0">
                    <defs>
                      <marker id="arrow-red" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto">
                        <polygon points="0 0, 8 4, 0 8" fill="#EF4444" />
                      </marker>
                    </defs>
                    <line x1="0" y1="10" x2="52" y2="10" stroke="#EF4444" strokeWidth="1.5" markerEnd="url(#arrow-red)"/>
                  </svg>
                  <span className="text-sm">Policy Attachment</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg width="60" height="20" className="flex-shrink-0">
                    <defs>
                      <marker id="arrow-purple" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto">
                        <polygon points="0 0, 8 4, 0 8" fill="#8B5CF6" />
                      </marker>
                    </defs>
                    <line x1="0" y1="10" x2="52" y2="10" stroke="#8B5CF6" strokeWidth="1.5" markerEnd="url(#arrow-purple)"/>
                  </svg>
                  <span className="text-sm">Role Assumption</span>
                </div>
              </div>
            </div>

            {/* Tips */}
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                <strong>Tip:</strong> Larger nodes indicate entities with more connections. Click any node to highlight its relationships and view details.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Graph visualization */}
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
            nodesDraggable={true}
            nodesConnectable={false}
            elementsSelectable={true}
            minZoom={0.1}
            maxZoom={2}
            snapToGrid={true}
            snapGrid={[15, 15]}
          >

            <Controls />
            <MiniMap
              nodeColor={(node) => {
                // Check if node is part of selected filter
                const nodeId = node.id;
                const isInSelectedFilter = selectedFilters.some(filter => {
                  const filterNodeId = filter;
                  return filterNodeId === nodeId;
                });

                // Check if node is connected to highlighted edges
                const isConnected = highlightedEdges.some(edgeId => {
                  const edge = edges.find(e => e.id === edgeId);
                  return edge && (edge.source === nodeId || edge.target === nodeId);
                });

                if (isInSelectedFilter) {
                  return '#FF6B6B'; // Highlight selected filter nodes
                }

                if (isConnected) {
                  return '#FFA500'; // Highlight connected nodes
                }

                const nodeType = node.id.split('-')[0];
                return nodeTypes[nodeType as keyof typeof nodeTypes]?.color || '#888';
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
                {hoveredEdge && (() => {
                  const edge = edges.find(e => e.id === hoveredEdge);
                  if (edge && edge.data?.label) {
                    return (
                      <div className="mt-2 pt-2 border-t">
                        <strong className="text-foreground">Edge: </strong>{edge.data.label}
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            </Panel>
            <Panel position="top-right" className="bg-background/80 backdrop-blur-sm rounded-lg p-2 border">
              <div className="flex gap-2">
                {selectedFilters.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedFilters([])}
                    className="h-8 px-2 text-red-600"
                    title="Clear all filters"
                  >
                    <RotateCcw className="h-4 w-4 mr-1" />
                    Reset
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => reactFlowInstance?.fitView({ padding: 0.1 })}
                  className="h-8 px-2"
                >
                  Fit View
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => reactFlowInstance?.zoomIn()}
                  className="h-8 px-2"
                >
                  Zoom In
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => reactFlowInstance?.zoomOut()}
                  className="h-8 px-2"
                >
                  Zoom Out
                </Button>
              </div>
            </Panel>
          </ReactFlow>
        </CardContent>
      </Card>

      {/* Graph statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total Relationships</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{edges.length}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Direct Policy Attachments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {edges.filter(edge => edge.label === 'attached to').length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Group Memberships</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {edges.filter(edge => edge.label === 'member of').length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total Entities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{nodes.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Node Details Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="!max-w-none !w-[55vw] max-h-[75vh] h-[75vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              {selectedNode?.type === 'user' && <Users className="h-5 w-5" />}
              {selectedNode?.type === 'group' && <UserCheck className="h-5 w-5" />}
              {selectedNode?.type === 'role' && <Shield className="h-5 w-5" />}
              {selectedNode?.type === 'policy' && <FileText className="h-5 w-5" />}
              <span>
                {selectedNode?.type === 'user' && (selectedNode.data as IAMUser).UserName}
                {selectedNode?.type === 'group' && (selectedNode.data as IAMGroup).GroupName}
                {selectedNode?.type === 'role' && (selectedNode.data as IAMRole).RoleName}
                {selectedNode?.type === 'policy' && (selectedNode.data as IAMPolicy).PolicyName}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const entityId = selectedNode?.type === 'user' ? (selectedNode.data as IAMUser).UserId :
                                  selectedNode?.type === 'group' ? (selectedNode.data as IAMGroup).GroupId :
                                  selectedNode?.type === 'role' ? (selectedNode.data as IAMRole).RoleId :
                                  selectedNode?.type === 'policy' ? (selectedNode.data as IAMPolicy).PolicyId : '';
                  if (entityId) {
                    router.push(`/${selectedNode?.type}/${entityId}`);
                  }
                }}
              >
                <ExternalLink className="h-4 w-4" />
                View Full Details
              </Button>
            </DialogTitle>
          </DialogHeader>
          
          {selectedNode && (
            <div className="space-y-4">
              {/* Basic Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Basic Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Name</label>
                      <CopyField value={
                        selectedNode.type === 'user' ? (selectedNode.data as IAMUser).UserName :
                        selectedNode.type === 'group' ? (selectedNode.data as IAMGroup).GroupName :
                        selectedNode.type === 'role' ? (selectedNode.data as IAMRole).RoleName :
                        (selectedNode.data as IAMPolicy).PolicyName
                      }>
                        {selectedNode.type === 'user' ? (selectedNode.data as IAMUser).UserName :
                         selectedNode.type === 'group' ? (selectedNode.data as IAMGroup).GroupName :
                         selectedNode.type === 'role' ? (selectedNode.data as IAMRole).RoleName :
                         (selectedNode.data as IAMPolicy).PolicyName}
                      </CopyField>
                    </div>
                    <div>
                      <label className="text-sm font-medium">ARN</label>
                      <CopyField value={selectedNode.data.Arn} displayValue={selectedNode.data.Arn} />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Create Date</label>
                      <p className="text-sm">{formatDateTime(selectedNode.data.CreateDate)}</p>
                    </div>
                    {selectedNode.type === 'policy' && (
                      <>
                        <div>
                          <label className="text-sm font-medium">Attachment Count</label>
                          <Badge variant="secondary">{(selectedNode.data as IAMPolicy).AttachmentCount}</Badge>
                        </div>
                        <div>
                          <label className="text-sm font-medium">Attachable</label>
                          <Badge variant={(selectedNode.data as IAMPolicy).IsAttachable ? "default" : "secondary"}>
                            {(selectedNode.data as IAMPolicy).IsAttachable ? "Yes" : "No"}
                          </Badge>
                        </div>
                      </>
                    )}
                  </div>
                  {selectedNode.type === 'policy' && (selectedNode.data as IAMPolicy).Description && (
                    <div>
                      <label className="text-sm font-medium">Description</label>
                      <p className="text-sm text-muted-foreground">{(selectedNode.data as IAMPolicy).Description}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Attached Policies */}
              {(selectedNode.type === 'user' || selectedNode.type === 'group' || selectedNode.type === 'role') && (
                <Card>
                  <CardHeader>
                    <CardTitle>Attached Managed Policies</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(selectedNode.data as IAMUser | IAMGroup | IAMRole).AttachedManagedPolicies.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Policy ARN</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(selectedNode.data as IAMUser | IAMGroup | IAMRole).AttachedManagedPolicies.map((policy, index) => (
                            <TableRow key={index}>
                              <TableCell>
                                <CopyField value={policy.PolicyArn} displayValue={policy.PolicyArn} />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-muted-foreground">No managed policies attached.</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Role-specific: Assume Role Policy */}
              {selectedNode.type === 'role' && (selectedNode.data as IAMRole).AssumeRolePolicyDocument && (
                <Card>
                  <CardHeader>
                    <CardTitle>Assume Role Policy</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <JSONViewer data={(selectedNode.data as IAMRole).AssumeRolePolicyDocument} />
                  </CardContent>
                </Card>
              )}

              {/* User-specific: Groups */}
              {selectedNode.type === 'user' && (
                <Card>
                  <CardHeader>
                    <CardTitle>Group Memberships</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(selectedNode.data as IAMUser).GroupList.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {(selectedNode.data as IAMUser).GroupList.map((groupName, index) => (
                          <Badge key={index} variant="secondary">{groupName}</Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground">Not a member of any groups.</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Policy-specific: Attached Entities */}
              {selectedNode.type === 'policy' && data && (
                <Card>
                  <CardHeader>
                    <CardTitle>Attached To</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const attachedEntities = findAttachedEntities((selectedNode.data as IAMPolicy).Arn, data);
                      const hasAttachments = attachedEntities.users.length > 0 || attachedEntities.roles.length > 0 || attachedEntities.groups.length > 0;
                      
                      if (!hasAttachments) {
                        return <p className="text-muted-foreground">Not attached to any entities.</p>;
                      }

                      return (
                        <Tabs defaultValue="users" className="w-full">
                          <TabsList>
                            <TabsTrigger value="users">Users ({attachedEntities.users.length})</TabsTrigger>
                            <TabsTrigger value="roles">Roles ({attachedEntities.roles.length})</TabsTrigger>
                            <TabsTrigger value="groups">Groups ({attachedEntities.groups.length})</TabsTrigger>
                          </TabsList>
                          
                          <TabsContent value="users">
                            {attachedEntities.users.length > 0 ? (
                              <div className="space-y-2">
                                {attachedEntities.users.map(user => (
                                  <div key={user.UserId} className="flex items-center justify-between p-2 border rounded">
                                    <span className="font-medium">{user.UserName}</span>
                                    <CopyField value={user.Arn} displayValue={user.Arn} />
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-muted-foreground">No users attached.</p>
                            )}
                          </TabsContent>
                          
                          <TabsContent value="roles">
                            {attachedEntities.roles.length > 0 ? (
                              <div className="space-y-2">
                                {attachedEntities.roles.map(role => (
                                  <div key={role.RoleId} className="flex items-center justify-between p-2 border rounded">
                                    <span className="font-medium">{role.RoleName}</span>
                                    <CopyField value={role.Arn} displayValue={role.Arn} />
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-muted-foreground">No roles attached.</p>
                            )}
                          </TabsContent>
                          
                          <TabsContent value="groups">
                            {attachedEntities.groups.length > 0 ? (
                              <div className="space-y-2">
                                {attachedEntities.groups.map(group => (
                                  <div key={group.GroupId} className="flex items-center justify-between p-2 border rounded">
                                    <span className="font-medium">{group.GroupName}</span>
                                    <CopyField value={group.Arn} displayValue={group.Arn} />
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-muted-foreground">No groups attached.</p>
                            )}
                          </TabsContent>
                        </Tabs>
                      );
                    })()}
                  </CardContent>
                </Card>
              )}

              {/* Policy-specific: Policy Document */}
              {selectedNode.type === 'policy' && (selectedNode.data as IAMPolicy).PolicyVersionList && (
                <Card>
                  <CardHeader>
                    <CardTitle>Policy Document</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const policy = selectedNode.data as IAMPolicy;
                      const defaultVersion = policy.PolicyVersionList.find(v => v.VersionId === policy.DefaultVersionId);
                      return defaultVersion ? (
                        <JSONViewer data={defaultVersion.Document} />
                      ) : (
                        <p className="text-muted-foreground">No policy document available.</p>
                      );
                    })()}
                  </CardContent>
                </Card>
              )}

              {/* Tags */}
              {(selectedNode.type === 'user' || selectedNode.type === 'role') && (selectedNode.data as IAMUser | IAMRole).Tags && (
                <Card>
                  <CardHeader>
                    <CardTitle>Tags</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(selectedNode.data as IAMUser | IAMRole).Tags.length > 0 ? (
                      <div className="space-y-2">
                        {(selectedNode.data as IAMUser | IAMRole).Tags.map((tag, index) => (
                          <div key={index} className="flex items-center space-x-2">
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
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
} 