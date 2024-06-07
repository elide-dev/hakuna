import { MergedBenchmarkResults, MergedMicroBenchmarkResult, MicroBenchmarkRunResult, SingleBenchmarkResults, SingleMicroBenchmarkResult } from "src/types";
import { BaseFormatter, Format, registerFormatterFactory } from "./api";

const baseShape = {}

function newBencherFormat(): BencherMetricFormat {
  return {...baseShape};
}

function createStanza(): Partial<BencherStanza> {
  return {};
}

function createMetric(value: number = 0): BencherMetrics {
  return {value};
}

function addStanza(format: Partial<BencherMetricFormat>, key: string, stanza: BencherStanza) {
  format[key] = stanza;
}

function addMetric(stanza: Partial<BencherStanza>, key: BencherMetric, value: BencherMetrics) {
  stanza[key] = value;
}

function generateNameForBench(benchmark: SingleBenchmarkResults, result: MicroBenchmarkRunResult): string {
  const prefix = `${benchmark.runtime.name.toLowerCase()} ${benchmark.system.os.toLowerCase()} ${benchmark.system.arch}`;
  return `${prefix} / ${benchmark.suite.name}:${result.name}`
}

function buildMetric(benchmark: MicroBenchmarkRunResult): BencherMetrics {
  return {
    ...createMetric(benchmark.stats.p99 || benchmark.stats.avg),
    lower_value: !!benchmark.stats.min ? benchmark.stats.min : undefined,
    upper_value: !!benchmark.stats.max && benchmark.stats.max > benchmark.stats.min ? benchmark.stats.max : undefined,
  }
}

export enum BencherMetric {
  LATENCY = 'latency',
  THROUGHPUT = 'throughput',
}

// Nanoseconds or operations per second, based on `BencherMetric`.
export type BencherMetricValue = number;

// Defines the shape of Bencher Metrics.
export type BencherMetrics = {
  value: BencherMetricValue | number;
  lower_value?: BencherMetricValue | number;
  upper_value?: BencherMetricValue | number;
}

// Single stanza of metrics.
export type BencherStanza = {
  [key: BencherMetric | string]: BencherMetrics;
}

// Defines the shape of Bencher Metric Format (BMF).
export type BencherMetricFormat = {
  [key: string]: BencherStanza;
}

// Implements Bencher's formatter (see: bencher.dev).
export default class BencherFormatter extends BaseFormatter<BencherMetricFormat> {
  format(data: MergedBenchmarkResults): BencherMetricFormat {
    const shape = newBencherFormat();
    const benchmarks = (data as MergedMicroBenchmarkResult).all;

    benchmarks.filter((suite) => !suite.error).map((benchResult) => {
      const stanza = createStanza();
      benchResult.bench.benchmarks.map((benchEntry) => {
        addMetric(stanza, BencherMetric.LATENCY, buildMetric(benchEntry));
        addStanza(shape, generateNameForBench(benchResult, benchEntry), stanza as BencherStanza);
      })
    });
    return shape;
  }
}

// Register a factory function for this formatter.
registerFormatterFactory(Format.BENCHER_JSON, () => new BencherFormatter());
