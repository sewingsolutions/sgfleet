import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach } from "vitest";

afterEach(cleanup);

const mockUpdateUser = vi.fn().mockResolvedValue({});
const mockRotateKey = vi.fn().mockResolvedValue({ api_key: "new-key-123" });
const mockDeleteUser = vi.fn().mockResolvedValue({});
const mockConfirm = vi.fn().mockResolvedValue(true);

vi.mock("../src/hooks/useUsers", () => ({
  useUpdateUserMutation: () => ({ mutateAsync: mockUpdateUser }),
  useRotateKeyMutation: () => ({ mutateAsync: mockRotateKey }),
  useDeleteUserMutation: () => ({ mutateAsync: mockDeleteUser }),
}));

vi.mock("../src/hooks/useToast", () => ({
  useToast: () => vi.fn(),
}));

vi.mock("../src/hooks/useConfirm", () => ({
  useConfirm: () => mockConfirm,
}));

vi.mock("../src/components/ConfigModal", () => ({
  default: vi.fn(() => null),
}));

const makeWrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
};

const mockUser = {
  id: 1,
  name: "alice",
  is_active: true,
  rate_limit: 5,
  max_concurrent: 3,
  request_cost: 0.001,
  daily_quota: 1000,
  today_requests: 500,
  total_requests: 10000,
  created_at: "2024-01-15T00:00:00Z",
  api_key: "sk-xxxx",
  email: "alice@example.com",
  notes: null,
};

describe("UserCard", () => {
  let UserCard: React.ComponentType;

  beforeAll(async () => {
    UserCard = (await import("../src/components/UserCard")).default;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders user name, badge, and stats", () => {
    render(<UserCard user={mockUser} />, { wrapper: makeWrapper() });

    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  test("shows quota progress bar when daily_quota is set", () => {
    render(<UserCard user={mockUser} />, { wrapper: makeWrapper() });

    expect(screen.getByText("500 / 1k today")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  test("quota color is green when under 80%", () => {
    render(<UserCard user={{ ...mockUser, today_requests: 400, daily_quota: 1000 }} />, { wrapper: makeWrapper() });

    const bar = document.querySelector('[style*="width"]');
    expect(bar?.className).toContain("bg-emerald-500");
  });

  test("quota color is amber at 80%", () => {
    render(<UserCard user={{ ...mockUser, today_requests: 800, daily_quota: 1000 }} />, { wrapper: makeWrapper() });

    const bar = document.querySelector('[style*="width"]');
    expect(bar?.className).toContain("bg-amber-500");
  });

  test("quota color is red at 100%", () => {
    render(<UserCard user={{ ...mockUser, today_requests: 1000, daily_quota: 1000 }} />, { wrapper: makeWrapper() });

    const bar = document.querySelector('[style*="width"]');
    expect(bar?.className).toContain("bg-red-500");
  });

  test("toggle button fires update mutation", async () => {
    render(<UserCard user={mockUser} />, { wrapper: makeWrapper() });

    const disableBtn = screen.getByText("Disable");
    await fireEvent.click(disableBtn);

    expect(mockUpdateUser).toHaveBeenCalledWith({
      id: 1,
      data: { is_active: false },
    });
  });

  test("rotate key button shows key display", async () => {
    render(<UserCard user={mockUser} />, { wrapper: makeWrapper() });

    const rotateBtn = screen.getByText("Rotate Key");
    await fireEvent.click(rotateBtn);

    await waitFor(() => {
      expect(screen.getByText("new-key-123")).toBeInTheDocument();
    });
  });

  test("config dropdown shows selected tool name", async () => {
    render(<UserCard user={mockUser} />, { wrapper: makeWrapper() });

    expect(screen.getByText("opencode")).toBeInTheDocument();
  });

  test("config dropdown opens and lists tools", async () => {
    render(<UserCard user={mockUser} />, { wrapper: makeWrapper() });

    const dropdownBtn = screen.getByText("opencode");
    await fireEvent.click(dropdownBtn);

    expect(screen.getByText("Continue.dev")).toBeInTheDocument();
    expect(screen.getByText("Cline / Roo Code")).toBeInTheDocument();
    expect(screen.getByText("Cursor")).toBeInTheDocument();
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
  });

  test("selecting a tool from dropdown calls onSelect callback", async () => {
    render(<UserCard user={mockUser} />, { wrapper: makeWrapper() });

    const dropdownBtn = screen.getByText("opencode");
    await fireEvent.click(dropdownBtn);

    expect(screen.getByText("Continue.dev")).toBeInTheDocument();
  });

  test("delete button calls delete mutation after confirmation", async () => {
    render(<UserCard user={mockUser} />, { wrapper: makeWrapper() });

    const deleteBtn = screen.getByText("Delete");
    await fireEvent.click(deleteBtn);

    expect(mockConfirm).toHaveBeenCalledWith("Delete alice?", true);
    expect(mockDeleteUser).toHaveBeenCalledWith(1);
  });

  test("edit button expands edit panel", async () => {
    render(<UserCard user={mockUser} />, { wrapper: makeWrapper() });

    const editBtn = screen.getByTitle("Edit user");
    await fireEvent.click(editBtn);

    expect(screen.getByText("Edit settings")).toBeInTheDocument();
    expect(screen.getByDisplayValue("alice")).toBeInTheDocument();
  });

  test("edit panel contains all editable fields", async () => {
    render(<UserCard user={mockUser} />, { wrapper: makeWrapper() });

    const editBtn = screen.getByTitle("Edit user");
    await fireEvent.click(editBtn);

    expect(screen.getAllByText("Rate/s").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Concurrent").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Cost/req ($)")).toBeInTheDocument();
    expect(screen.getByText("Daily quota")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Notes")).toBeInTheDocument();
  });

  test("save button in edit panel calls update mutation", async () => {
    render(<UserCard user={mockUser} />, { wrapper: makeWrapper() });

    const editBtn = screen.getByTitle("Edit user");
    await fireEvent.click(editBtn);

    const nameInput = screen.getByDisplayValue("alice");
    await fireEvent.change(nameInput, { target: { value: "bob" } });

    await fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalled();
    });
  });

  test("cancel button closes edit panel", async () => {
    render(<UserCard user={mockUser} />, { wrapper: makeWrapper() });

    const editBtn = screen.getByTitle("Edit user");
    await fireEvent.click(editBtn);

    expect(screen.getByText("Edit settings")).toBeInTheDocument();

    await fireEvent.click(screen.getByText("Cancel"));

    expect(screen.queryByText("Edit settings")).not.toBeInTheDocument();
  });
});
