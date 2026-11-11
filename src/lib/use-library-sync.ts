import { useCallback, useEffect, useRef, useState } from "react";
import type { AppState } from "../types";
import {
  deleteVault,
  mergeLibraries,
  pullLibrary,
  pushLibrary,
} from "./library-sync";
import { validateLibrary } from "./library-backup";

export type LibraryUpdate = (
  fn: (state: AppState) => AppState,
  preserveClocks?: boolean,
) => void;
const KEY = "mlibrary:sync-key";
export function useLibrarySync(state: AppState, update: LibraryUpdate) {
  const current = useRef(state);
  current.current = state;
  const [key, setKey] = useState(() => localStorage.getItem(KEY) || "");
  const [busy, setBusy] = useState(false),
    lock = useRef(false);
  const [error, setError] = useState("");
  const [last, setLast] = useState("");
  const synced = useRef("");
  const sync = useCallback(
    async (recovery = key, joining = false) => {
      if (!recovery || lock.current) return false;
      lock.current = true;
      setBusy(true);
      setError("");
      try {
        for (let attempt = 0; attempt < 3; attempt++) {
          const remote = await pullLibrary(recovery);
          if (joining && !remote)
            throw new Error(
              "No library was found for that recovery key. Check it and try again.",
            );
          const snapshot = current.current;
          const merged = remote
            ? mergeLibraries(snapshot, validateLibrary(remote.state))
            : snapshot;
          if (!(await pushLibrary(merged, recovery, remote?.etag))) continue;
          // Preserve edits made while the request was in flight.
          const next = mergeLibraries(current.current, merged);
          localStorage.setItem("mlibrary:v1", JSON.stringify(next));
          localStorage.setItem(KEY, recovery);
          setKey(recovery);
          synced.current = JSON.stringify(merged);
          update(() => next, true);
          setLast(new Date().toLocaleTimeString());
          return true;
        }
        throw new Error(
          "Another device is changing this library. Try syncing again shortly.",
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sync failed");
        return false;
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
    [key, update],
  );
  useEffect(() => {
    if (!key) return;
    const timer = setTimeout(() => {
      if (
        navigator.onLine &&
        JSON.stringify(current.current) !== synced.current
      )
        void sync();
    }, 7000);
    return () => clearTimeout(timer);
  }, [state, key, sync]);
  useEffect(() => {
    if (!key) return;
    const refresh = () => {
      if (navigator.onLine && document.visibilityState === "visible")
        void sync();
    };
    const timer = setInterval(refresh, 60000);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [key, sync]);
  const disconnect = () => {
    if (lock.current) return;
    localStorage.removeItem(KEY);
    setKey("");
    synced.current = "";
    setLast("");
    setError("");
  };
  const remove = async () => {
    if (!key || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await deleteVault(key);
      lock.current = false;
      disconnect();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deletion failed");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return { key, busy, error, last, sync, disconnect, remove };
}
