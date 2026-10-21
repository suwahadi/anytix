const path = require("node:path");

const cwd = path.join(__dirname, "..");
// 3000 is often taken by other apps on a shared VPS; nginx-anytix.conf and deploy.sh use the same port.
const port = process.env.ANYTIX_PORT || "3100";

// Node runs Next and the worker directly: going through `npm run` (and the tsx CLI) keeps extra wrapper
// processes alive, about 200 MB of RSS on a 2 GB VPS. Same commands as package.json start:prod and worker.
module.exports = {
  apps: [
    {
      name: "anytix-web",
      cwd,
      script: "node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1",
      interpreter: "node",
      env: { NODE_ENV: "production", PORT: port },
      max_memory_restart: "1G",
      time: true,
    },
    {
      name: "anytix-worker",
      cwd,
      script: "worker/index.ts",
      interpreter: "node",
      node_args: "--env-file=.env.local --import tsx",
      env: { NODE_ENV: "production" },
      max_memory_restart: "512M",
      time: true,
    },
  ],
};
