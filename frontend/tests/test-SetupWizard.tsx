import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockCopyToClipboard = vi.fn();
vi.mock("../src/utils/copyToClipboard", () => ({
  copyToClipboard: () => mockCopyToClipboard(),
}));

const mockNavigate = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  MemoryRouter: ({ children }: { children: React.ReactNode }) => children,
}));

const mockCompleteSetup = vi.fn();
const mockGetSetupStatus = vi.fn();

vi.mock("../src/api/client", () => ({
  api: {
    getSetupStatus: () => mockGetSetupStatus(),
    completeSetup: (data: object) => mockCompleteSetup(data),
  },
}));

const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
};

const renderSetupWizard = async () => {
  const SetupWizard = (await import("../src/pages/SetupWizard")).default;
  return render(
    <TestWrapper>
      <SetupWizard />
    </TestWrapper>,
  );
};

describe("SetupWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    mockGetSetupStatus.mockResolvedValue({ setup_complete: false });
    mockCompleteSetup.mockResolvedValue({
      setup_complete: true,
      admin_name: "Admin",
      admin_api_key: "sk-test-12345",
    });
  });

  test("renders welcome step initially", async () => {
    await renderSetupWizard();

    expect(screen.getByText("Welcome to SGFleet")).toBeInTheDocument();
    expect(screen.getByText("Get Started")).toBeInTheDocument();
  });

  test("navigates to admin name step on Get Started", async () => {
    await renderSetupWizard();

    fireEvent.click(screen.getByText("Get Started"));
    expect(screen.getByText("Admin Display Name")).toBeInTheDocument();
  });

  test("Next button disabled when admin name empty", async () => {
    await renderSetupWizard();

    fireEvent.click(screen.getByText("Get Started"));
    const nextBtn = screen.getByText("Next");
    expect(nextBtn).toBeDisabled();
  });

  test("Next button enabled when admin name filled", async () => {
    await renderSetupWizard();

    fireEvent.click(screen.getByText("Get Started"));
    const input = screen.getByPlaceholderText("e.g. Admin");
    fireEvent.change(input, { target: { value: "TestAdmin" } });

    const nextBtn = screen.getByText("Next");
    expect(nextBtn).toBeEnabled();
  });

  test("back button returns to previous step", async () => {
    await renderSetupWizard();

    fireEvent.click(screen.getByText("Get Started"));
    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByText("Welcome to SGFleet")).toBeInTheDocument();
  });

  test("navigates through all steps", async () => {
    await renderSetupWizard();

    fireEvent.click(screen.getByText("Get Started"));
    expect(screen.getByText("Admin Display Name")).toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText("e.g. Admin");
    fireEvent.change(nameInput, { target: { value: "Admin" } });
    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText(/The base URL for your SGFleet gateway/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("HuggingFace Token")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Review & Complete")).toBeInTheDocument();
  });

  test("displays admin name in review step", async () => {
    await renderSetupWizard();

    fireEvent.click(screen.getByText("Get Started"));
    const nameInput = screen.getByPlaceholderText("e.g. Admin");
    fireEvent.change(nameInput, { target: { value: "TestAdmin" } });
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Next"));

    expect(screen.getByText("TestAdmin")).toBeInTheDocument();
  });

  test("displays masked HF token in review step", async () => {
    await renderSetupWizard();

    fireEvent.click(screen.getByText("Get Started"));
    const nameInput = screen.getByPlaceholderText("e.g. Admin");
    fireEvent.change(nameInput, { target: { value: "Admin" } });
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Next"));

    const hfInput = screen.getByPlaceholderText("hf_xxxxxxxxxxxx");
    fireEvent.change(hfInput, { target: { value: "hf_mysecret" } });
    fireEvent.click(screen.getByText("Next"));

    expect(screen.getByText("\u2022\u2022\u2022\u2022\u2022\u2022")).toBeInTheDocument();
  });

  test("complete setup calls API and shows key", async () => {
    await renderSetupWizard();

    fireEvent.click(screen.getByText("Get Started"));
    const nameInput = screen.getByPlaceholderText("e.g. Admin");
    fireEvent.change(nameInput, { target: { value: "Admin" } });
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Next"));

    await act(async () => {
      fireEvent.click(screen.getByText("Complete Setup"));
    });

    await waitFor(() => {
      expect(mockCompleteSetup).toHaveBeenCalledWith({
        admin_name: "Admin",
        base_url: "",
        hf_token: undefined,
      });
    });

    expect(screen.getByText("Setup Complete!")).toBeInTheDocument();
    expect(screen.getByText("sk-test-12345")).toBeInTheDocument();
  });

  test("complete setup shows error on API failure", async () => {
    mockCompleteSetup.mockRejectedValue(new Error("Setup already completed"));

    await renderSetupWizard();

    fireEvent.click(screen.getByText("Get Started"));
    const nameInput = screen.getByPlaceholderText("e.g. Admin");
    fireEvent.change(nameInput, { target: { value: "Admin" } });
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Next"));

    await act(async () => {
      fireEvent.click(screen.getByText("Complete Setup"));
    });

    await waitFor(() => {
      expect(screen.getByText("Setup already completed")).toBeInTheDocument();
    });
  });

  test("show loading state during setup", async () => {
    mockCompleteSetup.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                setup_complete: true,
                admin_name: "Admin",
                admin_api_key: "sk-test-12345",
              }),
            100,
          ),
        ),
    );

    await renderSetupWizard();

    fireEvent.click(screen.getByText("Get Started"));
    const nameInput = screen.getByPlaceholderText("e.g. Admin");
    fireEvent.change(nameInput, { target: { value: "Admin" } });
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Next"));

    fireEvent.click(screen.getByText("Complete Setup"));
    expect(screen.getByText("Setting up...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Setup Complete!")).toBeInTheDocument();
    });
  });

  test("copy key button works", async () => {
    await renderSetupWizard();

    fireEvent.click(screen.getByText("Get Started"));
    const nameInput = screen.getByPlaceholderText("e.g. Admin");
    fireEvent.change(nameInput, { target: { value: "Admin" } });
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Next"));

    await act(async () => {
      fireEvent.click(screen.getByText("Complete Setup"));
    });

    await waitFor(() => {
      expect(screen.getByText("sk-test-12345")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Copy"));
    await waitFor(() => {
      expect(mockCopyToClipboard).toHaveBeenCalled();
    });
  });

  test("go to login navigates after setup complete", async () => {
    await renderSetupWizard();

    fireEvent.click(screen.getByText("Get Started"));
    const nameInput = screen.getByPlaceholderText("e.g. Admin");
    fireEvent.change(nameInput, { target: { value: "Admin" } });
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Next"));

    await act(async () => {
      fireEvent.click(screen.getByText("Complete Setup"));
    });

    await waitFor(() => {
      expect(screen.getByText("Setup Complete!")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Go to Login"));
    expect(mockNavigate).toHaveBeenCalledWith("/login", { replace: true });
  });

  test("clear base url button works", async () => {
    await renderSetupWizard();

    fireEvent.click(screen.getByText("Get Started"));
    const nameInput = screen.getByPlaceholderText("e.g. Admin");
    fireEvent.change(nameInput, { target: { value: "Admin" } });
    fireEvent.click(screen.getByText("Next"));

    const urlInput = screen.getByPlaceholderText("https://api.example.com/v1");
    fireEvent.change(urlInput, { target: { value: "https://example.com" } });
    fireEvent.click(screen.getByText("Clear"));
    expect(urlInput).toHaveValue("");
  });

  test("step indicators show correct state", async () => {
    await renderSetupWizard();

    // After moving to step 1, step 0 (Welcome) indicator should show checkmark
    fireEvent.click(screen.getByText("Get Started"));
    const checkmark = screen.getByText("\u2713");
    expect(checkmark).toBeInTheDocument();
  });
});
