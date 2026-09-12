import { useState } from "react";
import { followUpStream, logEvent } from "../../lib/api";
import type { ModelSelection } from "../../lib/ui/models";
import type { EvalData } from "./types";

const FOLLOWUP_CHIPS = [
  "帮我把自我评价重写一版",
  "把项目经历改成 STAR 格式",
  "我是应届生，没实习经历怎么补强",
  "帮我把简历精简到一页",
  "针对这个岗位，最该补的技能是什么",
];

interface Props {
  data: EvalData;
  resume: string;
  jobTitle: string;
  jobDescription: string;
  isStudent: boolean;
  selection: ModelSelection | null;
}

export default function FollowupPanel({
  data,
  resume,
  jobTitle,
  jobDescription,
  isStudent,
  selection,
}: Props) {
  const [followupQ, setFollowupQ] = useState("");
  const [followupAnswer, setFollowupAnswer] = useState("");
  const [followupLoading, setFollowupLoading] = useState(false);

  const runFollowup = async (q: string) => {
    const question = q.trim();
    if (!question) return;
    logEvent("followup", { id: data.id });
    setFollowupQ(question);
    setFollowupLoading(true);
    setFollowupAnswer("");
    try {
      await followUpStream(
        {
          resume,
          jobTitle,
          jobDescription,
          report: data.report,
          question,
          provider: selection?.provider,
          model: selection?.model,
          candidateType: isStudent ? "student" : "general",
        },
        (text) => setFollowupAnswer(text),
        () => {},
        (msg) => setFollowupAnswer("（生成失败：" + msg + "）"),
        (pos) => setFollowupAnswer(`（排队中，前面还有 ${pos} 位，请稍候…）`)
      );
    } catch (err: any) {
      setFollowupAnswer("（请求失败：" + err.message + "）");
    } finally {
      setFollowupLoading(false);
    }
  };

  return (
    <div className="card">
      <h2 className="section-title">
        <span className="section-icon">💬</span>
        继续追问
      </h2>
      <p className="hint" style={{ marginBottom: 12 }}>
        针对这份简历继续让 AI 帮你改，点下面的常用指令或直接提问：
      </p>

      <div className="chips">
        {FOLLOWUP_CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            className="chip"
            disabled={followupLoading}
            onClick={() => runFollowup(c)}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="followup-input">
        <input
          type="text"
          placeholder="例如：帮我把项目经历改成 STAR 格式"
          value={followupQ}
          onChange={(e) => setFollowupQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") runFollowup(followupQ);
          }}
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={followupLoading || !followupQ.trim()}
          onClick={() => runFollowup(followupQ)}
        >
          {followupLoading ? (
            <>
              <span className="spinner" /> 生成中
            </>
          ) : (
            "发送"
          )}
        </button>
      </div>

      {(followupAnswer || followupLoading) && (
        <div className="followup-answer">
          <div className={`report ${followupLoading ? "streaming-cursor" : ""}`}>
            {followupAnswer}
          </div>
        </div>
      )}
    </div>
  );
}
