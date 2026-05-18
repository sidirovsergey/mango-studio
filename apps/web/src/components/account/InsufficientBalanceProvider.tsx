'use client';
import { createContext, useCallback, useContext, useState } from 'react';
import {
  InsufficientBalanceModal,
  type InsufficientBalanceState,
} from './InsufficientBalanceModal';

interface InsufficientBalanceContextValue {
  open: (state: InsufficientBalanceState) => void;
}

const Ctx = createContext<InsufficientBalanceContextValue | null>(null);

export function InsufficientBalanceProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<InsufficientBalanceState | null>(null);
  const open = useCallback((s: InsufficientBalanceState) => setState(s), []);
  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {state && <InsufficientBalanceModal state={state} onClose={() => setState(null)} />}
    </Ctx.Provider>
  );
}

export function useInsufficientBalance() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useInsufficientBalance outside InsufficientBalanceProvider');
  return v;
}
