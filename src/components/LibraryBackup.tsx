import { useRef, useState } from "react";
import {
  CloudArrowUp,
  DownloadSimple,
  UploadSimple,
} from "@phosphor-icons/react";
import type { AppState } from "../types";
import {
  createBackup,
  inspectBackup,
  restoreBackup,
  shareBackup,
} from "../lib/library-backup";
import type { PreparedBackup } from "../lib/library-backup";
import { newSyncKey } from "../lib/library-sync";
import type { LibraryUpdate, useLibrarySync } from "../lib/use-library-sync";
import { Modal } from "../App";

const translations = {
  en: [
    "Backup & device sync",
    "Keep your library with you",
    "Export backup",
    "Restore backup",
    "Include downloaded book files",
    "Your backup contains personal notes and books. Store it somewhere private.",
    "Merge this backup",
    "Cancel",
    "Private device sync",
    "Sync shelves, progress, highlights and quote designs. Book files travel in backups, not cloud sync. Encrypted storage: 2 MiB.",
    "Create a sync key",
    "Connect another device",
    "Recovery key",
    "I saved this key somewhere private. Anyone with it can access my synced library.",
    "Enable sync",
    "Connect",
    "Sync now",
    "Disconnect this device",
    "Show recovery key",
    "Delete cloud copy",
    "Disconnect all other devices first; connected devices can upload their library again.",
    "Delete permanently",
    "Backup ready",
    "Backup restored",
    "books",
    "notes",
    "offline files",
    "Last synced",
    "Working…",
    "Close",
    "Copy key",
    "Copied",
    "Cloud data cannot be recovered if you lose this key. Local books and notes stay on this device.",
  ],
  fr: [
    "Sauvegarde et synchronisation",
    "Votre bibliothèque vous accompagne",
    "Exporter",
    "Restaurer",
    "Inclure les livres téléchargés",
    "Cette sauvegarde contient vos notes et livres personnels. Conservez-la en lieu sûr.",
    "Fusionner cette sauvegarde",
    "Annuler",
    "Synchronisation privée",
    "Synchronisez étagères, progression, surlignages et citations. Les fichiers des livres passent par les sauvegardes. Stockage chiffré : 2 Mio.",
    "Créer une clé",
    "Connecter un appareil",
    "Clé de récupération",
    "J’ai conservé cette clé en lieu sûr. Toute personne qui la possède peut accéder à ma bibliothèque synchronisée.",
    "Activer",
    "Connecter",
    "Synchroniser",
    "Déconnecter cet appareil",
    "Afficher la clé",
    "Supprimer la copie en ligne",
    "Déconnectez d’abord les autres appareils, qui pourraient envoyer à nouveau leur bibliothèque.",
    "Supprimer définitivement",
    "Sauvegarde prête",
    "Sauvegarde restaurée",
    "livres",
    "notes",
    "fichiers hors ligne",
    "Dernière synchronisation",
    "En cours…",
    "Fermer",
    "Copier la clé",
    "Copié",
    "Sans cette clé, les données en ligne sont irrécupérables. Les livres et notes restent sur cet appareil.",
  ],
  ar: [
    "النسخ الاحتياطي والمزامنة",
    "مكتبتك معك أينما كنت",
    "تصدير نسخة",
    "استعادة نسخة",
    "تضمين ملفات الكتب المحمّلة",
    "تحتوي النسخة على كتبك وملاحظاتك الشخصية. احفظها في مكان خاص.",
    "دمج هذه النسخة",
    "إلغاء",
    "مزامنة خاصة",
    "زامن المكتبة والتقدم والتظليل وتصاميم الاقتباسات. تُنقل ملفات الكتب بالنسخ الاحتياطية. التخزين المشفّر: ٢ ميبيبايت.",
    "إنشاء مفتاح",
    "ربط جهاز آخر",
    "مفتاح الاستعادة",
    "حفظت هذا المفتاح في مكان خاص. من يملكه يستطيع الوصول إلى مكتبتي المتزامنة.",
    "تفعيل المزامنة",
    "ربط الجهاز",
    "مزامنة الآن",
    "فصل هذا الجهاز",
    "إظهار المفتاح",
    "حذف النسخة السحابية",
    "افصل الأجهزة الأخرى أولاً؛ فقد ترفع المكتبة مجددًا.",
    "حذف نهائي",
    "النسخة جاهزة",
    "تمت الاستعادة",
    "كتب",
    "ملاحظات",
    "ملفات دون اتصال",
    "آخر مزامنة",
    "جارٍ العمل…",
    "إغلاق",
    "نسخ المفتاح",
    "تم النسخ",
    "لا يمكن استرجاع البيانات السحابية دون المفتاح. تبقى الكتب والملاحظات على هذا الجهاز.",
  ],
};
export function LibraryBackup({
  state,
  update,
  sync,
}: {
  state: AppState;
  update: LibraryUpdate;
  sync: ReturnType<typeof useLibrarySync>;
}) {
  const t = translations[state.language];
  const [open, setOpen] = useState(false),
    [includeBooks, setIncludeBooks] = useState(true);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [prepared, setPrepared] = useState<PreparedBackup>();
  const [draft, setDraft] = useState(""),
    [mode, setMode] = useState<"create" | "join" | "">("");
  const [saved, setSaved] = useState(false),
    [reveal, setReveal] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    latest = useRef(state);
  latest.current = state;
  const work = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backup failed");
    } finally {
      setBusy(false);
    }
  };
  const locked = busy || sync.busy;
  return (
    <section className="library-backup" aria-label={t[0]}>
      <button
        className="backup-heading"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <CloudArrowUp size={23} />
        <span>
          <strong>{t[0]}</strong>
          <small>{t[1]}</small>
        </span>
        <span>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="backup-body">
          <div className="backup-columns">
            <div>
              <label className="backup-check">
                <input
                  type="checkbox"
                  checked={includeBooks}
                  disabled={locked}
                  onChange={(e) => setIncludeBooks(e.target.checked)}
                />
                {t[4]}
              </label>
              <p>{t[5]}</p>
              <div className="backup-actions">
                <button
                  className="button primary"
                  disabled={locked}
                  onClick={() =>
                    void work(async () => {
                      const blob = await createBackup(
                        latest.current,
                        includeBooks,
                        setMessage,
                      );
                      await shareBackup(blob);
                      setMessage(t[22]);
                    })
                  }
                >
                  <DownloadSimple size={18} />
                  {t[2]}
                </button>
                <button
                  className="button secondary"
                  disabled={locked}
                  onClick={() => input.current?.click()}
                >
                  <UploadSimple size={18} />
                  {t[3]}
                </button>
                <input
                  ref={input}
                  type="file"
                  accept=".zip,.json"
                  className="visually-hidden"
                  aria-label={t[3]}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file)
                      void work(async () =>
                        setPrepared(await inspectBackup(file)),
                      );
                  }}
                />
              </div>
            </div>
            <div>
              <h3>{t[8]}</h3>
              <p>{t[9]}</p>
              {!sync.key ? (
                <div className="backup-actions">
                  <button
                    className="button secondary"
                    disabled={locked}
                    onClick={() => {
                      setDraft(newSyncKey());
                      setMode("create");
                      setSaved(false);
                    }}
                  >
                    {t[10]}
                  </button>
                  <button
                    className="button secondary"
                    disabled={locked}
                    onClick={() => {
                      setDraft("");
                      setMode("join");
                    }}
                  >
                    {t[11]}
                  </button>
                </div>
              ) : (
                <>
                  <div className="backup-actions">
                    <button
                      className="button primary"
                      disabled={locked}
                      onClick={() => void sync.sync()}
                    >
                      {t[16]}
                    </button>
                    <button
                      className="button secondary"
                      disabled={locked}
                      onClick={() => setReveal(!reveal)}
                    >
                      {t[18]}
                    </button>
                    <button
                      className="text-button"
                      disabled={locked}
                      onClick={sync.disconnect}
                    >
                      {t[17]}
                    </button>
                  </div>
                  {sync.last && (
                    <small>
                      {t[27]}: {sync.last}
                    </small>
                  )}
                  {reveal && (
                    <div className="recovery-key">
                      <label>
                        {t[12]}
                        <input
                          readOnly
                          value={sync.key}
                          dir="ltr"
                          onFocus={(e) => e.target.select()}
                        />
                      </label>
                      <p>{t[32]}</p>
                      <button
                        className="button secondary"
                        onClick={() =>
                          void work(async () => {
                            await navigator.clipboard.writeText(sync.key);
                            setMessage(t[31]);
                          })
                        }
                      >
                        {t[30]}
                      </button>
                    </div>
                  )}
                  <button
                    className="text-button"
                    disabled={locked}
                    onClick={() => setConfirmDelete(true)}
                  >
                    {t[19]}
                  </button>
                  {confirmDelete && (
                    <div className="backup-confirm">
                      <p>{t[20]}</p>
                      <div className="backup-actions">
                        <button
                          className="button secondary"
                          disabled={locked}
                          onClick={() => {
                            void sync.remove();
                            setConfirmDelete(false);
                          }}
                        >
                          {t[21]}
                        </button>
                        <button
                          className="button secondary"
                          disabled={locked}
                          onClick={() => setConfirmDelete(false)}
                        >
                          {t[7]}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
              {mode && !sync.key && (
                <div className="recovery-key">
                  <label>
                    {t[12]}
                    <input
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      dir="ltr"
                      value={draft}
                      readOnly={mode === "create"}
                      onChange={(e) => setDraft(e.target.value.trim())}
                      onFocus={(e) => e.target.select()}
                    />
                  </label>
                  <p>{t[32]}</p>
                  {mode === "create" && (
                    <>
                      <button
                        className="text-button"
                        onClick={() =>
                          void work(async () => {
                            await navigator.clipboard.writeText(draft);
                            setMessage(t[31]);
                          })
                        }
                      >
                        {t[30]}
                      </button>
                      <label className="backup-check">
                        <input
                          type="checkbox"
                          checked={saved}
                          onChange={(e) => setSaved(e.target.checked)}
                        />
                        {t[13]}
                      </label>
                    </>
                  )}
                  <div className="backup-actions">
                    <button
                      className="button primary"
                      disabled={
                        locked || !draft || (mode === "create" && !saved)
                      }
                      onClick={async () => {
                        if (await sync.sync(draft, mode === "join")) {
                          setMode("");
                          setDraft("");
                        }
                      }}
                    >
                      {mode === "create" ? t[14] : t[15]}
                    </button>
                    <button
                      className="button secondary"
                      disabled={locked}
                      onClick={() => {
                        setMode("");
                        setDraft("");
                      }}
                    >
                      {t[7]}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          {(busy || sync.busy || message) && (
            <p className="backup-status" role="status">
              {busy || sync.busy ? t[28] : ""} {message}
            </p>
          )}
          {(error || sync.error) && (
            <p className="backup-error" role="alert">
              {error || sync.error}
            </p>
          )}
        </div>
      )}
      {prepared && (
        <Modal label={t[3]} onClose={() => !busy && setPrepared(undefined)}>
          <section className="backup-restore">
            <h2>{t[3]}</h2>
            <p>
              {Object.keys(prepared.state.shelf).length} {t[24]} ·{" "}
              {Object.keys(prepared.state.marks).length} {t[25]} ·{" "}
              {prepared.files.size} {t[26]}
            </p>
            <p>{t[5]}</p>
            <div className="backup-actions">
              <button
                className="button primary"
                disabled={locked}
                onClick={() =>
                  void work(async () => {
                    const next = await restoreBackup(prepared, latest.current);
                    update(() => next, true);
                    setPrepared(undefined);
                    setMessage(t[23]);
                  })
                }
              >
                {t[6]}
              </button>
              <button
                className="button secondary"
                disabled={locked}
                onClick={() => setPrepared(undefined)}
              >
                {t[7]}
              </button>
            </div>
            {error && <p role="alert">{error}</p>}
          </section>
        </Modal>
      )}
    </section>
  );
}
