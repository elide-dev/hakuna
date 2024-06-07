import type {
  InterpretedSuite,
  MergedBenchmarkResults,
  RuntimeBenchmarkConfig,
  RuntimeConfig,
  RuntimeInfo,
  SingleBenchmarkResults,
  RunnerOptions,
  SuiteClass,
} from "../types";

import { logger as logging } from "./logger.js";
import { mkdtempSync, writeFileSync, copyFileSync, symlinkSync, readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { sep, isAbsolute, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import which from "which";
import { getSystemInfo } from "./util";

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
): Promise<SingleBenchmarkResults> {
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

// Cache of resolved runtime info.
const runtimeInfoCache = new Map<string, RuntimeInfo>();

/**
 * Resolve information about a runtime.
 *
 * Given a runtime name, this function will resolve the runtime from the `PATH`, and build info
 * about it; given a runtime configuration, the config is merged with defaults and used otherwise
 * as-is.
 *
 * @param runtime Runtime name or configuration
 * @return Promise for resolved runtime info
 */
export async function resolveRuntimeInfo(runtime: RuntimeConfig | string): Promise<RuntimeInfo> {
  const logger = logging();
  const runtimeName = typeof runtime === 'string' ? runtime : runtime.name;
  const runtimeConfig: Partial<RuntimeConfig> = typeof runtime === 'string' ? {} : runtime;
  const cached = runtimeInfoCache.get(runtimeName);
  if (cached) {
    return cached;
  }
  const bin = runtimeConfig.bin || runtimeName;
  let resolvedPath: string | undefined | null = undefined;
  if (!isAbsolute(bin)) {
    resolvedPath = await which(bin, {nothrow: true});
  } else {
    resolvedPath = bin;
  }
  logger.debug(`Runtime '${runtimeName}' resolved to path: ${resolvedPath}`)

  return {
    name: runtimeName,
    bin: runtimeConfig.bin || runtimeName,
    version: runtimeConfig.version || undefined,
    resolved: resolvedPath || runtimeName,
  };
}

function inflateSuite(entry: string, base: SuiteClass): InterpretedSuite {
  const resolved = resolve(join(process.cwd(), entry));
  const parts = resolved.split(sep);
  const name = parts[parts.length - 1];

  return {
    name,
    entry,
    resolved,
    runtimes: base.runtimes || [],
    args: base.args || [],
    env: base.env || {},
    sysEnv: true,  // needs configuration
  };
}

function mergeBenchmarkResults(results: SingleBenchmarkResults[]): MergedBenchmarkResults {
  return {
    all: results,
  };
}

/**
 * Execute a benchmark suite.
 *
 * This function will run the provided suite against all runtimes configured in the suite; each
 * runtime is resolved via `resolveRuntimeInfo`, and then the suite is run against it via the
 * `runBench` function.
 *
 * Runtimes are only resolved once, before any suites are run. Results are gathered and cached in
 * between runs. All executions occur as sub-processes, serially.
 *
 * @param suite Suite to run
 * @return Promise for merged benchmark results
 */
export async function executeSuite(suite: RuntimeBenchmarkConfig): Promise<MergedBenchmarkResults> {
  const logger = logging();
  const runtimes = suite.runtimes || [];
  const suites = suite.suites || [];
  if (runtimes.length === 0) {
    throw new Error('No runtimes configured for benchmark suite');
  }
  if (suites.length === 0) {
    throw new Error('No suites configured for benchmark suite');
  }

  // resolve each runtime to its info
  const runtimeInfoMap = new Map<string, RuntimeInfo>();
  for (const runtime of runtimes) {
    const resolved = await resolveRuntimeInfo(runtime);
    runtimeInfoMap.set(resolved.name, resolved);
  }
  logger.debug(`Resolved info for ${runtimeInfoMap.size} runtimes. Starting benchmarks...`);

  // run each suite against each runtime
  const allResults: SingleBenchmarkResults[] = [];
  for (const suiteSpec of suites) {
    let suiteEntry: string;
    let suiteConfig: SuiteClass;
    if (suiteSpec.length === 1) {
      suiteEntry = suiteSpec[0] as string;
      suiteConfig = {};
    } else if (suiteSpec.length === 2) {
      suiteEntry = suiteSpec[0] as string;
      suiteConfig = suiteSpec[1] as SuiteClass;
    } else {
      throw new Error('Invalid suite configuration');
    }

    const suite = inflateSuite(suiteEntry, suiteConfig);
    const targets = suite.runtimes || runtimes.map((r) => typeof r === 'string' ? r : r.name);
    for (const runtimeTarget of targets) {
      const runtime = runtimeInfoMap.get(runtimeTarget);
      if (!runtime) {
        throw new Error(`Runtime '${runtimeTarget}' not found in configuration`);
      }

      allResults.push(await runBench(runtime, suite));
    }
  }

  return mergeBenchmarkResults(allResults);
}
