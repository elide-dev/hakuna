import { BenchmarkMode } from "../modes/api";
import { MergedBenchmarkResults } from "../types";

/**
 * Benchmark formats.
 *
 * Supported format enumeration; obtain a formatter via `formatterForType`.
 */
export enum Format {
  BENCHER_JSON = 'bencher',
}

/**
 * Formatter Interface
 *
 * Describes the API expected to be provided by formatter implementations.
 */
export interface Formatter<T> {
  /**
   * Format the given data.
   *
   * @param data Data to format
   * @return Formatted data
   */
  format(data: MergedBenchmarkResults): T;

  /**
   * Format data for final storage or transmission.
   *
   * @param data Data produced by the `format` method
   */
  serialize(data: T): string;

  /**
   * Indicate whether this format supports a given benchmark mode.
   *
   * @param type Type of benchmark mode
   */
  supports(type: BenchmarkMode): boolean;
}

/**
 * BaseFormatter
 *
 * Base extension point for formatter implementations; expected to transform final benchmark data into
 * an instance of type `T`, and then serializing it to a string.
 */
export abstract class BaseFormatter<T> implements Formatter<T> {
  // By default, formatter data is serialized to JSON, but this behavior can be overridden.
  serialize(data: T): string {
    return JSON.stringify(data, null, 2);
  }

  supports(type: BenchmarkMode): boolean {
    return true;  // defaults to yes in all cases
  }

  // Implementation point for formatters.
  abstract format(data: MergedBenchmarkResults): T;
}

// Central registry of formatter factory functions.
const registeredFormatterFactories: { [key: string]: () => Formatter<any> } = {};

/**
 * Register a formatter factory.
 *
 * @param type Format type to register
 * @param factory Factory function to create a formatter
 */
export function registerFormatterFactory<T>(type: string, factory: () => Formatter<T>) {
  registeredFormatterFactories[type] = factory;
}

/**
 * Resolve a formatter by type.
 *
 * @param type Format type to resolve
 * @return Formatter instance
 */
export default function resolveFormatter(type: string): Formatter<any> {
  const factory = registeredFormatterFactories[type];
  if (!factory) {
    throw new Error(`Unknown formatter type: ${type}`);
  }
  return factory();
}
