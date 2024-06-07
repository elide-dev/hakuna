import { Format } from "../formats";
import packageJson from "../../package.json";
import { Command } from "commander";
import { BenchmarkMode } from "src/modes";

function optionSymbols(enumType: object): string {
  return Object.values(enumType).filter((v) => typeof v === 'string').join(', ');
}

function setupOptions(program: Command) {
  program.description('Run benchmarks across runtimes, and generate comparative report data.')
  program.option('-v, --verbose', 'enable verbose logging')
  program.option('-q, --quiet', 'squelch most output')
  program.option('-f, --format <format>', `output format (options: ${optionSymbols(Format)})`, Format.BENCHER_JSON)
  program.option('-o, --output <file>')
  program.argument('[suites]', `suites to run (one or more globs; default is 'benchmarks/**/*.json')`)
  program.version(packageJson.version)
}

// Setup the command-line entrypoint for Hakuna.
export default function entrypoint(): Command {
  const program = new Command();
  setupOptions(program);
  return program;
}
