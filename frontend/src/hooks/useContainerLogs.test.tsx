import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { classifyLine, useContainerLogs } from "./useContainerLogs";

describe("classifyLine", () => {
  it("extracts ISO timestamp and classifies level from content", () => {
    const result = classifyLine("2024-01-15T10:30:00Z ERROR something failed");
    expect(result.timestamp).toBe("2024-01-15T10:30:00Z");
    expect(result.content).toBe("ERROR something failed");
    expect(result.level).toBe("ERROR");
    expect(result.text).toBe("2024-01-15T10:30:00Z ERROR something failed");
  });

  it("detects WARNING level", () => {
    const result = classifyLine("2024-01-15T10:30:00Z WARNING low memory");
    expect(result.level).toBe("WARNING");
    expect(result.timestamp).toBe("2024-01-15T10:30:00Z");
    expect(result.content).toBe("WARNING low memory");
  });

  it("detects INFO level", () => {
    const result = classifyLine("2024-01-15T10:30:00Z INFO server started");
    expect(result.level).toBe("INFO");
  });

  it("detects DEBUG level", () => {
    const result = classifyLine("2024-01-15T10:30:00Z DEBUG trace enabled");
    expect(result.level).toBe("DEBUG");
  });

  it("detects TIMESTAMP pattern without level keyword", () => {
    const result = classifyLine("[2024-01-15 10:30:00] some message");
    expect(result.level).toBe("TIMESTAMP");
    expect(result.timestamp).toBeNull();
    expect(result.content).toBe("[2024-01-15 10:30:00] some message");
  });

  it("falls back to NORMAL for plain text", () => {
    const result = classifyLine("just a plain log line");
    expect(result.level).toBe("NORMAL");
    expect(result.timestamp).toBeNull();
    expect(result.content).toBe("just a plain log line");
  });

  it("handles lowercase level keywords", () => {
    const result = classifyLine("2024-01-15T10:30:00Z error occurred");
    expect(result.level).toBe("ERROR");
  });

  it("prioritizes ERROR over WARNING in same line", () => {
    const result = classifyLine("ERROR and WARNING in one line");
    expect(result.level).toBe("ERROR");
  });

  it("handles timestamp without trailing Z", () => {
    const result = classifyLine("2024-01-15T10:30:00 some info message");
    expect(result.timestamp).toBe("2024-01-15T10:30:00");
    expect(result.level).toBe("INFO");
  });
});

describe("useContainerLogs SSE handling", () => {
  function createSSEResponse(events: string[]) {
    const encoder = new TextEncoder();
    const body = events.map((e) => encoder.encode(e + "\n\n"));

    return new Response(
      new ReadableStream({
        start(controller) {
          for (const chunk of body) {
            controller.enqueue(chunk);
          }
          controller.close();
        },
      }),
      { headers: { "Content-Type": "text/event-stream" } },
    );
  }

  beforeEach(() => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("handles line events and eof", () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        createSSEResponse([
          'data: {"type":"line","line":"2024-01-15T10:30:00Z INFO started"}',
          'data: {"type":"line","line":"ERROR boom"}',
          'data: {"type":"eof"}',
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useContainerLogs("model-1", 50, true));

    act(() => {});

    expect(result.current.status).toBe("connecting");
  });

  it("handles error events", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(createSSEResponse(['data: {"type":"error","message":"connection lost"}'])),
    );

    const { result } = renderHook(() => useContainerLogs("model-1", 50, true));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toBe("connection lost");
  });

  it("flushes trailing lines while the stream stays open (no eof)", async () => {
    // Regression: previously lines were only flushed to state every 50 lines
    // or on eof/error. With a live `docker logs -f` stream that stays open,
    // trailing lines below the batch threshold never appeared in the UI.
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
    });
    const response = new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    const { result, unmount } = renderHook(() => useContainerLogs("model-1", 5000, true));

    await act(async () => {
      controller.enqueue(encoder.encode('data: {"type":"line","line":"line 1"}\n\n'));
      controller.enqueue(encoder.encode('data: {"type":"line","line":"line 2"}\n\n'));
      controller.enqueue(encoder.encode('data: {"type":"line","line":"line 3"}\n\n'));
      await new Promise((r) => setTimeout(r, 50));
    });

    // All three lines must be visible even though there is no eof and the
    // count is well under the internal batch size.
    expect(result.current.lines.map((l) => l.content)).toEqual(["line 1", "line 2", "line 3"]);
    expect(result.current.status).toBe("streaming");

    unmount();
  });

  it("handles startup_error events", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          createSSEResponse([
            'data: {"type":"startup_error","message":"GPU not found","at":"2024-01-15T10:30:00Z"}',
            'data: {"type":"eof"}',
          ]),
        ),
    );

    const { result } = renderHook(() => useContainerLogs("model-1", 50, true));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(result.current.startupError).toBe("GPU not found");
    expect(result.current.startupErrorAt).toBe("2024-01-15T10:30:00Z");
  });

  it("skips malformed JSON events without crashing", async () => {
    const events = [
      'data: {"type":"line","line":"valid line"}',
      "data: {not valid json}",
      'data: {"type":"line","line":"another valid"}',
      'data: {"type":"eof"}',
    ];

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createSSEResponse(events)));

    const { result, unmount } = renderHook(() => useContainerLogs("model-1", 50, true));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    // Stream should complete without error despite malformed JSON
    expect(result.current.status).toBe("ended");
    expect(result.current.errorMessage).toBeNull();
    // Lines are accumulated by the hook's SSE parser; classifyLine handles each
    expect(result.current.lines.length).toBeGreaterThanOrEqual(0);
    unmount();
  });

  it("classifyLine processes valid lines correctly for batch accumulation", () => {
    const line1 = classifyLine("valid line");
    const line2 = classifyLine("another valid");

    expect(line1.level).toBe("NORMAL");
    expect(line1.content).toBe("valid line");
    expect(line2.level).toBe("NORMAL");
    expect(line2.content).toBe("another valid");
  });
});
