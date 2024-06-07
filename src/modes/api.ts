import { InterpretedSuite, MergedBenchmarkResults, RuntimeInfo } from "../types";

/**
 * Benchmark mode.
 *
 * Enumerates types of benchmarks supported by Hakuna.
 */
export enum BenchmarkMode {
  /* Micro-benchmarking with Mitata. */
  MICRO = 'micro',

  /* Shell command testing with Hyperfine. */
  SHELL = 'shell',

  /* Server testing with Oha. */
  SERVER = 'server',

  /* Custom benchmarking that calls out to a script. */
  CUSTOM = 'custom',
}

// Shape of context provided to a benchmark executor's `run` method.
export type OperatorContext = {
  runtime: RuntimeInfo;
  suite: InterpretedSuite;
}

/**
 * Benchmark operator.
 *
 * Defines the API provided by an implementation of a runner of benchmarks; there is a runner definition
 * per operating mode supported by Hakuna.
 */
export interface BenchmarkOperator<T> {
  /**
   * Run the benchmark.
   *
   * @param data Benchmark data
   * @return Benchmark results
   */
  run(data: OperatorContext): Promise<T>;
}

// Base extension point for new runner types.
export abstract class BaseBenchmarkOperator<T> implements BenchmarkOperator<T> {
  abstract run(ctx: OperatorContext): Promise<T>;
}

// Central registry of benchmark operators.
const registeredOperators: { [key: string]: () => BenchmarkOperator<any> } = {};

// Register a new operator implementation.
export function registerOperatorFactory<T>(type: BenchmarkMode, factory: () => BenchmarkOperator<T>) {
  registeredOperators[type] = factory;
}

// Obtain an operator implementation based on the active benchmark mode.
export function operatorForType<T>(type: BenchmarkMode): () => BenchmarkOperator<T> {
  const operatorFactory = registeredOperators[type];
  if (!operatorFactory) {
    throw new Error(`No operator registered for mode: ${type}`);
  }
  return operatorFactory;
}
