import { spawn } from "node:child_process";
const children = [spawn(process.execPath, ["--experimental-strip-types", "server/index.ts"], { stdio: "inherit", windowsHide: true }), spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"], { stdio: "inherit", windowsHide: true })];
let stopped = false;
function stop(code = 0) { if (stopped) return; stopped = true; children.forEach(child => child.kill()); process.exitCode = code; }
children.forEach(child => { child.on("error", error => { console.error(error); stop(1); }); child.on("exit", code => stop(code ?? 0)); });
process.once("SIGINT", () => stop()); process.once("SIGTERM", () => stop());
