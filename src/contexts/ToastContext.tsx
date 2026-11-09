import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

type Kind = 'success' | 'error' | 'info';
interface Toast { id: number; kind: Kind; msg: string }
const Ctx = createContext<(msg: string, kind?: Kind) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((msg: string, kind: Kind = 'info') => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, kind, msg }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 4000);
  }, []);
  const Icon = { success: CheckCircle2, error: AlertCircle, info: Info };
  const color = { success: 'bg-success', error: 'bg-danger', info: 'bg-navy' };
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="fixed top-3 inset-x-3 z-[100] flex flex-col gap-2 items-center pointer-events-none" role="status" aria-live="polite">
        {items.map((t) => {
          const I = Icon[t.kind];
          return (
            <div key={t.id} className={`${color[t.kind]} text-white text-sm px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 max-w-md w-full animate-slideIn pointer-events-auto`}>
              <I size={18} className="shrink-0" /> <span>{t.msg}</span>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
