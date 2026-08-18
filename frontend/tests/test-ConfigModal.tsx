import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const mockConfirm = vi.fn().mockResolvedValue(true);

vi.mock("../src/hooks/useToast", () => ({
  useToast: () => vi.fn(),
}));

vi.mock("../src/hooks/useConfirm", () => ({
  useConfirm: () => mockConfirm,
}));

const mockGenerateConfig = vi.fn().mockResolvedValue({
  config_json: '{"endpoint": "http://localhost"}',
  api_key: "sk-test-key",
  rotated: false,
});

vi.mock("../src/api/client", () => ({
  api: {
    generateConfig: (...args: unknown[]) => mockGenerateConfig(...args),
  },
}));

describe("ConfigModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateConfig.mockResolvedValue({
      config_json: '{"endpoint": "http://localhost"}',
      api_key: "sk-test-key",
      rotated: false,
    });
  });

  test("renders header with user name", async () => {
    const ConfigModal = (await import("../src/components/ConfigModal")).default;
    render(<ConfigModal userId={1} userName="alice" clientType="opencode" onClose={vi.fn()} />);

    expect(screen.getByText("Generate config for")).toBeInTheDocument();
    expect(screen.getByText("alice")).toBeInTheDocument();
  });

  test("shows tool name when clientType is provided", async () => {
    const ConfigModal = (await import("../src/components/ConfigModal")).default;
    render(<ConfigModal userId={1} userName="alice" clientType="cline" onClose={vi.fn()} />);

    expect(screen.getByText("Cline / Roo Code")).toBeInTheDocument();
  });

  test("shows loading spinner on mount", async () => {
    const ConfigModal = (await import("../src/components/ConfigModal")).default;
    const { container } = render(<ConfigModal userId={1} userName="alice" clientType="opencode" onClose={vi.fn()} />);

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  test("auto-loads config on mount", async () => {
    const ConfigModal = (await import("../src/components/ConfigModal")).default;
    render(<ConfigModal userId={1} userName="alice" clientType="opencode" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(mockGenerateConfig).toHaveBeenCalledWith(1, false, "opencode");
    });
  });

  test("displays API key after generation", async () => {
    const ConfigModal = (await import("../src/components/ConfigModal")).default;
    render(<ConfigModal userId={1} userName="alice" clientType="opencode" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("sk-test-key")).toBeInTheDocument();
    });
    expect(screen.getByText("Current API Key:")).toBeInTheDocument();
  });

  test("displays rotated API key label when key was rotated", async () => {
    mockGenerateConfig.mockResolvedValue({
      config_json: "{}",
      api_key: "sk-new",
      rotated: true,
    });

    const ConfigModal = (await import("../src/components/ConfigModal")).default;
    render(<ConfigModal userId={1} userName="alice" clientType="opencode" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Rotated API Key/)).toBeInTheDocument();
    });
  });

  test("has Copy Key button after generation", async () => {
    const ConfigModal = (await import("../src/components/ConfigModal")).default;
    render(<ConfigModal userId={1} userName="alice" clientType="opencode" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Copy Key")).toBeInTheDocument();
    });
  });

  test("shows Copy and Download buttons for code config", async () => {
    const ConfigModal = (await import("../src/components/ConfigModal")).default;
    render(<ConfigModal userId={1} userName="alice" clientType="opencode" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Copy")).toBeInTheDocument();
      expect(screen.getByText("Download")).toBeInTheDocument();
    });
  });

  test("renders checklist for cursor tool", async () => {
    mockGenerateConfig.mockResolvedValue({
      config_json: "",
      api_key: "sk-test",
      checklist: [
        { step: "Step one", value: "val1" },
        { step: "Step two", value: "" },
      ],
    });

    const ConfigModal = (await import("../src/components/ConfigModal")).default;
    render(<ConfigModal userId={1} userName="alice" clientType="cursor" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("1. Step one")).toBeInTheDocument();
      expect(screen.getByText("2. Step two")).toBeInTheDocument();
    });
    expect(screen.getByText("val1")).toBeInTheDocument();
  });

  test("error banner can be dismissed", async () => {
    mockGenerateConfig.mockRejectedValue(new Error("Something broke"));

    const ConfigModal = (await import("../src/components/ConfigModal")).default;
    render(<ConfigModal userId={1} userName="alice" clientType="opencode" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Something broke")).toBeInTheDocument();
    });

    const dismissBtn = screen.getByRole("button", { name: "Dismiss error" });
    await fireEvent.click(dismissBtn);

    expect(screen.queryByText("Something broke")).not.toBeInTheDocument();
  });

  test("shows Rotate Key button after generation", async () => {
    const ConfigModal = (await import("../src/components/ConfigModal")).default;
    render(<ConfigModal userId={1} userName="alice" clientType="opencode" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Rotate Key")).toBeInTheDocument();
    });
  });

  test("rotate key triggers confirmation and reloads config", async () => {
    mockGenerateConfig.mockResolvedValue({
      config_json: '{"endpoint": "http://localhost"}',
      api_key: "sk-rotated-key",
      rotated: true,
    });

    const ConfigModal = (await import("../src/components/ConfigModal")).default;
    render(<ConfigModal userId={1} userName="alice" clientType="opencode" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Rotate Key")).toBeInTheDocument();
    });

    await fireEvent.click(screen.getByText("Rotate Key"));

    expect(mockConfirm).toHaveBeenCalledWith("Rotate API key? The current key will be invalidated immediately.", true);

    await waitFor(() => {
      expect(mockGenerateConfig).toHaveBeenCalledWith(1, true, "opencode");
    });

    await waitFor(() => {
      expect(screen.getByText("sk-rotated-key")).toBeInTheDocument();
    });
  });

  test("calls onClose when clicking backdrop", async () => {
    const onClose = vi.fn();
    const ConfigModal = (await import("../src/components/ConfigModal")).default;
    render(<ConfigModal userId={1} userName="alice" clientType="opencode" onClose={onClose} />);

    await fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  test("sends correct clientType to API", async () => {
    const ConfigModal = (await import("../src/components/ConfigModal")).default;
    render(<ConfigModal userId={2} userName="bob" clientType="cline" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(mockGenerateConfig).toHaveBeenCalledWith(2, false, "cline");
    });
  });
});
