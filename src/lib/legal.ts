/**
 * نصوص الخصوصية والشروط. تصف ما يفعله التطبيق فعلاً (لا وعود غير مطبّقة).
 * جهة الاتّصال: CONTACT_EMAIL، وإلّا واتساب الدعم.
 */
import type { LegalSection } from "@/components/LegalPage";
import type { Lang } from "./domain/types";

export function contactLine(lang: Lang): string {
  const email = process.env.CONTACT_EMAIL;
  const wa = (process.env.SUPPORT_WHATSAPP ?? "").replace(/\D/g, "");
  const parts = [email, wa ? `WhatsApp +${wa}` : null].filter(Boolean).join(" — ");
  if (!parts) return lang === "ar" ? "عبر صفحة الدعم في فضاء العيادة." : "via la page d'assistance de l'espace cabinet.";
  return parts;
}

export function privacyContent(lang: Lang) {
  const c = contactLine(lang);
  if (lang === "fr") {
    return {
      title: "Politique de confidentialité",
      updated: "Mise à jour : octobre 2026",
      intro:
        "Dawri est une file d'attente en ligne pour cabinets médicaux en Algérie. Nous collectons le strict minimum, conformément à la loi n° 18-07 du 10 juin 2018 relative à la protection des personnes physiques dans le traitement des données à caractère personnel.",
      sections: [
        { h: "1. Qui est responsable ?", p: ["Le cabinet où vous prenez un numéro est responsable du traitement de vos données. Dawri agit pour son compte comme sous-traitant technique : nous n'utilisons vos données que pour faire fonctionner la file d'attente."] },
        {
          h: "2. Données des patients",
          p: [
            [
              "Votre nom (ou prénom) et votre numéro de téléphone — pour vous appeler et vous prévenir.",
              "Les horaires de votre ticket (prise, appel, arrivée) — pour estimer l'attente.",
              "Si vous l'activez : l'abonnement aux notifications de votre navigateur, ou votre numéro WhatsApp si vous liez votre ticket.",
            ],
            "Nous ne demandons et n'enregistrons AUCUNE information médicale (motif, symptômes, diagnostic…). Aucun nom n'est affiché sur l'écran de la salle d'attente : seulement des numéros.",
          ],
        },
        {
          h: "3. Durée de conservation",
          p: [
            [
              "Codes de vérification SMS : supprimés après 24 heures.",
              "Données WhatsApp de liaison : supprimées après 2 jours.",
              "Nom et téléphone sur les tickets : effacés après 30 jours (seuls des compteurs anonymes restent pour les statistiques du cabinet).",
              "Historique des absences (pour la règle « absences répétées ») : supprimé après 60 jours.",
            ],
          ],
        },
        { h: "4. Partage", p: ["Vos données ne sont jamais vendues ni utilisées pour de la publicité. Elles sont visibles uniquement par le cabinet concerné. Les messages (SMS, WhatsApp, e-mail) passent par des prestataires techniques qui ne les utilisent que pour l'envoi."] },
        { h: "5. Hébergement et sécurité", p: ["Les données sont hébergées chez des prestataires cloud (base de données Supabase et serveurs Vercel, région Europe — Francfort). Accès chiffré (HTTPS), base fermée à tout accès direct, codes des cabinets stockés sous forme chiffrée (hachage)."] },
        { h: "6. Vos droits", p: [`Vous pouvez demander l'accès, la rectification ou la suppression de vos données auprès du cabinet, ou nous contacter : ${c}. Vous pouvez aussi saisir l'Autorité nationale de protection des données à caractère personnel (ANPDP).`] },
        { h: "7. Données des cabinets", p: ["Pour chaque cabinet : nom, médecin, spécialité, adresse, téléphone, e-mail de récupération et code secret (haché). L'e-mail sert uniquement à récupérer le code oublié et aux informations de service — jamais de publicité."] },
      ] satisfies LegalSection[],
    };
  }
  return {
    title: "سياسة الخصوصية",
    updated: "آخر تحديث: أكتوبر 2026",
    intro:
      "«دوري» طابور إلكتروني للعيادات في الجزائر. نجمع أقلّ قدر ممكن من المعطيات، وفق القانون رقم 18-07 المؤرّخ في 10 يونيو 2018 المتعلّق بحماية الأشخاص الطبيعيين في مجال معالجة المعطيات ذات الطابع الشخصي.",
    sections: [
      { h: "1. من المسؤول؟", p: ["العيادة التي تأخذ فيها رقماً هي المسؤولة عن معالجة معطياتك. و«دوري» يعمل لحسابها كمعالج تقني فقط: لا نستعمل معطياتك إلّا لتشغيل الطابور."] },
      {
        h: "2. معطيات المرضى",
        p: [
          [
            "اسمك ورقم هاتفك — لمناداتك وتنبيهك.",
            "أوقات تذكرتك (الأخذ، النداء، الوصول) — لتقدير مدّة الانتظار.",
            "إن فعّلتها: اشتراك إشعارات المتصفّح، أو رقم واتساب إن ربطت تذكرتك به.",
          ],
          "لا نطلب ولا نحفظ أيّ معلومة طبّية (سبب الزيارة، الأعراض، التشخيص…). ولا يظهر أيّ اسم على شاشة القاعة: أرقام فقط.",
        ],
      },
      {
        h: "3. مدّة الحفظ",
        p: [
          [
            "رموز التحقّق بالرسائل: تُحذف بعد 24 ساعة.",
            "معطيات ربط واتساب: تُحذف بعد يومين.",
            "الاسم والهاتف في التذاكر: يُمحيان بعد 30 يوماً (تبقى أعداد مجهولة فقط لإحصاءات العيادة).",
            "سجلّ الغياب (لقاعدة «الغياب المتكرّر»): يُحذف بعد 60 يوماً.",
          ],
        ],
      },
      { h: "4. المشاركة", p: ["لا نبيع معطياتك أبداً ولا نستعملها للإعلانات. لا يراها إلّا العيادة المعنية. الرسائل (SMS، واتساب، بريد) تمرّ عبر مزوّدين تقنيين لا يستعملونها إلّا للإرسال."] },
      { h: "5. الاستضافة والأمان", p: ["المعطيات مستضافة لدى مزوّدي خدمات سحابية (قاعدة بيانات Supabase وخوادم Vercel، منطقة أوروبا — فرانكفورت). الاتّصال مشفّر (HTTPS)، وقاعدة البيانات مغلقة أمام أيّ وصول مباشر، ورموز العيادات محفوظة مشفّرة (بصمة)."] },
      { h: "6. حقوقك", p: [`يمكنك طلب الاطّلاع على معطياتك أو تصحيحها أو حذفها لدى العيادة، أو التواصل معنا: ${c}. ويمكنك أيضاً اللجوء إلى السلطة الوطنية لحماية المعطيات ذات الطابع الشخصي (ANPDP).`] },
      { h: "7. معطيات العيادات", p: ["لكلّ عيادة: الاسم، الطبيب، التخصّص، العنوان، الهاتف، بريد الاستعادة، والرمز السرّي (مشفّراً). البريد يُستعمل فقط لاستعادة الرمز المنسيّ ولرسائل الخدمة — لا إعلانات أبداً."] },
    ] satisfies LegalSection[],
  };
}

