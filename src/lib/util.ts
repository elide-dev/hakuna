import os from "node:os";
import { SystemInfo } from "src/types";

/**
 * Materialize info about the system which is running the benchmark (the host system).
 *
 * @returns {SystemInfo} - The system info.
 */
export function getSystemInfo(): SystemInfo {
  const cpus = os.cpus();
  return {
    os: os.type(),
    arch: os.arch(),
    cpu: cpus[0].model,
    cpuCount: cpus.length,
    cpus: cpus.map((cpu) => ({model: cpu.model, speed: cpu.speed})),
    mem: os.totalmem(),
  };
}
