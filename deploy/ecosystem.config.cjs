const path = require("node:path");

const cwd = path.join(__dirname, "..");
// 3000 is often taken by other apps on a shared VPS; nginx-anytix.conf and deploy.sh use the same port.
const port = process.env.ANYTIX_PORT || "3100";

module.exports = {
  apps: [
    {
      name: "anytix-web",
      cwd,
      script: "npm",
      args: "run start:prod",
      env: { NODE_ENV: "production", PORT: port },
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
