/**
 * Generic Metric Types
 */

export enum MetricType {
  LATENCY = 'latency',
  THROUGHPUT = 'throughput',
}

export enum TimeMetricResolution {
  MICROSECONDS = 'microseconds',
  MILLISECONDS = 'milliseconds',
  SECONDS = 'seconds',
}

export type TimeMetric = {
  type: MetricType;
  resolution: TimeMetricResolution;
  value: number;
}

export type MetricData = TimeMetric & {};

/**
 * Subject Runtime Types
 */

export type RuntimeConfig = {
  name: string;
  bin: string;
  version?: string;
}

export type RuntimeBenchmarkConfig = {
  runtimes?: (string | RuntimeConfig)[];
  suites?:   Array<Array<SuiteClass | string>>;
}

export type RuntimeInfo = RuntimeConfig & {
  resolved: string;
}

/**
 * Benchmark Suite Types
 */

export type SuiteClass = {
  runtimes?: string[];
  args?:     string[];
  env?:      Env;
}

export type InterpretedSuite = {
  name: string;
  entry: string;
  resolved: string;
  runtimes: string[];
  args: string[];
  env: { [key: string]: string; };
  sysEnv: boolean;
}

/**
 * Host Info Types
 */

export type Env = {
  [key: string]: string;
}

export type CpuInfo = {
  model: string;
  speed: number;
}

export type SystemInfo = {
  os: string;
  arch: string;
  cpu: string;
  cpuCount: number;
  cpus: CpuInfo[],
  mem: number;
}

/**
 * Final Result Types
 */

// Single benchmark successful result.
export type SingleBenchmarkResultData<T = any> = {
  bench: T,
}

// Single benchmark error result.
export type SingleBenchmarkError = {
  error?: string,
}

// Combined error-or-result payload for a single benchmark result of type `T`.
export type SingleBenchamrkPayload<T = any> = SingleBenchmarkResultData<T> & SingleBenchmarkError;

export type SingleBenchmarkResults<T = any> = SingleBenchamrkPayload<T> & {
  runtime: RuntimeInfo,
  system: SystemInfo,
  suite: InterpretedSuite,
  totalMs: number,
}

export type MergedBenchmarkResults<T = any> = {
  all: SingleBenchmarkResults<T>[];
}

/**
 * Option Types
 */

export type RunnerOptions = {
  units?: boolean;
  silent?: boolean;
  avg?: boolean;
  json?: boolean;
  colors?: boolean;
  min_max?: boolean;
  percentiles?: boolean;
}

/**
 * Results: Micro-Benchmarks
 */

export type MicroBenchmarkRunResult = {
  name: string;
  group: string | null;
  warmup: boolean;
  baseline: boolean;
  async: boolean;
  stats: {
    min: number;
    max: number;
    p50: number;
    p75: number;
    p99: number;
    p999: number;
    avg: number;
  }
}

export type MicroBenchmarkResult = {
  benchmarks: MicroBenchmarkRunResult[];
}

// Type Aliases
export type SingleMicroBenchmarkResult = SingleBenchmarkResults<MicroBenchmarkResult>;
export type MergedMicroBenchmarkResult = MergedBenchmarkResults<MicroBenchmarkResult>;
