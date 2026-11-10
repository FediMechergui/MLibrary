import type { Language } from "../types";
const en = {
  collectionLink: "Library book link",
  safahatHint:
    "Paste a Safahat or Hindawi book page. Its public PDF downloads and opens here (up to 32 MB). Some files remain unavailable.",
  gallicaHint:
    "Paste a Gallica book link from the imported French collection, or use Search this library. Other Gallica editions are not yet available here.",
  repositoryLink: "Repository book link",
  repositoryHint:
    "Paste an OAPEN or DOAB book page. Supported public editions download and open in your reader.",
  findingBook: "Finding the book…",
  bookLink: "Standard Ebooks book link",
  linkHint:
    "Paste an individual book page. Its EPUB downloads into My Library and opens automatically.",
  opening: "Finding the EPUB…",
  downloadRead: "Download & read",
  settings: "Source settings & help",
  enabled: "Include in all-source search",
  format: "Download format",
  auto: "Automatic",
  text: "Text (smaller download)",
  epub: "EPUB (adjustable text)",
  pdf: "PDF (original pages)",
  fallback: "Fallback library",
  language: "Search language",
  all: "All languages",
  finding: "What we tested",
  solution: "How to read",
  checked: "Checked",
  working: "Reader tested",
  limited: "Some editions unavailable",
  blocked: "Access challenge",
  directory: "Collection link",
  search: "Search this library",
  alternate: "Search fallback library",
  import: "Import a book",
  visit: "Source information",
  note: "Settings are saved on this device. A downloaded copy opens in the MLibrary reader.",
  choose: "Try another format",
  saved:
    "Existing offline copies keep their format. New downloads use this choice.",
  formatHint:
    "Choosing a different format starts at the beginning. Saved quotes remain in My Quotes.",
  unavailable: "This format is unavailable. Try Automatic or another edition.",
  restricted:
    "The source requires borrowing or authorization for this edition.",
  noEdition:
    "No public download was found in this language. Try another edition or import your copy.",
  missing: "The source no longer provides this edition.",
  retry: "Retry download",
  noFile: "No supported public book file was found.",
  searchHelp: "Source settings",
  selection: "Search selected libraries",
  empty:
    "All connected libraries are disabled. Enable one in Sources or select a specific library.",
};
type Key = keyof typeof en;
const fr: Record<Key, string> = {
  collectionLink: "Lien du livre",
  safahatHint:
    "Collez la page d’un livre Safahat ou Hindawi. Son PDF public est téléchargé et ouvert ici (32 Mo maximum). Certains fichiers restent indisponibles.",
  gallicaHint:
    "Collez le lien d’un livre du corpus français importé ou cherchez dans cette bibliothèque. Les autres éditions Gallica ne sont pas encore disponibles ici.",
  repositoryLink: "Lien du livre du dépôt",
  repositoryHint:
    "Collez la page d’un livre OAPEN ou DOAB. Les éditions publiques compatibles sont téléchargées et ouvertes dans le lecteur.",
  findingBook: "Recherche du livre…",
  bookLink: "Lien du livre Standard Ebooks",
  linkHint:
    "Collez la page d’un livre. Son EPUB est téléchargé dans Ma bibliothèque et s’ouvre automatiquement.",
  opening: "Recherche de l’EPUB…",
  downloadRead: "Télécharger et lire",
  settings: "Réglages et aide",
  enabled: "Inclure dans la recherche globale",
  format: "Format de téléchargement",
  auto: "Automatique",
  text: "Texte (fichier léger)",
  epub: "EPUB (texte adaptable)",
  pdf: "PDF (pages originales)",
  fallback: "Bibliothèque de secours",
  language: "Langue de recherche",
  all: "Toutes les langues",
  finding: "Résultat du test",
  solution: "Comment lire",
  checked: "Vérifié le",
  working: "Lecture testée",
  limited: "Certaines éditions indisponibles",
  blocked: "Vérification d’accès",
  directory: "Lien vers la collection",
  search: "Rechercher dans cette bibliothèque",
  alternate: "Rechercher dans la bibliothèque de secours",
  import: "Importer un livre",
  visit: "Informations sur la source",
  note: "Ces réglages sont enregistrés sur cet appareil. Les fichiers importés s’ouvrent dans le lecteur MLibrary.",
  choose: "Essayer un autre format",
  saved:
    "Les copies hors ligne gardent leur format. Ce choix s’applique aux nouveaux téléchargements.",
  formatHint:
    "Changer de format reprend au début. Vos citations restent dans Mes citations.",
  unavailable:
    "Ce format est indisponible. Essayez Automatique ou une autre édition.",
  restricted:
    "Cette édition nécessite un emprunt ou une autorisation de la source.",
  noEdition:
    "Aucun téléchargement public trouvé dans cette langue. Essayez une autre édition ou importez votre copie.",
  missing: "La source ne propose plus cette édition.",
  retry: "Réessayer le téléchargement",
  noFile: "Aucun fichier public compatible n’a été trouvé.",
  searchHelp: "Réglages des sources",
  selection: "Rechercher dans les bibliothèques sélectionnées",
  empty:
    "Toutes les bibliothèques sont désactivées. Activez-en une dans Sources ou sélectionnez une bibliothèque précise.",
};
const ar: Record<Key, string> = {
  collectionLink: "رابط الكتاب",
  safahatHint:
    "ألصق صفحة كتاب من صفحات أو هنداوي لتنزيل ملف PDF العام وفتحه هنا (حتى ٣٢ ميغابايت). بعض الملفات غير متاحة.",
  gallicaHint:
    "ألصق رابط كتاب من مجموعة غاليكا الفرنسية المستوردة أو ابحث في هذه المكتبة. الطبعات الأخرى غير متاحة هنا بعد.",
  repositoryLink: "رابط كتاب المستودع",
  repositoryHint:
    "الصق صفحة كتاب من OAPEN أو DOAB. تُنزّل النسخ العامة المدعومة وتُفتح داخل القارئ.",
  findingBook: "جارٍ البحث عن الكتاب…",
  bookLink: "رابط كتاب Standard Ebooks",
  linkHint: "الصق صفحة كتاب. يُنزّل ملف EPUB إلى مكتبتي ويُفتح تلقائياً.",
  opening: "البحث عن ملف EPUB…",
  downloadRead: "تنزيل وقراءة",
  settings: "إعدادات المصدر والمساعدة",
  enabled: "تضمين في البحث الشامل",
  format: "صيغة التنزيل",
  auto: "تلقائي",
  text: "نص (تنزيل أصغر)",
  epub: "EPUB (نص قابل للتعديل)",
  pdf: "PDF (الصفحات الأصلية)",
  fallback: "المكتبة البديلة",
  language: "لغة البحث",
  all: "كل اللغات",
  finding: "نتيجة الاختبار",
  solution: "طريقة القراءة",
  checked: "تم التحقق في",
  working: "تم اختبار القراءة",
  limited: "بعض الطبعات غير متاحة",
  blocked: "يتطلب التحقق من الوصول",
  directory: "رابط المجموعة",
  search: "البحث في هذه المكتبة",
  alternate: "البحث في المكتبة البديلة",
  import: "استيراد كتاب",
  visit: "معلومات المصدر",
  note: "تُحفظ الإعدادات على هذا الجهاز. تُفتح الملفات المستوردة في قارئ MLibrary.",
  choose: "تجربة صيغة أخرى",
  saved:
    "تحتفظ النسخ المحفوظة بصيغتها. ينطبق هذا الاختيار على التنزيلات الجديدة.",
  formatHint:
    "تغيير الصيغة يعيد القراءة إلى البداية. تبقى اقتباساتك في قسم اقتباساتي.",
  unavailable: "هذه الصيغة غير متاحة. جرّب تلقائي أو طبعة أخرى.",
  restricted: "تتطلب هذه الطبعة الاستعارة أو إذناً من المصدر.",
  noEdition:
    "لم يُعثر على تنزيل عام بهذه اللغة. جرّب طبعة أخرى أو استورد نسختك.",
  missing: "لم تعد هذه الطبعة متاحة لدى المصدر.",
  retry: "إعادة التنزيل",
  noFile: "لم يُعثر على ملف كتاب عام مدعوم.",
  searchHelp: "إعدادات المصادر",
  selection: "البحث في المكتبات المحددة",
  empty: "جميع المكتبات معطلة. فعّل مكتبة في المصادر أو اختر مكتبة محددة.",
};
export const sourceText = (language: Language) => (key: Key) =>
  ({ en, fr, ar })[language][key];
