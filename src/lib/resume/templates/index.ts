// 4 套视觉模板（版式移植自 resume-workshop，MIT License；HTML 为受限占位符片段）。
import { clean01 } from "./clean-01";
import { timeline02 } from "./timeline-02";
import { monoLine03 } from "./mono-line-03";
import { blueSplit04 } from "./blue-split-04";

export interface TemplateSeed {
  code: string;
  name: string;
  category: string;
  sortOrder: number;
  html: string;
}

export const WORKSHOP_TEMPLATES: TemplateSeed[] = [clean01, timeline02, monoLine03, blueSplit04];

export function findWorkshopTemplate(code: string): TemplateSeed | undefined {
  return WORKSHOP_TEMPLATES.find((seed) => seed.code === code);
}
