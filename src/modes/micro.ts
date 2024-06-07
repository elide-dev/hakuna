import { mkdtempSync, writeFileSync, symlinkSync, readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { logger as logging } from "../lib/logger";
import { tmpdir } from "node:os";
import { getSystemInfo } from "../lib/util";

import type {
  InterpretedSuite,
  RuntimeInfo,
  RunnerOptions,
  SingleMicroBenchmarkResult,
  SingleBenchmarkResults,
  SingleBenchmarkError,
} from "../types";

import { BaseBenchmarkOperator, BenchmarkMode, OperatorContext, registerOperatorFactory } from "./api";

// Runs micro-benchmarks using Mitata, defined in JavaScript or TypeScript.
export default class MicroBenchmarks extends BaseBenchmarkOperator<SingleMicroBenchmarkResult> {
  async run(context: OperatorContext): Promise<SingleMicroBenchmarkResult> {
    const { runtime, suite } = context;
    const result = await runBench(runtime, suite, {})
    if (result.error) {
      throw new Error(`Failed to run benchmark: ${result.error}`);
    }
    return result as SingleMicroBenchmarkResult;
  }
}

// Register this operator.
registerOperatorFactory(BenchmarkMode.MICRO, () => new MicroBenchmarks());

/**
 * Run a single benchmark against the provided runtime.
 *
 * @param runtime Resolved runtime info, which should be used to run the benchmark
 * @param suite Suite to run under the provided runtime
 * @return Promise for single-runtime benchmark results
 */
export async function runBench(
  runtime: RuntimeInfo,
  suite: InterpretedSuite,
  runOptions?: Partial<RunnerOptions>,
): Promise<SingleBenchmarkResults | SingleBenchmarkError> {
  const logger = logging();
  let mod = 'mitata';
  let prefix = [];
  if (runtime.name === 'deno') {
    mod = 'npm:mitata';
    prefix.push('run');
    prefix.push('--allow-sys');  // required for CPU info
  }
  const start = +(new Date());
  const entry = suite.resolved;
  const benchContents = readFileSync(entry, { encoding: 'utf8' });

  const preamble = `
    import { run, bench, group, baseline } from '${mod}';

    globalThis['runBenchmarks'] = run;
    globalThis['bench'] = bench;
    globalThis['group'] = group;
    globalThis['baseline'] = baseline;
  `
  const script = `
    // script preamble (benchmark harness)
    ${preamble}

    // benchmark
    ${benchContents}

    // runner
    await run({
      units: false,
      avg: true,
      json: true,
      colors: true,
      min_max: true,
      percentiles: true,
      data_to_stderr: true,
    });
  `;

  const tmpRoot = join(tmpdir(), `runtime-bench-`)
  const tmp = mkdtempSync(tmpRoot);
  const entryPath = `${tmp}/entry.mjs`;
  writeFileSync(entryPath, script, { encoding: 'utf8' });

  // build info about the host system
  const system = getSystemInfo();

  // compute local path to node modules, then symlink the tmpdir directory to it at the same name
  const nodeModules = join(process.cwd(), 'node_modules');
  const tmpNodeModules = `${tmp}/node_modules`;
  symlinkSync(nodeModules, tmpNodeModules, 'dir');

  // begin computing args and environment
  const resolvedArgs: string[] = [
    ...(prefix || []),
    entryPath,
    ...(suite.args || []),
  ]
  const mergedEnv = {
    ...(suite.sysEnv ? process.env : {}),
    ...(suite.env || {}),
  }
  let gatheredStderr = ''
  let gatheredStdout = ''

  try {
    logger.info(`${runtime.name} ${resolvedArgs.join(' ')}`)

    const child = execFile(runtime.resolved, resolvedArgs, {
      env: mergedEnv,
    });

    child.unref();
    child.stdout?.on('data', function(data) {
      if (runtime.name !== 'deno') {
        process.stdout.write(data);
      } else {
        gatheredStdout += data.toString();
      }
    });
    child.stderr?.on('data', function(data) {
      const str = data.toString();
      gatheredStderr += str;
    });

    return await new Promise((resolve, reject) => {
      child.on('close', () => {
        const out = gatheredStderr || gatheredStdout;

        // check exit code
        if (child.exitCode !== 0) {
          console.error(`Benchmark failed with exit code ${child.exitCode}`);
          console.error(out);
          resolve({
            runtime,
            suite,
            system,
            error: `Benchmark failed with exit code ${child.exitCode}`,
            totalMs: +(new Date()) - start,
          })
        } else {
          if (out === '') {
            console.error(`No benchmark output received`);
            resolve({
              runtime,
              suite,
              system,
              error: `No benchmark output received`,
              totalMs: +(new Date()) - start,
            });
          }
          try {
            const bench = JSON.parse(out || '{}');

            resolve({
              runtime,
              suite,
              bench,
              system,
              totalMs: +(new Date()) - start,
            });
          } catch (err) {
            console.error(`Failed to parse benchmark JSON:`, gatheredStderr);
            reject(err);
          }
        }
      })
    });
  } catch (err) {
    console.error(err);
    throw err;
  }
}
