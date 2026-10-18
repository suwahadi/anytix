const path = require("node:path");

const cwd = path.join(__dirname, "..");

module.exports = {
  apps: [
    {
      name: "anytix-web",
      cwd,
      script: "npm",
      args: "run start:prod",
      env: { NODE_ENV: "production" },
      max_memory_restart: "1G",
      time: true,
    },
    {
      name: "anytix-worker",
      cwd,
      script: "npm",
      args: "run worker",
      env: { NODE_ENV: "production" },
      max_memory_restart: "512M",
      time: true,
    },
  ],
};
