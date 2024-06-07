
# `hakuna`

[![CI](https://github.com/elide-dev/hakuna/actions/workflows/on.push.yml/badge.svg)](https://github.com/elide-dev/hakuna/actions/workflows/on.push.yml)

> [!WARNING]
> This library has not been published to NPM yet.

Small utility for running [`mitata`](https://github.com/evanwashere/mitata) across several runtimes and preparing reports from the results.

Hakuna ships as both a TypeScript library and a [Bun standalone executable](https://bun.sh/docs/bundler/executables).

## Usage

**First, write a benchmark and config file:**

```
vim ./bench-spec.json
```
```json
{
  "runtimes": ["node", "deno", "bun", "elide"],
  "suites": [
    ["./example.mjs", {"runtimes": ["node", "bun"]}],
    ["./another-case.mjs"]
  ]
}
```

> This is just an example; obviously, you should set your own test file path.

```
vim ./example.mjs
```
```javascript
bench('noop', () => {});
bench('noop2', () => {});

group('group', () => {
  baseline('baseline', () => {});
  bench('Date.now()', () => Date.now());
  bench('performance.now()', () => performance.now());
});

group({ name: 'group2', summary: false }, () => {
  bench('new Array(0)', () => new Array(0));
  bench('new Array(1024)', () => new Array(1024));
});
```

> The symbols from [Mitata](https://github.com/evanwashere/mitata) are automatically available for your script.

**Then, run:**

```
npx hakuna ./bench-spec.json
yarn exec hakuna ./bench-spec.json
pnpx hakuna ./bench-spec.json
bun x hakuna ./bench-spec.json

# Or:
npm i -g hakuna
yarn i -g hakuna
pnpm i -g hakuna
bun i -g hakuna

# And:
hakuna ./bench-spec.json
```

**And you get:**

```
cat ./bench-results.json | jq .
```
```json
{
  "all": [
    {
      "runtime": {
        "name": "node",
        "bin": "node",
        "resolved": "/Users/sam/.nvm/versions/node/v18.16.0/bin/node"
      },
      "suite": {
        "name": "example.mjs",
        "entry": "./tests/smoke/example.mjs",
        "resolved": "/Volumes/VAULTROOM/hakuna/tests/smoke/example.mjs",
        "runtimes": [
          "node",
          "bun",
          "elide"
        ],
        "args": [],
        "env": {},
        "sysEnv": true
      },
      "bench": {
        "benchmarks": [
          {
            "name": "noop",
            "group": null,
            "time": 500,
            "warmup": true,
            "baseline": false,
            "async": false,
            "stats": {
              "min": 0,
              "max": 225.03662109375,
              "p50": 0.06103515625,
              "p75": 0.06103515625,
              "p99": 0.08154296875,
              "p999": 0.18310546875,
              "avg": 0.063877119053025
            }
          },
        ]
      }
    }
  ]
}
```
