import type {
  InterpretedSuite,
  MergedBenchmarkResults,
  RuntimeBenchmarkConfig,
  RuntimeConfig,
  RuntimeInfo,
  SingleBenchmarkResults,
  SuiteClass,
} from "../types";

import { logger as logging } from "./logger.js";
import { sep, isAbsolute, join, resolve } from "node:path";
import which from "which";
import { BenchmarkOperator, OperatorContext } from "../modes";

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

function buildContext(runtime: RuntimeInfo, suite: InterpretedSuite): OperatorContext {
  return {
    runtime,
    suite,
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
 * @param operator Benchmark operator to use
 * @param suite Suite to run
 * @return Promise for merged benchmark results
 */
export async function executeSuite(
  operator: BenchmarkOperator<any>,
  suite: RuntimeBenchmarkConfig
): Promise<MergedBenchmarkResults> {
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
  const allResults: SingleBenchmarkResults<any>[] = [];
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

      allResults.push(await operator.run(buildContext(runtime, suite)))
    }
  }

  return mergeBenchmarkResults(allResults);
}
