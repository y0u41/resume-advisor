import { useState } from "react";
import { submitFeedback } from "../../lib/api";
import { useToast } from "../../lib/ui/toast";

export default function FeedbackCard({ evalId }: { evalId: number }) {
  const toast = useToast();
  const storageKey = `fb_${evalId}`;
  const [voted, setVoted] = useState<string>(() => {
    try {
      return localStorage.getItem(storageKey) || "";
    } catch {
      return "";
    }
  });
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const vote = async (rating: string) => {
    if (voted || busy) return;
    setBusy(true);
    try {
      await submitFeedback({ kind: "vote", rating, context: String(evalId) });
      setVoted(rating);
      try {
        localStorage.setItem(storageKey, rating);
      } catch {
        // 忽略
      }
      toast("感谢你的反馈！", "success");
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const sendComment = async () => {
    if (!comment.trim()) return;
    setBusy(true);
    try {
      await submitFeedback({ kind: "feedback", content: comment.trim(), context: String(evalId) });
      setSent(true);
      setComment("");
      toast("已提交，感谢反馈！", "success");
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2 className="section-title">
        <span className="section-icon">💬</span>
        这份报告有帮助吗？
      </h2>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => vote("helpful")}
          disabled={!!voted || busy}
        >
          {voted === "helpful" ? "👍 已评价：有帮助" : "👍 有帮助"}
        </button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => vote("not_helpful")}
          disabled={!!voted || busy}
        >
          {voted === "not_helpful" ? "👎 已评价：没帮助" : "👎 没帮助"}
        </button>
      </div>
      <div className="form-group" style={{ marginTop: 12 }}>
        <label>还有什么想说的？（选填）</label>
        <textarea
          rows={3}
          placeholder="告诉我们哪里可以改进…"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>
      <button
        className="btn btn-secondary btn-sm"
        onClick={sendComment}
        disabled={busy || !comment.trim()}
      >
        {sent ? "已提交" : "提交反馈"}
      </button>
    </div>
  );
}
