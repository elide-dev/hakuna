import resolveFormatter, { Format, Formatter } from "./api";

export { Format } from "./api";
export type { Formatter } from "./api";

import "./bencher";

// Default output format to use.
export const defaultFormat = Format.BENCHER_JSON;

/**
 * Obtain a "formatter," which knows how to lay out benchmark data for a given reporting mechanism.
 *
 * @param type Type of format to obtain a formatter for
 * @return Formatter instance for the given format
 */
export default function obtainFormatter(type: Format = defaultFormat): Formatter<any> {
  return resolveFormatter(type);
}
