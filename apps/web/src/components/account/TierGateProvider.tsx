'use client';
import { createContext, useCallback, useContext, useState } from 'react';
import { TierGateModal, type TierGateModalState } from './TierGateModal';

interface TierGateContextValue {
  open: (state: TierGateModalState) => void;
}

const Ctx = createContext<TierGateContextValue | null>(null);

export function TierGateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<TierGateModalState | null>(null);
  const open = useCallback((s: TierGateModalState) => setState(s), []);
  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {state && <TierGateModal state={state} onClose={() => setState(null)} />}
    </Ctx.Provider>
  );
}

export function useTierGate() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTierGate outside TierGateProvider');
  return v;
}
