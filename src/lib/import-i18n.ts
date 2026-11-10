import type { Language } from "../types";
const en = {
  browse: "Browse & import PDF",
  hint: "Open a QDL book and download its PDF. On Android, MLibrary imports it and opens the reader. Complete any verification yourself. If QDL needs Chrome, download there and choose Open with / Share to MLibrary. Maximum 50 MB.",
  webHint:
    "Open QDL in your browser, download a PDF, then use Import a book to read it here. Maximum 50 MB.",
  url: "QDL book URL (optional)",
  invalid: "Enter an HTTPS address from qdl.qa.",
  openingError: "The browser could not open. Please try again.",
  importing: "Saving your book for offline reading…",
  failed:
    "The book could not be imported. Check available storage and try again. Only complete PDF, EPUB or TXT files up to 50 MB are supported.",
  retry: "Retry",
  discard: "Dismiss",
  waiting: "Keep the app open until the reader appears.",
};
type Key = keyof typeof en;
const fr: Record<Key, string> = {
  browse: "Parcourir et importer un PDF",
  hint: "Ouvrez un livre QDL et téléchargez son PDF. Sur Android, MLibrary l’importe et ouvre le lecteur. Effectuez la vérification vous-même. Si QDL nécessite Chrome, téléchargez-y le fichier puis choisissez Ouvrir avec / Partager vers MLibrary. Maximum 50 Mo.",
  webHint:
    "Ouvrez QDL dans votre navigateur, téléchargez un PDF puis utilisez Importer un livre pour le lire ici. Maximum 50 Mo.",
  url: "Adresse du livre QDL (facultatif)",
  invalid: "Saisissez une adresse HTTPS de qdl.qa.",
  openingError: "Impossible d’ouvrir le navigateur. Réessayez.",
  importing: "Enregistrement du livre pour la lecture hors ligne…",
  failed:
    "Impossible d’importer le livre. Vérifiez l’espace disponible et réessayez. Seuls les fichiers PDF, EPUB ou TXT complets de 50 Mo maximum sont pris en charge.",
  retry: "Réessayer",
  discard: "Fermer",
  waiting: "Gardez l’application ouverte jusqu’à l’apparition du lecteur.",
};
const ar: Record<Key, string> = {
  browse: "تصفح واستيراد PDF",
  hint: "افتح كتابًا من مكتبة قطر الرقمية ونزّل ملف PDF. على أندرويد يستورده MLibrary ويفتح القارئ. أكمل التحقق بنفسك. إذا تطلب الموقع Chrome، نزّل الملف هناك ثم اختر فتح باستخدام أو مشاركة إلى MLibrary. الحد الأقصى 50 ميغابايت.",
  webHint:
    "افتح مكتبة قطر الرقمية في المتصفح ونزّل ملف PDF، ثم استخدم استيراد كتاب لقراءته هنا. الحد الأقصى 50 ميغابايت.",
  url: "رابط كتاب من مكتبة قطر الرقمية (اختياري)",
  invalid: "أدخل رابط HTTPS من qdl.qa.",
  openingError: "تعذر فتح المتصفح. حاول مجددًا.",
  importing: "جارٍ حفظ الكتاب للقراءة دون اتصال…",
  failed:
    "تعذر استيراد الكتاب. تحقق من المساحة المتاحة وحاول مجددًا. تُدعم فقط ملفات PDF أو EPUB أو TXT الكاملة حتى 50 ميغابايت.",
  retry: "إعادة المحاولة",
  discard: "إغلاق",
  waiting: "أبقِ التطبيق مفتوحًا حتى يظهر القارئ.",
};
export const importText = (language: Language) => (key: Key) =>
  ({ en, fr, ar })[language][key];
