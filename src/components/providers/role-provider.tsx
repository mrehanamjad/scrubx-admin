'use client';

import React, { createContext, useContext, useMemo } from "react";
import { can, type Capability } from "@/lib/permissions";

export interface RoleContextValue {
  role: string | null;
  can: (capability: Capability) => boolean;
}

const RoleContext = createContext<RoleContextValue>({
  role: null,
  can: () => false,
});

export function RoleProvider({
  role = null,
  children,
}: {
  role?: string | null;
  children: React.ReactNode;
}) {
  const value = useMemo<RoleContextValue>(() => ({
    role: role ?? null,
    can: (capability: Capability) => can(role, capability),
  }), [role]);

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  return useContext(RoleContext);
}

export function useCan(capability: Capability): boolean {
  const { can: checkCan } = useRole();
  return checkCan(capability);
}
