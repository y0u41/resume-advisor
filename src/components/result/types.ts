import type { ObjectiveScore } from "../../lib/report/report";

// 评估记录（结果页与各子组件共用）
export interface EvalData {
  id: number;
  resume: string;
  job_title: string;
  job_description: string;
  job_url: string;
  score: number | null;
  report: string;
  candidate_type: string;
  created_at: string;
  objective?: ObjectiveScore | null;
  revision?: number;
  previousScore?: number | null;
  scoreDelta?: number | null;
}
