/**
 * Spell a whole LBP amount in Arabic words for the printed bill, e.g.
 * 7_589_000 -> "سبعة ملايين و خمسمئة و تسعة و ثمانون ألف ليرة لبنانية فقط".
 * Deliberately simplified (nominative forms, no case/gender fine-tuning) to
 * match the wording style of the V1 bills.
 */

const ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
const TENS = ["", "عشرة", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const TEENS = [
  "عشرة",
  "أحد عشر",
  "اثنا عشر",
  "ثلاثة عشر",
  "أربعة عشر",
  "خمسة عشر",
  "ستة عشر",
  "سبعة عشر",
  "ثمانية عشر",
  "تسعة عشر"
];
const HUNDREDS = ["", "مئة", "مئتان", "ثلاثمئة", "أربعمئة", "خمسمئة", "ستمئة", "سبعمئة", "ثمانمئة", "تسعمئة"];

function underThousand(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h > 0) parts.push(HUNDREDS[h]);
  if (rest >= 10 && rest < 20) {
    parts.push(TEENS[rest - 10]);
  } else if (rest >= 20) {
    const t = Math.floor(rest / 10);
    const o = rest % 10;
    parts.push(o > 0 ? `${ONES[o]} و ${TENS[t]}` : TENS[t]);
  } else if (rest > 0) {
    parts.push(ONES[rest]);
  }
  return parts.join(" و ");
}

function scaleWord(count: number, forms: [string, string, string, string]): string {
  // forms: [singular, dual, plural(3-10), plural(11+)]
  if (count === 1) return forms[0];
  if (count === 2) return forms[1];
  if (count >= 3 && count <= 10) return forms[2];
  return forms[3];
}

export function amountToArabicWords(value: number): string {
  const n = Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
  if (n === 0) return "صفر ليرة لبنانية فقط";

  const groups: number[] = [];
  let rem = n;
  while (rem > 0) {
    groups.push(rem % 1000);
    rem = Math.floor(rem / 1000);
  }

  const scales: Array<[string, string, string, string] | null> = [
    null,
    ["ألف", "ألفان", "آلاف", "ألف"],
    ["مليون", "مليونان", "ملايين", "مليون"],
    ["مليار", "ملياران", "مليارات", "مليار"]
  ];

  const chunks: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) continue;
    if (i === 0) {
      chunks.push(underThousand(g));
    } else {
      const forms = scales[i];
      if (!forms) continue;
      const w = scaleWord(g, forms);
      // "ألف"/"ألفان" and "مليون"/"مليونان" stand alone; 3-10 use "<words> <plural>";
      // 11+ use "<words> <singular>".
      if (g === 1 || g === 2) chunks.push(w);
      else chunks.push(`${underThousand(g)} ${w}`);
    }
  }

  return `${chunks.join(" و ")} ليرة لبنانية فقط`;
}
