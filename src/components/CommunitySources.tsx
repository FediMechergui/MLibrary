import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import type { Book, Language } from "../types";
import { API, importCommunityBook } from "../lib/api";
import { openNativeSource } from "../lib/source-view";

const copy = {
  en: {
    link: "Book page link",
    import: "Download & read",
    busy: "Finding the edition…",
    query: "Title or author",
    search: "Search & import",
    domain: "Provider address",
    native:
      "Complete any verification in the browser, then choose an available EPUB or PDF. A successful download opens automatically in your MLibrary reader.",
    web: "Download an available EPUB or PDF from the provider, then use Import in MLibrary to read it here.",
    monitor: "Provider status · Open SLUM",
    note: "PROTECTED means browser verification. UP does not guarantee a readable book.",
    unknown: "Status unavailable",
    opening: "Could not open the provider. Try its website in your browser.",
    support: "Original publisher credits stay in the downloaded edition.",
  },
  fr: {
    link: "Lien de la page du livre",
    import: "Télécharger et lire",
    busy: "Recherche de l’édition…",
    query: "Titre ou auteur",
    search: "Rechercher et importer",
    domain: "Adresse du fournisseur",
    native:
      "Effectuez la vérification dans le navigateur, puis choisissez un EPUB ou PDF disponible. Le téléchargement s’ouvre automatiquement dans le lecteur MLibrary.",
    web: "Téléchargez un EPUB ou PDF disponible chez le fournisseur, puis utilisez Importer dans MLibrary pour le lire ici.",
    monitor: "État du fournisseur · Open SLUM",
    note: "PROTECTED indique une vérification. UP ne garantit pas un livre lisible.",
    unknown: "État indisponible",
    opening:
      "Impossible d’ouvrir la source. Essayez son site dans votre navigateur.",
    support: "Les crédits d’origine restent dans l’édition téléchargée.",
  },
  ar: {
    link: "رابط صفحة الكتاب",
    import: "تنزيل وقراءة",
    busy: "جارٍ البحث عن النسخة…",
    query: "العنوان أو المؤلف",
    search: "بحث واستيراد",
    domain: "عنوان المصدر",
    native:
      "أكمل التحقق في المتصفح ثم اختر ملف EPUB أو PDF متاحًا. يفتح التنزيل الناجح تلقائيًا في قارئ MLibrary.",
    web: "نزّل ملف EPUB أو PDF متاحًا من المصدر ثم استخدم الاستيراد في MLibrary للقراءة هنا.",
    monitor: "حالة المصدر · Open SLUM",
    note: "تعني PROTECTED أن التحقق مطلوب. لا تضمن UP إمكانية تنزيل الكتاب.",
    unknown: "الحالة غير متاحة",
    opening: "تعذر فتح المصدر. جرّب موقعه في متصفحك.",
    support: "تبقى حقوق وبيانات الناشر الأصلي في النسخة المنزّلة.",
  },
};
export function CommunityImport({
  source,
  language,
  onRead,
}: {
  source: string;
  language: Language;
  onRead: (book: Book) => void;
}) {
  const t = copy[language],
    [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const samples: Record<string, string> = {
    unglue: "https://unglue.it/work/140714/",
    fadedpage: "https://www.fadedpage.com/showbook.php?pid=20140519",
    globalgrey:
      "https://www.globalgreyebooks.com/book-page/on-liberty-ebook.html",
  };
  return (
    <form
      className="publisher-import"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          onRead((await importCommunityBook(url.trim())).book);
        } catch (e) {
          setError(e instanceof Error ? e.message : t.opening);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="source-field">
        <span>{t.link}</span>
        <input
          type="url"
          required
          dir="ltr"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={samples[source]}
        />
      </label>
      <p className="source-hint">{t.support}</p>
      <button className="button primary" disabled={busy}>
        {busy ? t.busy : t.import}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
const domains = ["annas-archive.gd", "annas-archive.gl", "annas-archive.pk"];
type Monitor = {
  domains: { domain: string; status: string }[];
  checkedAt?: string;
  stale?: boolean;
};
export function AnnaLibrary({
  language,
  initialQuery = "",
}: {
  language: Language;
  initialQuery?: string;
}) {
  const t = copy[language],
    [q, setQ] = useState(initialQuery),
    [domain, setDomain] = useState(domains[0]),
    [error, setError] = useState(""),
    [monitor, setMonitor] = useState<Monitor | null>(null);
  const native = Capacitor.isNativePlatform();
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${API}/api/source-monitor`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then(setMonitor)
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return (
    <form
      className="qdl-import"
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        const url = new URL(`https://${domain}/search`);
        url.search = new URLSearchParams({
          q: q.trim(),
          lang: language,
        }).toString();
        if (native)
          void openNativeSource(url.href, language).catch(() =>
            setError(t.opening),
          );
        else window.open(url.href, "_blank", "noopener,noreferrer");
      }}
    >
      <p>{t[native ? "native" : "web"]}</p>
      <label className="source-field">
        <span>{t.query}</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={200}
        />
      </label>
      <label className="source-field">
        <span>{t.domain}</span>
        <select value={domain} onChange={(e) => setDomain(e.target.value)}>
          {domains.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
      <button className="button primary">{t.search}</button>
      <details>
        <summary>{t.monitor}</summary>
        <p>{t.note}</p>
        {monitor?.checkedAt && (
          <small>{new Date(monitor.checkedAt).toLocaleString(language)}</small>
        )}
        <ul>
          {domains.map((d) => (
            <li key={d}>
              <span dir="ltr">{d}</span>:{" "}
              {monitor?.stale
                ? t.unknown
                : monitor?.domains.find((s) => s.domain === d)?.status ||
                  t.unknown}
            </li>
          ))}
        </ul>
        <a href="https://open-slum.org/" target="_blank" rel="noreferrer">
          Open SLUM
        </a>
      </details>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
