import os

os.environ.setdefault("ADMIN_API_KEY", "test-secret-key-for-testing")

from app.db import _normalize_command_flags


def test_flat_argv_list_passes_through_unchanged():
    argv = [
        "--context-length",
        "170124",
        "--kv-cache-dtype",
        "fp8_e4m3",
        "--enable-metrics",
        "--reasoning-parser",
        "qwen3",
    ]
    assert _normalize_command_flags(argv) == argv


def test_legacy_joined_strings_are_split_into_argv_tokens():
    """Regression: earlier UI persisted "--flag value" as a single token.

    Docker then passed each element verbatim as one argv token, so sglang
    saw ``--context-length 170124`` (with a literal space) and rejected it
    as "unrecognized arguments". The DB layer must repair such rows on read.
    """
    argv = [
        "--context-length 170124",
        "--kv-cache-dtype fp8_e4m3",
        "--enable-metrics",
        "--enable-flashinfer",
        '--json-model-override-args {"rope_scaling":{"factor":3.0}}',
        "--speculative-num-steps 4",
    ]
    assert _normalize_command_flags(argv) == [
        "--context-length",
        "170124",
        "--kv-cache-dtype",
        "fp8_e4m3",
        "--enable-metrics",
        "--enable-flashinfer",
        "--json-model-override-args",
        '{"rope_scaling":{"factor":3.0}}',
        "--speculative-num-steps",
        "4",
    ]


def test_non_flag_tokens_with_whitespace_are_preserved_as_one_element():
    # Only tokens starting with '--' are eligible for the split-repair.
    argv = ["NGRAM", "some value"]
    assert _normalize_command_flags(argv) == ["NGRAM", "some value"]


def test_empty_and_invalid_inputs():
    assert _normalize_command_flags(None) == []
    assert _normalize_command_flags([]) == []
    assert _normalize_command_flags(["", "  ", "--x"]) == ["--x"]
    assert _normalize_command_flags(["--x", 123, {"nope": True}, "--y", "v"]) == ["--x", "--y", "v"]
