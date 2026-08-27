import { createContext, useContext, useState, type ReactNode } from 'react';

interface GymModeContextValue {
  activeSessionId: string | null;
  enterGymMode: (sessionId: string) => void;
  exitGymMode: () => void;
}

const GymModeContext = createContext<GymModeContextValue | null>(null);

/** Lifted above NavShell: an active session takes over the whole app (no tab bar), not just one tab's content. */
export function GymModeProvider({ children }: { children: ReactNode }) {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  return (
    <GymModeContext.Provider
      value={{
        activeSessionId,
        enterGymMode: setActiveSessionId,
        exitGymMode: () => setActiveSessionId(null),
      }}
    >
      {children}
    </GymModeContext.Provider>
  );
}

export function useGymMode(): GymModeContextValue {
  const ctx = useContext(GymModeContext);
  if (!ctx) throw new Error('useGymMode must be used within GymModeProvider');
  return ctx;
}