export function termsContent(lang: Lang, price: string, yearPrice: string) {
  const c = contactLine(lang);
  if (lang === "fr") {
    return {
      title: "Conditions d'utilisation",
      updated: "Mise à jour : octobre 2026",
      intro: "En créant un espace cabinet sur Dawri, vous acceptez les conditions suivantes. Elles sont courtes et claires, comme le service.",
      sections: [
        { h: "1. Le service", p: ["Dawri fournit une file d'attente en ligne : prise de numéro par QR code ou lien, écran de la secrétaire, écran de salle d'attente, notifications aux patients et statistiques. Dawri n'est pas un dispositif médical et ne traite aucune donnée médicale."] },
        { h: "2. Essai et abonnement", p: [[`Les 2 premiers mois sont gratuits, sans carte bancaire.`, `Ensuite : ${price} par mois ou ${yearPrice} par an, sans commission par patient.`, "Sans paiement à la fin de la période, les patients ne peuvent plus prendre de numéro en ligne ; vos données restent conservées et l'accès revient dès le paiement.", "Aucun engagement : vous pouvez arrêter à tout moment."]] },
        { h: "3. Vos responsabilités", p: [["Garder votre code secret confidentiel et enregistrer un e-mail de récupération valide.", "Informer vos patients de l'utilisation de Dawri (l'affiche QR fournie le fait).", "Ne saisir aucune information médicale dans les noms des tickets."]] },
        { h: "4. Disponibilité", p: ["Nous faisons le maximum pour que le service fonctionne en continu, mais il dépend d'Internet et de prestataires tiers (hébergement, SMS, WhatsApp). La secrétaire peut toujours ajouter des patients manuellement en cas de problème de réseau côté patient."] },
        { h: "5. Données", p: ["Le traitement des données personnelles est décrit dans la politique de confidentialité. Vous restez propriétaire des données de votre cabinet ; sur demande, nous les supprimons."] },
        { h: "6. Contact", p: [c] },
      ] satisfies LegalSection[],
    };
  }
  return {
    title: "شروط الاستعمال",
    updated: "آخر تحديث: أكتوبر 2026",
    intro: "بإنشاء فضاء عيادة على «دوري» فإنّك توافق على الشروط التالية. قصيرة وواضحة، مثل الخدمة.",
    sections: [
      { h: "1. الخدمة", p: ["«دوري» يوفّر طابوراً إلكترونياً: أخذ الرقم برمز QR أو رابط، شاشة السكرتيرة، شاشة القاعة، تنبيهات المرضى والإحصاءات. «دوري» ليس جهازاً طبّياً ولا يعالج أيّ معلومة طبّية."] },
      { h: "2. التجربة والاشتراك", p: [["أوّل شهرين مجّاناً، بلا بطاقة بنكية.", `بعدها: ${price} شهرياً أو ${yearPrice} سنوياً، بلا أيّ عمولة على المرضى.`, "إن لم يُدفع الاشتراك بعد انتهاء المدّة، يتوقّف أخذ الأرقام عبر الإنترنت؛ تبقى معطياتك محفوظة ويعود كلّ شيء فور الدفع.", "بلا التزام: تستطيع التوقّف متى شئت."]] },
      { h: "3. مسؤولياتك", p: [["الحفاظ على سرّية الرمز السرّي وتسجيل بريد استعادة صحيح.", "إعلام مرضاك باستعمال «دوري» (الملصق المطبوع يفعل ذلك).", "عدم كتابة أيّ معلومة طبّية في أسماء التذاكر."]] },
      { h: "4. التوفّر", p: ["نبذل أقصى جهدنا ليعمل الدوري دون انقطاع، لكنّه يعتمد على الإنترنت وعلى مزوّدين خارجيين (الاستضافة، الرسائل، واتساب). تستطيع السكرتيرة دائماً إضافة المرضى يدوياً عند أيّ مشكلة شبكة لدى المريض."] },
      { h: "5. المعطيات", p: ["معالجة المعطيات الشخصية موضّحة في سياسة الخصوصية. تبقى أنت مالك معطيات عيادتك، ونحذفها عند الطلب."] },
      { h: "6. التواصل", p: [c] },
    ] satisfies LegalSection[],
  };
}
