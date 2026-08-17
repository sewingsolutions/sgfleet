import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("../src/hooks/useToast", () => ({
  useToast: () => vi.fn(),
}));

const mockGenerateConfig = vi.fn().mockResolvedValue({
  config_json: '{"endpoint": "http://localhost"}',
  api_key: "sk-rotated-key",
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
  });

  test("renders without model selection", async () => {
    const ConfigModal = (await import("../src/components/ConfigModal")).default;
    render(<ConfigModal userId={1} userName="alice" onClose={vi.fn()} />);

    expect(screen.getByText("Generate config for")).toBeInTheDocument();
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate Config" })).toBeInTheDocument();
    // Tool dropdown should be present
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  test("displays rotate option checkbox", async () => {
    const ConfigModal = (await import("../src/components/ConfigModal")).default;
    render(<ConfigModal userId={1} userName="alice" onClose={vi.fn()} />);

    expect(screen.getByText("Rotate API key (generates a new key)")).toBeInTheDocument();
  });

  test("submits config generation request", async () => {
    const onClose = vi.fn();
    const ConfigModal = (await import("../src/components/ConfigModal")).default;
    render(<ConfigModal userId={1} userName="alice" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate Config" })).toBeEnabled();
    });

    await fireEvent.click(screen.getByRole("button", { name: "Generate Config" }));

    await waitFor(() => {
      expect(mockGenerateConfig).toHaveBeenCalledWith(1, false, "opencode");
    });

    await waitFor(() => {
      expect(screen.getByText("opencode config:")).toBeInTheDocument();
    });
  });

  test("handles rotate option", async () => {
    mockGenerateConfig.mockResolvedValue({
      config_json: '{"endpoint": "http://localhost"}',
      api_key: "sk-rotated-key",
      rotated: true,
    });

    const ConfigModal = (await import("../src/components/ConfigModal")).default;
    render(<ConfigModal userId={1} userName="alice" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate Config" })).toBeEnabled();
    });

    const rotateCheckbox = screen.getByLabelText("Rotate API key (generates a new key)");
    await fireEvent.click(rotateCheckbox);
    expect(rotateCheckbox).toBeChecked();

    await fireEvent.click(screen.getByRole("button", { name: "Generate Config" }));

    await waitFor(() => {
      expect(mockGenerateConfig).toHaveBeenCalledWith(1, true, "opencode");
    });
  });

  test("sends selected tool type to API", async () => {
    const ConfigModal = (await import("../src/components/ConfigModal")).default;
    render(<ConfigModal userId={2} userName="bob" onClose={vi.fn()} />);

    const select = screen.getByRole("combobox");
    await fireEvent.change(select, { target: { value: "cline" } });

    await fireEvent.click(screen.getByRole("button", { name: "Generate Config" }));

    await waitFor(() => {
      expect(mockGenerateConfig).toHaveBeenCalledWith(2, false, "cline");
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

    await fireEvent.click(screen.getByRole("button", { name: "Generate Config" }));

    await waitFor(() => {
      expect(screen.getByText("1. Step one")).toBeInTheDocument();
      expect(screen.getByText("2. Step two")).toBeInTheDocument();
    });
    expect(screen.getByText("val1")).toBeInTheDocument();
  });

  test("error banner can be dismissed", async () => {
    mockGenerateConfig.mockRejectedValue(new Error("Something broke"));

    const ConfigModal = (await import("../src/components/ConfigModal")).default;
    render(<ConfigModal userId={1} userName="alice" onClose={vi.fn()} />);

    await fireEvent.click(screen.getByRole("button", { name: "Generate Config" }));

    await waitFor(() => {
      expect(screen.getByText("Something broke")).toBeInTheDocument();
    });

    const dismissBtn = screen.getByRole("button", { name: "Dismiss error" });
    await fireEvent.click(dismissBtn);

    expect(screen.queryByText("Something broke")).not.toBeInTheDocument();
  });

  test("displays API key after generation", async () => {
    mockGenerateConfig.mockResolvedValue({
      config_json: '{"endpoint": "http://localhost"}',
      api_key: "sk-rotated-key",
      rotated: false,
    });

    const ConfigModal = (await import("../src/components/ConfigModal")).default;
    render(<ConfigModal userId={1} userName="alice" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate Config" })).toBeEnabled();
    });

    await fireEvent.click(screen.getByRole("button", { name: "Generate Config" }));

    await waitFor(() => {
      expect(screen.getByText("sk-rotated-key")).toBeInTheDocument();
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
    render(<ConfigModal userId={1} userName="alice" onClose={vi.fn()} />);

    await fireEvent.click(screen.getByRole("button", { name: "Generate Config" }));

    await waitFor(() => {
      expect(screen.getByText(/Rotated API Key/)).toBeInTheDocument();
    });
  });

  test("has Copy Key button after generation", async () => {
    const ConfigModal = (await import("../src/components/ConfigModal")).default;
    render(<ConfigModal userId={1} userName="alice" onClose={vi.fn()} />);

    await fireEvent.click(screen.getByRole("button", { name: "Generate Config" }));

    await waitFor(() => {
      expect(screen.getByText("Copy Key")).toBeInTheDocument();
    });
  });

  test("shows Copy and Download buttons for code config", async () => {
    const ConfigModal = (await import("../src/components/ConfigModal")).default;
    render(<ConfigModal userId={1} userName="alice" onClose={vi.fn()} />);

    await fireEvent.click(screen.getByRole("button", { name: "Generate Config" }));

    await waitFor(() => {
      expect(screen.getByText("Copy")).toBeInTheDocument();
      expect(screen.getByText("Download")).toBeInTheDocument();
    });
  });

  test("generating button shows loading state", async () => {
    const ConfigModal = (await import("../src/components/ConfigModal")).default;
    render(<ConfigModal userId={1} userName="alice" onClose={vi.fn()} />);

    await fireEvent.click(screen.getByRole("button", { name: "Generate Config" }));

    await waitFor(() => {
      expect(screen.getByText("Generating...")).toBeInTheDocument();
    });
  });

  test("preselects tool when clientType prop is provided", async () => {
    const ConfigModal = (await import("../src/components/ConfigModal")).default;
    render(<ConfigModal userId={1} userName="alice" clientType="cline" onClose={vi.fn()} />);

    const select = screen.getByRole("combobox");
    expect(select).toHaveValue("cline");
  });

  test("shows tool description after selection", async () => {
    const ConfigModal = (await import("../src/components/ConfigModal")).default;
    render(<ConfigModal userId={1} userName="alice" onClose={vi.fn()} />);

    const select = screen.getByRole("combobox");
    await fireEvent.change(select, { target: { value: "cline" } });

    await waitFor(() => {
      expect(screen.getByText(/VS Code settings/)).toBeInTheDocument();
    });
  });
});
