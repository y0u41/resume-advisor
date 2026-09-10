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
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
