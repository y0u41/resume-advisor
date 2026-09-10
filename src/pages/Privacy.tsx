import { Link } from "react-router-dom";
import Logo from "../components/Logo";
import ThemeToggle from "../components/ThemeToggle";

export default function Privacy() {
  return (
    <div className="container" style={{ maxWidth: 760 }}>
      <div className="auth-topbar">
        <ThemeToggle />
      </div>

      <div className="header">
        <div className="brand">
          <Logo size={44} />
          <h1>隐私政策</h1>
        </div>
        <p>我们如何处理你的信息</p>
      </div>

      <div className="card">
        <div className="report">
          <h2>1. 我们收集哪些信息</h2>
          <p>
            你主动提交的内容：简历全文、应聘岗位、岗位要求（JD）、岗位链接；以及注册时使用的邮箱。
            此外会记录基本的评估次数与时间，用于额度控制。
          </p>

          <h2>2. 信息用途</h2>
          <p>
            这些信息<strong>仅用于生成简历评估报告</strong>与展示你的历史记录，不用于任何其他用途，
            也不会用于训练模型。
          </p>

          <h2>3. 第三方处理</h2>
          <p>
            生成评估时，你的简历与岗位内容会发送给所选的大模型服务商（如 DeepSeek、智谱 BigModel）
            用于生成报告。请在提交前确认你可接受该处理方式。
          </p>

          <h2>4. 数据存储与保留</h2>
          <p>
            数据保存在本服务所在服务器的数据库中。为控制体积，<strong>同一个人最多保留 12 次评估记录</strong>，
            超出的会自动删除最旧记录。
          </p>

          <h2>5. 你的权利</h2>
          <p>
            你可以随时在「历史记录」中删除单条评估；如需删除全部数据或账号，请联系管理员。
          </p>

          <h2>6. 联系我们</h2>
          <p>如对隐私处理有疑问，请联系本服务的运营者。</p>
        </div>
      </div>

      <p style={{ textAlign: "center", marginTop: 20 }}>
        <Link to="/login" className="btn btn-secondary btn-sm">
          返回
        </Link>
      </p>
    </div>
  );
}
