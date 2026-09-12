// pm2 配置：npm i -g pm2 && pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "resume-evaluator",
      script: "server/index.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "500M",
      // 优雅停机：给 SIGTERM 后最多 40s 让进行中的评估跑完（应用内等待上限 35s）
      kill_timeout: 40000,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
