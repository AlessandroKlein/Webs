import { create } from 'zustand';
import { api } from './api';
import { setTenantScope, type TenantScopeMode } from './tenant-scope';

export type OrganizationType = 'standalone' | 'chain' | 'branch';

/** Organización tal y como la expone `GET /api/v1/plugins/organizaciones/organizations`. */
export interface ChainOrg {
  id: string;
  name: string;
  slug: string | null;
  type: OrganizationType | null;
  parentId: string | null;
  chainId: string | null;
  plan: string | null;
  active: boolean;
  shareInventory: boolean;
  logoUrl?: string | null;
  memberCount?: number;
}

interface TenantState {
  loaded: boolean;
  orgs: ChainOrg[];
  /** Casa matriz (cadena o standalone sin padre). */
  root: ChainOrg | null;
  /** Sucursales de la cadena. */
  branches: ChainOrg[];
  mode: TenantScopeMode;
  selectedOrganizationId: string | null;
  hasChain: boolean;
  load: () => Promise<void>;
  selectMode: (mode: TenantScopeMode) => void;
  selectBranch: (organizationId: string) => void;
  reset: () => void;
}

function deriveRoot(orgs: ChainOrg[]): ChainOrg | null {
  return (
    orgs.find((o) => o.type === 'chain' && !o.parentId) ??
    orgs.find((o) => o.type === 'standalone') ??
    orgs.find((o) => !o.parentId) ??
    null
  );
}

function deriveBranches(orgs: ChainOrg[], root: ChainOrg | null): ChainOrg[] {
  if (!root) return orgs.filter((o) => o.type === 'branch');
  return orgs.filter((o) => o.type === 'branch' && (o.chainId === root.id || o.parentId === root.id));
}

export const useTenantStore = create<TenantState>((set, get) => ({
  loaded: false,
  orgs: [],
  root: null,
  branches: [],
  mode: 'all',
  selectedOrganizationId: null,
  hasChain: false,

  load: async () => {
    try {
      const orgs = await api.get<ChainOrg[]>('/api/v1/plugins/organizaciones/organizations');
      const root = deriveRoot(orgs);
      const branches = deriveBranches(orgs, root);
      const hasChain = root?.type === 'chain' || branches.length > 0;
      const mode: TenantScopeMode = hasChain ? 'consolidated' : 'all';
      const chainId = root ? (root.type === 'branch' ? root.chainId : root.id) : null;
      set({ loaded: true, orgs, root, branches, hasChain, mode, selectedOrganizationId: null });
      setTenantScope({ mode, organizationId: null, chainId });
    } catch {
      set({ loaded: true, orgs: [], root: null, branches: [], hasChain: false, mode: 'all', selectedOrganizationId: null });
      setTenantScope({ mode: 'all', organizationId: null, chainId: null });
    }
  },

  selectMode: (mode) => {
    const { root } = get();
    const chainId = root ? root.id : null;
    set({ mode, selectedOrganizationId: null });
    setTenantScope({ mode, organizationId: null, chainId });
  },

  selectBranch: (organizationId) => {
    const { root } = get();
    const chainId = root ? root.id : null;
    set({ mode: 'branch', selectedOrganizationId: organizationId });
    setTenantScope({ mode: 'branch', organizationId, chainId });
  },

  reset: () => {
    set({ mode: 'all', selectedOrganizationId: null });
    setTenantScope({ mode: 'all', organizationId: null, chainId: null });
  },
}));
