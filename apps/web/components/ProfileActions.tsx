"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AuthUser } from "../lib/auth";

export type ProfileAction = {
  id: string;
  label: string;
  detail?: string;
  icon?: "trip" | "passport" | "home" | "settings" | "saved";
  disabled?: boolean;
  onSelect: () => void;
};

type ProfileAccount = {
  user: AuthUser;
  signingOut: boolean;
  logoutError: string;
  editCharacter: () => void;
  signOut: () => Promise<void>;
};
type RegisterActions = (
  owner: string,
  actions: readonly ProfileAction[],
) => () => void;

const ProfileContext = createContext<
  (ProfileAccount & { actions: readonly ProfileAction[] }) | null
>(null);
const RegisterContext = createContext<RegisterActions | null>(null);

export default function ProfileProvider({
  children,
  ...account
}: ProfileAccount & { children: ReactNode }) {
  const [registered, setRegistered] = useState<
    Record<string, readonly ProfileAction[]>
  >({});
  const register = useCallback<RegisterActions>((owner, actions) => {
    setRegistered((current) => ({ ...current, [owner]: actions }));
    return () => {
      setRegistered((current) => {
        if (current[owner] !== actions) return current;
        const next = { ...current };
        delete next[owner];
        return next;
      });
    };
  }, []);
  const actions = useMemo(() => {
    const ids = new Set<string>();
    return Object.values(registered)
      .flat()
      .filter((action) => {
        if (ids.has(action.id)) return false;
        ids.add(action.id);
        return true;
      });
  }, [registered]);
  return (
    <RegisterContext.Provider value={register}>
      <ProfileContext.Provider value={{ ...account, actions }}>
        {children}
      </ProfileContext.Provider>
    </RegisterContext.Provider>
  );
}

export function useProfile() {
  const profile = useContext(ProfileContext);
  if (!profile) throw new Error("Profile must be inside ProfileProvider.");
  return profile;
}

/** Register visible choices, while action callbacks always use the latest render. */
export function useProfileActions(actions: readonly ProfileAction[]) {
  const register = useContext(RegisterContext);
  if (!register)
    throw new Error("Profile actions must be inside ProfileProvider.");
  const owner = useId();
  const latest = useRef(actions);
  latest.current = actions;
  const choices = JSON.stringify(
    actions.map(({ id, label, detail, icon, disabled }) => ({
      id,
      label,
      detail,
      icon,
      disabled: Boolean(disabled),
    })),
  );
  useEffect(
    () =>
      register(
        owner,
        latest.current.map((action) => ({
          ...action,
          onSelect: () => {
            const current = latest.current.find(({ id }) => id === action.id);
            if (current && !current.disabled) current.onSelect();
          },
        })),
      ),
    [register, owner, choices],
  );
}
