import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { CircleNotch } from "@phosphor-icons/react";
import { BookImport, importIncoming } from "../lib/book-import";
import { importText } from "../lib/import-i18n";
import type { Book, Language } from "../types";

export function useIncomingBooks(
  language: Language,
  adopt: (book: Book) => void,
) {
  const current = useRef({ language, adopt });
  current.current = { language, adopt };
  const busy = useRef(false),
    failed = useRef<string | null>(null),
    queued = useRef(false);
  const [phase, setPhase] = useState<"idle" | "importing" | "error">("idle");
  const scan = useCallback(async () => {
    if (busy.current) {
      queued.current = true;
      return;
    }
    if (failed.current !== null || !Capacitor.isNativePlatform()) return;
    busy.current = true;
    let id = "";
    try {
      do {
        queued.current = false;
        const { items } = await BookImport.pending();
        if (failed.current !== null) break;
        for (const item of items) {
          id = item.id;
          setPhase("importing");
          await importIncoming(
            item,
            current.current.language,
            current.current.adopt,
          );
        }
      } while (queued.current && failed.current === null);
      setPhase(failed.current === null ? "idle" : "error");
    } catch {
      failed.current = id;
      setPhase("error");
    } finally {
      busy.current = false;
    }
  }, []);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let disposed = false;
    const handles: { remove(): Promise<void> }[] = [];
    for (const event of ["ready", "importError"] as const) {
      void BookImport.addListener(event, () => {
        if (disposed) return;
        if (event === "ready") void scan();
        else {
          failed.current = failed.current ?? "";
          setPhase("error");
        }
      })
        .then((handle) => {
          if (disposed) void handle.remove();
          else handles.push(handle);
        })
        .catch(() => {
          if (!disposed) {
            failed.current = "";
            setPhase("error");
          }
        });
    }
    void scan();
    return () => {
      disposed = true;
      handles.forEach((handle) => void handle.remove());
    };
  }, [scan]);
  const t = importText(language);
  if (phase === "idle") return null;
  return (
    <div
      className="incoming-book"
      role="dialog"
      aria-modal="true"
      aria-label={t(phase === "importing" ? "importing" : "failed")}
    >
      <div className="incoming-book-content">
        {phase === "importing" ? (
          <>
            <CircleNotch size={26} className="spin" />
            <strong role="status">{t("importing")}</strong>
            <p>{t("waiting")}</p>
          </>
        ) : (
          <>
            <p role="alert">{t("failed")}</p>
            <button
              className="button primary"
              onClick={() => {
                failed.current = null;
                void scan();
              }}
            >
              {t("retry")}
            </button>
            <button
              className="button secondary"
              onClick={async () => {
                try {
                  if (failed.current)
                    await BookImport.complete({ id: failed.current });
                  failed.current = null;
                  setPhase("idle");
                  void scan();
                } catch {
                  setPhase("error");
                }
              }}
            >
              {t("discard")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
