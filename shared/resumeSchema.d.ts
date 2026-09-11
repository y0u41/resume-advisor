// 结构化简历 Schema 的类型声明（与 resumeSchema.js 保持一致）。
import type { z } from "zod";

export interface ResumeBasics {
  name: string;
  phone: string;
  email: string;
  city: string;
  links: string[];
}

export interface ResumeEducation {
  school: string;
  major: string;
  degree: string;
  start: string;
  end: string;
}

export interface ResumeExperience {
  company: string;
  role: string;
  start: string;
  end: string;
  bullets: string[];
}

export interface ResumeProject {
  name: string;
  role: string;
  desc: string;
  bullets: string[];
}

export interface ResumeContent {
  schemaVersion: number;
  basics: ResumeBasics;
  summary: string;
  education: ResumeEducation[];
  experience: ResumeExperience[];
  projects: ResumeProject[];
  skills: string[];
}

export declare const RESUME_LIMITS: Record<string, number>;
export declare const BasicsSchema: z.ZodTypeAny;
export declare const EducationSchema: z.ZodTypeAny;
export declare const ExperienceSchema: z.ZodTypeAny;
export declare const ProjectSchema: z.ZodTypeAny;
export declare const ResumeContentSchema: z.ZodTypeAny;

export declare function emptyResumeContent(): ResumeContent;
export declare function parseResumeContent(input: unknown): ResumeContent;
export declare function safeParseResumeContent(input: unknown): ResumeContent;
export declare function contentToText(content: ResumeContent): string;
