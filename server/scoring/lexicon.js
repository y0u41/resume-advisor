// 技能/要求词库。
//
// 采用「词典驱动」的关键词提取：结果确定、可解释、零外部依赖。
// weight 为 1–5 的基础重要性，抽取时再叠加位置与词频加成（见 extract.js）。
//
// 扩展方式：直接向 LEXICON 追加条目即可，无需改动算法。
// 来源：移植自 resume-workshop（MIT License）。

export const LEXICON = [
  // --- 编程语言 ---
  { canonical: "javascript", aliases: ["js", "es6", "ecmascript"], category: "language", weight: 5 },
  { canonical: "typescript", aliases: ["ts"], category: "language", weight: 5 },
  { canonical: "python", aliases: ["py"], category: "language", weight: 5 },
  { canonical: "java", aliases: [], category: "language", weight: 4 },
  { canonical: "go", aliases: ["golang"], category: "language", weight: 4 },
  { canonical: "c++", aliases: ["cpp", "cplusplus"], category: "language", weight: 3 },
  { canonical: "c#", aliases: ["csharp", "dotnet", ".net"], category: "language", weight: 4 },
  { canonical: "rust", aliases: [], category: "language", weight: 3 },
  { canonical: "php", aliases: [], category: "language", weight: 3 },

  // --- 前端 ---
  { canonical: "html", aliases: ["html5"], category: "frontend", weight: 4 },
  { canonical: "css", aliases: ["css3", "scss", "sass", "less"], category: "frontend", weight: 4 },
  { canonical: "vue", aliases: ["vue.js", "vuejs", "vue3"], category: "frontend", weight: 5 },
  { canonical: "react", aliases: ["react.js", "reactjs"], category: "frontend", weight: 5 },
  { canonical: "angular", aliases: [], category: "frontend", weight: 3 },
  { canonical: "webpack", aliases: ["vite", "rollup"], category: "frontend", weight: 2 },

  // --- 后端 ---
  { canonical: "node.js", aliases: ["node", "nodejs"], category: "backend", weight: 5 },
  { canonical: "express", aliases: ["express.js"], category: "backend", weight: 3 },
  { canonical: "nestjs", aliases: ["nest.js", "nest"], category: "backend", weight: 3 },
  { canonical: "spring boot", aliases: ["springboot", "spring"], category: "backend", weight: 4 },
  { canonical: "django", aliases: [], category: "backend", weight: 3 },
  { canonical: "flask", aliases: [], category: "backend", weight: 3 },
  { canonical: "fastapi", aliases: [], category: "backend", weight: 3 },
  { canonical: "微服务", aliases: ["microservice", "microservices"], category: "backend", weight: 3 },
  { canonical: "分布式", aliases: ["distributed"], category: "backend", weight: 3 },
  { canonical: "高并发", aliases: ["high concurrency"], category: "backend", weight: 3 },

  // --- 数据库 ---
  { canonical: "sql", aliases: [], category: "database", weight: 4 },
  { canonical: "mysql", aliases: [], category: "database", weight: 4 },
  { canonical: "postgresql", aliases: ["postgres", "pg"], category: "database", weight: 4 },
  { canonical: "mongodb", aliases: ["mongo"], category: "database", weight: 3 },
  { canonical: "redis", aliases: [], category: "database", weight: 4 },
  { canonical: "elasticsearch", aliases: ["elastic search"], category: "database", weight: 3 },

  // --- 运维/工程 ---
  { canonical: "docker", aliases: [], category: "devops", weight: 4 },
  { canonical: "kubernetes", aliases: ["k8s"], category: "devops", weight: 4 },
  { canonical: "git", aliases: [], category: "devops", weight: 4 },
  { canonical: "linux", aliases: [], category: "devops", weight: 4 },
  { canonical: "nginx", aliases: [], category: "devops", weight: 3 },
  { canonical: "cicd", aliases: ["ci/cd", "continuous integration", "持续集成"], category: "devops", weight: 3 },
  { canonical: "aws", aliases: ["amazon web services"], category: "devops", weight: 3 },
  { canonical: "阿里云", aliases: ["aliyun", "alibaba cloud"], category: "devops", weight: 2 },

  // --- 数据/AI ---
  { canonical: "机器学习", aliases: ["machine learning", "ml"], category: "data", weight: 3 },
  { canonical: "深度学习", aliases: ["deep learning", "dl"], category: "data", weight: 3 },
  { canonical: "数据分析", aliases: ["data analysis"], category: "data", weight: 3 },
  { canonical: "数据挖掘", aliases: ["data mining"], category: "data", weight: 3 },
  { canonical: "大模型", aliases: ["llm", "large language model", "gpt"], category: "data", weight: 3 },
  { canonical: "自然语言处理", aliases: ["nlp"], category: "data", weight: 3 },

  // --- 测试 ---
  { canonical: "单元测试", aliases: ["unit test", "unit testing"], category: "testing", weight: 3 },
  { canonical: "自动化测试", aliases: ["automation testing"], category: "testing", weight: 3 },

  // --- 软技能 ---
  { canonical: "团队协作", aliases: ["teamwork", "team work", "协作能力"], category: "soft", weight: 3 },
  { canonical: "沟通能力", aliases: ["communication", "沟通"], category: "soft", weight: 3 },
  { canonical: "学习能力", aliases: ["learning ability"], category: "soft", weight: 3 },
  { canonical: "抗压能力", aliases: ["stress tolerance"], category: "soft", weight: 2 },
  { canonical: "责任心", aliases: ["responsibility", "责任感"], category: "soft", weight: 3 },

  // --- 学历/身份 ---
  { canonical: "本科", aliases: ["bachelor", "学士"], category: "education", weight: 3 },
  { canonical: "硕士", aliases: ["master", "研究生"], category: "education", weight: 4 },
  { canonical: "博士", aliases: ["phd", "doctor"], category: "education", weight: 4 },
  { canonical: "应届", aliases: ["应届生", "fresh graduate"], category: "education", weight: 3 },

  // --- 其他常见要求 ---
  { canonical: "实习", aliases: ["intern", "internship"], category: "other", weight: 3 },
  { canonical: "算法", aliases: ["algorithm"], category: "other", weight: 3 },
  { canonical: "数据结构", aliases: ["data structure"], category: "other", weight: 3 },
  { canonical: "性能优化", aliases: ["performance optimization"], category: "other", weight: 3 },
  { canonical: "需求分析", aliases: ["requirements analysis"], category: "other", weight: 3 },
  { canonical: "项目管理", aliases: ["project management"], category: "other", weight: 3 },
  { canonical: "敏捷开发", aliases: ["agile", "scrum"], category: "other", weight: 2 },
];

// 英文停用词：用于未知英文专有名词兜底抽取时过滤噪音。
export const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "by",
  "is", "are", "be", "as", "at", "from", "that", "this", "it", "we", "you",
  "will", "can", "have", "has", "not", "but", "if", "then", "than", "so",
  "job", "work", "team", "role", "position", "company", "years", "year",
  "experience", "ability", "skills", "skill", "good", "strong", "must",
  "preferred", "plus", "etc", "相关", "负责", "要求", "岗位", "工作", "公司",
]);
