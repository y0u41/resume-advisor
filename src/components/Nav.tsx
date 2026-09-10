import { Link } from "react-router-dom";
import type { MouseEvent, ReactNode } from "react";

const LINKS = [
  { to: "/", label: "评估简历" },
  { to: "/builder", label: "简历模板" },
  { to: "/compare", label: "多岗位对比" },
  { to: "/interview", label: "模拟面试" },
  { to: "/directions", label: "岗位推荐" },
  { to: "/history", label: "历史记录" },
];

interface Props {
  onNavigate?: (e: MouseEvent) => void;
  children?: ReactNode;
}

export default function Nav({ onNavigate, children }: Props) {
  return (
    <nav className="nav">
      {LINKS.map((l) => (
        <Link key={l.to} to={l.to} onClick={onNavigate}>
          {l.label}
        </Link>
      ))}
      {children}
    </nav>
  );
}
