import { Command } from "commander";

import {
  BenchmarkMode,
  BenchmarkOperator,
  operatorForType,
  OperatorContext,
} from "./api";

export { BenchmarkMode };
export type { BenchmarkOperator, OperatorContext };

import "./micro";

// Central registry of benchmark operators.
export default function obtainOperator(type: BenchmarkMode): (args: Command) => BenchmarkOperator<any> {
  return operatorForType(type);
}
