/**
 * create-ddx-definitions.ts
 *
 * Phase 1c: 建立 DDX 定義 YAML 檔案
 *  - data/ddx/symptoms.yaml — 69 個症狀定義
 *  - data/ddx/lab-findings.yaml — 55 個實驗室指標定義
 *  - data/ddx/related-symptoms.yaml — 症狀關聯
 *  - data/ddx/symptom-lab-links.yaml — 症狀↔實驗室連結
 *  - data/ddx/keyword-to-symptom.yaml — 中文關鍵字映射
 *
 * Usage: pnpm tsx scripts/create-ddx-definitions.ts
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";

const EXTRACTED_DIR = path.join(__dirname, "book-data", "extracted");
const DDX_DIR = path.join(__dirname, "..", "data", "ddx");

fs.mkdirSync(DDX_DIR, { recursive: true });

console.log("=== Creating DDX Definition Files ===\n");

// ── 1. symptoms.yaml ──
const symptoms: Array<{
  id: string;
  zhName: string;
  enName: string;
  section: string;
  sectionName: string;
  description: string;
  differentialCount: number;
}> = JSON.parse(
  fs.readFileSync(path.join(EXTRACTED_DIR, "symptoms.json"), "utf8")
);

const symptomsYaml = symptoms.map((s) => ({
  id: s.id,
  zhName: s.zhName,
  enName: s.enName,
  section: s.section,
  sectionName: s.sectionName,
  description: s.description,
}));

fs.writeFileSync(
  path.join(DDX_DIR, "symptoms.yaml"),
  yaml.dump(symptomsYaml, { lineWidth: 120, noRefs: true })
);
console.log("  → symptoms.yaml:", symptomsYaml.length, "symptoms");

// ── 2. lab-findings.yaml ──
const labFindings: Array<{
  id: string;
  zhName: string;
  enName: string;
  category: string;
  differentialCount: number;
}> = JSON.parse(
  fs.readFileSync(path.join(EXTRACTED_DIR, "lab-findings.json"), "utf8")
);

const labFindingsYaml = labFindings.map((l) => ({
  id: l.id,
  zhName: l.zhName,
  enName: l.enName,
  category: l.category,
}));

fs.writeFileSync(
  path.join(DDX_DIR, "lab-findings.yaml"),
  yaml.dump(labFindingsYaml, { lineWidth: 120, noRefs: true })
);
console.log("  → lab-findings.yaml:", labFindingsYaml.length, "lab findings");

// ── 3. related-symptoms.yaml ──
const relatedSymptoms: Record<string, string[]> = JSON.parse(
  fs.readFileSync(path.join(EXTRACTED_DIR, "related-symptoms.json"), "utf8")
);

fs.writeFileSync(
  path.join(DDX_DIR, "related-symptoms.yaml"),
  yaml.dump(relatedSymptoms, { lineWidth: 120, noRefs: true })
);
console.log(
  "  → related-symptoms.yaml:",
  Object.keys(relatedSymptoms).length,
  "symptom pairs"
);

// ── 4. symptom-lab-links.yaml ──
const symptomLabLinks: Record<string, string[]> = JSON.parse(
  fs.readFileSync(path.join(EXTRACTED_DIR, "symptom-lab-links.json"), "utf8")
);

fs.writeFileSync(
  path.join(DDX_DIR, "symptom-lab-links.yaml"),
  yaml.dump(symptomLabLinks, { lineWidth: 120, noRefs: true })
);
console.log(
  "  → symptom-lab-links.yaml:",
  Object.keys(symptomLabLinks).length,
  "entries"
);

// ── 5. keyword-to-symptom.yaml ──
// The full KEYWORD_TO_SYMPTOM mapping from HANDOVER
const KEYWORD_TO_SYMPTOM: Record<string, string> = {
  // === 全身性/代謝 ===
  "多尿多渴": "polyuria-polydipsia",
  "PU/PD": "polyuria-polydipsia",
  "多尿": "polyuria-polydipsia",
  "多渴": "polyuria-polydipsia",
  "喝很多水": "polyuria-polydipsia",
  "體重減輕": "weight-loss",
  "消瘦": "weight-loss",
  "體重下降": "weight-loss",
  "削瘦": "weight-loss",
  "體重增加": "weight-gain",
  "肥胖": "weight-gain",
  "多食": "polyphagia",
  "多食症": "polyphagia",
  "食慾增加": "polyphagia",
  "厭食": "anorexia",
  "食慾下降": "anorexia",
  "食慾降低": "anorexia",
  "不吃": "anorexia",
  "拒食": "anorexia",
  "食慾不振": "anorexia",
  "食慾廢絕": "anorexia",
  "生長遲滯": "failure-to-grow",
  "發育不良": "failure-to-grow",
  "生長緩慢": "failure-to-grow",
  "昏厥": "syncope",
  "暈倒": "syncope",
  "倒地": "syncope",
  "虛弱": "weakness",
  "無力": "weakness",
  "虛脫": "weakness",
  "精神差": "weakness",
  "嗜睡": "weakness",
  "精神抑鬱": "weakness",
  "活動力下降": "weakness",
  "疲倦": "weakness",
  "體溫過高": "hyperthermia",
  "發燒": "hyperthermia",
  "高體溫": "hyperthermia",
  "高燒": "hyperthermia",
  "發熱": "hyperthermia",
  "體溫升高": "hyperthermia",
  "運動不耐": "exercise-intolerance",
  // === 呼吸 ===
  "呼吸困難": "dyspnoea",
  "喘": "dyspnoea",
  "開口呼吸": "dyspnoea",
  "張口呼吸": "dyspnoea",
  "端坐呼吸": "dyspnoea",
  "呼吸急促": "dyspnoea",
  "呼吸費力": "dyspnoea",
  "咳嗽": "coughing",
  "乾咳": "coughing",
  "濕咳": "coughing",
  "咳血": "haemoptysis",
  "喘鳴": "stertor-stridor",
  "吸氣音異常": "stertor-stridor",
  // === 消化 ===
  "吞嚥困難": "dysphagia",
  "無法進食": "dysphagia",
  "進食困難": "dysphagia",
  "吐回食物": "regurgitation",
  "回流": "regurgitation",
  "嘔吐": "vomiting",
  "乾嘔": "vomiting",
  "腹瀉": "diarrhoea",
  "軟便": "diarrhoea",
  "水樣腹瀉": "diarrhoea",
  "水瀉": "diarrhoea",
  "黑便": "melaena",
  "柏油便": "melaena",
  "血便": "haematochezia",
  "鮮血便": "haematochezia",
  "吐血": "haematemesis",
  "嘔血": "haematemesis",
  "便秘": "constipation",
  "排便困難": "constipation",
  "脹氣": "flatulence",
  "作嘔": "gagging",
  "腹部膨大": "abdominal-distension",
  "腹部膨脹": "abdominal-distension",
  "腹部脹大": "abdominal-distension",
  "腹脹": "abdominal-distension",
  "裡急後重": "faecal-tenesmus",
  "糞便失禁": "faecal-incontinence",
  "大便失禁": "faecal-incontinence",
  "腹痛": "abdominal-pain",
  "腹部疼痛": "abdominal-pain",
  "腹部觸診疼痛": "abdominal-pain",
  "腹部不適": "abdominal-pain",
  // === 泌尿 ===
  "頻尿": "pollakiuria",
  "排尿困難": "pollakiuria",
  "排尿異常": "pollakiuria",
  "頻繁進出砂盆": "pollakiuria",
  "尿淋漓": "pollakiuria",
  "血尿": "haematuria",
  "色素尿": "haematuria",
  "紅色尿液": "haematuria",
  "尿失禁": "urinary-incontinence",
  "少尿": "oliguria-anuria",
  "無尿": "oliguria-anuria",
  // === 神經 ===
  "跛行": "lameness",
  "走路異常": "lameness",
  "步態異常": "lameness",
  "癱瘓": "paresis-paralysis",
  "輕癱": "paresis-paralysis",
  "後肢癱瘓": "paresis-paralysis",
  "四肢癱瘓": "paresis-paralysis",
  "後肢無力": "paresis-paralysis",
  "關節腫脹": "polyarthritis",
  "多關節疼痛": "polyarthritis",
  "共濟失調": "ataxia",
  "步態不穩": "ataxia",
  "搖晃步態": "ataxia",
  "顫抖": "trembling",
  "震顫": "trembling",
  "肌肉震顫": "trembling",
  "肌肉抽搐": "trembling",
  "癲癇": "seizures",
  "抽搐": "seizures",
  "癲癇發作": "seizures",
  "痙攣": "seizures",
  "昏迷": "coma-stupor",
  "意識改變": "coma-stupor",
  "意識喪失": "coma-stupor",
  "失明": "blindness",
  "視力喪失": "blindness",
  "視力障礙": "blindness",
  "頭歪": "head-tilt",
  "頭部傾斜": "head-tilt",
  "眼球震顫": "nystagmus",
  // === 眼科 ===
  "眼睛紅": "red-eye",
  "結膜充血": "red-eye",
  "結膜發紅": "red-eye",
  "眼部紅腫": "red-eye",
  // === 皮膚 ===
  "搔癢": "skin-pruritus",
  "皮膚癢": "skin-pruritus",
  "抓癢": "skin-pruritus",
  "瘙癢": "skin-pruritus",
  "脫毛": "alopecia",
  "禿毛": "alopecia",
  "掉毛": "alopecia",
  "對稱性脫毛": "alopecia",
  // === 其他理學檢查 ===
  "淋巴結腫大": "lymphadenopathy",
  "淋巴腫大": "lymphadenopathy",
  "黃疸": "jaundice",
  "腹水": "ascites",
  "流涎": "ptyalism",
  "過度流涎": "ptyalism",
  "唾液過多": "ptyalism",
  "噴嚏": "sneezing",
  "打噴嚏": "sneezing",
  "陰道分泌物": "vaginal-discharge",
  "陰部分泌物": "vaginal-discharge",
  "鼻出血": "epistaxis",
  "流鼻血": "epistaxis",
  "心雜音": "heart-murmur",
  "黏膜蒼白": "pallor-cyanosis",
  "黏膜蒼白或發紺": "pallor-cyanosis",
  "發紺": "pallor-cyanosis",
  "肌肉萎縮": "cachexia-muscle-wasting",
  "惡病質": "cachexia-muscle-wasting",
  "口腔潰瘍": "halitosis-stomatitis",
  "口臭": "halitosis-stomatitis",
  "口炎": "halitosis-stomatitis",
  "心搏過速": "tachycardia-bradycardia",
  "心跳加速": "tachycardia-bradycardia",
  "心律不整": "tachycardia-bradycardia",
  "心搏過緩": "tachycardia-bradycardia",
  "頸靜脈怒張": "tachycardia-bradycardia",
  "瘀斑": "petechiae-ecchymoses",
  "出血點": "petechiae-ecchymoses",
  "點狀出血": "petechiae-ecchymoses",
  "水腫": "peripheral-oedema",
  "周邊水腫": "peripheral-oedema",
  "皮膚腫塊": "cutaneous-masses",
  "腫塊": "cutaneous-masses",
  "結節": "cutaneous-masses",
  // === Phase 5.3 新增症狀 ===
  "脫水": "dehydration",
  "脫水徵象": "dehydration",
  "低血壓": "dehydration",
  "休克徵象": "dehydration",
  "肝腫大": "hepatomegaly",
  "肝脾腫大": "hepatomegaly",
  "脾臟腫大": "splenomegaly",
  "脾腫大": "splenomegaly",
  "行為改變": "behaviour-change",
  "行為異常": "behaviour-change",
  "瞳孔散大": "mydriasis",
  "散瞳": "mydriasis",
  "低體溫": "hypothermia-sign",
  // === 額外擴充（英文臨床關鍵字） ===
  "vomiting": "vomiting",
  "diarrhea": "diarrhoea",
  "diarrhoea": "diarrhoea",
  "lethargy": "weakness",
  "anorexia": "anorexia",
  "weight loss": "weight-loss",
  "seizure": "seizures",
  "seizures": "seizures",
  "cough": "coughing",
  "dyspnea": "dyspnoea",
  "dyspnoea": "dyspnoea",
  "ataxia": "ataxia",
  "lameness": "lameness",
  "pruritus": "skin-pruritus",
  "alopecia": "alopecia",
  "jaundice": "jaundice",
  "icterus": "jaundice",
  "hematuria": "haematuria",
  "haematuria": "haematuria",
  "polyuria": "polyuria-polydipsia",
  "polydipsia": "polyuria-polydipsia",
  "syncope": "syncope",
  "tremor": "trembling",
  "blindness": "blindness",
  "head tilt": "head-tilt",
  "nystagmus": "nystagmus",
  "epistaxis": "epistaxis",
  "ascites": "ascites",
  "edema": "peripheral-oedema",
  "oedema": "peripheral-oedema",
};

fs.writeFileSync(
  path.join(DDX_DIR, "keyword-to-symptom.yaml"),
  yaml.dump(KEYWORD_TO_SYMPTOM, { lineWidth: 120, noRefs: true })
);
console.log(
  "  → keyword-to-symptom.yaml:",
  Object.keys(KEYWORD_TO_SYMPTOM).length,
  "keywords"
);

console.log("\n=== Phase 1c Complete ===");
console.log("Output directory:", DDX_DIR);
