import { join, resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { argv } from "node:process";
import { Command } from "commander";
import { logger as logging } from "./lib/logger.js";
import { readSuite } from "./lib/suite.js"
import { executeSuite } from "./lib/driver.js"
import entrypointFactory from "./cli/entry.js"
import { MergedBenchmarkResults } from "./types.js";
import obtainFormatter, { Format } from "./formats";
import obtainOperator, { BenchmarkMode } from "./modes";

const defaultMode = BenchmarkMode.MICRO;
const defaultFormat = Format.BENCHER_JSON;
const defaultOutputFile = 'bench-results.json';

async function buildSuitePaths(program: Command): Promise<string[]> {
  return program.args || [];
}

export default async function runner(): Promise<void> {
  // build entrypoint method
  const entry = entrypointFactory();

  // setup resources like logging
  const logger = logging();
  entry.parse(argv);
  const options = entry.opts();
  if (options.verbose) {
    logger.info("Parsed options: " + JSON.stringify(options, null, 2));
  }

  const benchmarkMode = options.mode || defaultMode;
  const suitePaths = await buildSuitePaths(entry);
  const operator = obtainOperator(benchmarkMode);
  const formatter = obtainFormatter(options.format || defaultFormat);

  const outputFile = options.output || defaultOutputFile;
  const start = +(new Date());
  const mergedResults: MergedBenchmarkResults = {all: []};
  if (suitePaths.length === 0) {
    logger.error('No suite files found. Exiting.');
    process.exit(1);
  }

  for (const suitePath of suitePaths) {
    logger.info(`Reading suite from ${suitePath}...`);
    const suite = await readSuite(suitePath);
    logger.debug(`Suite for execution: ` + JSON.stringify(suite, null, 2));
  
    // execute the suite
    const benchStart = +(new Date());
    logger.debug('Running benchmarks...');
    const batchResults = await executeSuite(operator(entry), suite);
    const benchDone = +(new Date());
    mergedResults.all.push(...batchResults.all);
    logger.info(`Benchmark completed in ${Math.round(benchDone - benchStart)}ms`);
  }

  // write the results to stdout
  const done = +(new Date());
  logger.info(`All benchmarks completed in ${Math.round(done - start)}ms. Writing to '${outputFile}'...`);
  const resolvedOutputPath = resolve(join(process.cwd(), outputFile));
  logger.info(`Using formatter: ${formatter.constructor.name}`);
  const formatted = formatter.format(mergedResults);
  const serialized = formatter.serialize(formatted);
  writeFileSync(resolvedOutputPath, serialized, { encoding: 'utf8' });
  logger.info(`Done! Results written to '${resolvedOutputPath}'.`)
  process.exit(0);
}
