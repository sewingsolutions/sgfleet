import { describe, it, expect } from "vitest";
import { parseFlags, serializeFlags } from "../src/utils/flags";

describe("ModelEditPage command flag helpers", () => {
  it("parses flat argv list into pair rows", () => {
    const argv = [
      "--context-length",
      "170124",
      "--kv-cache-dtype",
      "fp8_e4m3",
      "--enable-metrics",
      "--enable-flashinfer",
      "--reasoning-parser",
      "qwen3",
      "--json-model-override-args",
      '{"rope_scaling":{"factor":3.0}}',
    ];
    expect(parseFlags(argv)).toEqual([
      { key: "--context-length", value: "170124" },
      { key: "--kv-cache-dtype", value: "fp8_e4m3" },
      { key: "--enable-metrics", value: "" },
      { key: "--enable-flashinfer", value: "" },
      { key: "--reasoning-parser", value: "qwen3" },
      { key: "--json-model-override-args", value: '{"rope_scaling":{"factor":3.0}}' },
    ]);
  });

  it("returns an empty starter row for empty/null input", () => {
    expect(parseFlags([])).toEqual([{ key: "", value: "" }]);
    expect(parseFlags(undefined)).toEqual([{ key: "", value: "" }]);
    expect(parseFlags(null)).toEqual([{ key: "", value: "" }]);
  });

  it("serializes each row as separate argv tokens (never joined by spaces)", () => {
    const argv = serializeFlags([
      { key: "--context-length", value: "170124" },
      { key: "--enable-metrics", value: "" },
      { key: "--reasoning-parser", value: "qwen3" },
      { key: "", value: "ignored" }, // empty key rows are dropped
    ]);
    expect(argv).toEqual(["--context-length", "170124", "--enable-metrics", "--reasoning-parser", "qwen3"]);
    // Regression: no argv token should contain a space (docker would forward
    // "--context-length 170124" as ONE argv element, which sglang rejects with
    // "unrecognized arguments").
    for (const tok of argv) expect(tok.includes(" ")).toBe(false);
  });

  it("round-trips the qwen3 flags list", () => {
    const argv = [
      "--context-length",
      "170124",
      "--kv-cache-dtype",
      "fp8_e4m3",
      "--mem-fraction-static",
      "0.82",
      "--chunked-prefill-size",
      "8192",
      "--enable-metrics",
      "--enable-flashinfer",
      "--flashinfer-allreduce-fusion-backend",
      "auto",
      "--reasoning-parser",
      "qwen3",
      "--tool-call-parser",
      "qwen3_coder",
      "--json-model-override-args",
      '{"rope_scaling":{"rope_type":"yarn","factor":3.0}}',
      "--speculative-algorithm",
      "NGRAM",
      "--speculative-num-steps",
      "4",
    ];
    expect(serializeFlags(parseFlags(argv))).toEqual(argv);
  });
});
