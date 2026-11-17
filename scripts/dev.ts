// Arranca la API (puerto 3000) y la web con Vite (puerto 5173, proxy /api → 3000) a la vez.
// Ctrl+C detiene ambos. Requiere MongoDB en marcha (`bun run db:start`).
const root = new URL("..", import.meta.url).pathname;

const procs = [
  Bun.spawn(["bun", "--watch", "src/api/server.ts"], { cwd: root, stdout: "inherit", stderr: "inherit" }),
  Bun.spawn(["bun", "run", "dev"], { cwd: `${root}src/web`, stdout: "inherit", stderr: "inherit" }),
];

const stop = () => {
  for (const p of procs) p.kill();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

// Si uno de los dos termina, se detiene el otro.
await Promise.race(procs.map((p) => p.exited));
stop();
