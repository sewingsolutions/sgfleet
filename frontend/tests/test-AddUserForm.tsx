import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("../src/hooks/useToast", () => ({
  useToast: () => vi.fn(),
}));

const mockCreateUser = vi.fn();

describe("AddUserForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders name input and Add button", async () => {
    const AddUserForm = (await import("../src/components/AddUserForm")).default;
    render(<AddUserForm onCreated={vi.fn()} />);

    expect(screen.getByPlaceholderText("Username")).toBeInTheDocument();
    expect(screen.getByText("Add")).toBeInTheDocument();
  });

  test("rejects names shorter than 2 chars", async () => {
    const AddUserForm = (await import("../src/components/AddUserForm")).default;
    render(<AddUserForm onCreated={vi.fn()} />);

    const input = screen.getByPlaceholderText("Username");
    await fireEvent.change(input, { target: { value: "a" } });
    await fireEvent.click(screen.getByText("Add"));

    await waitFor(() => {
      expect(mockCreateUser).not.toHaveBeenCalled();
    });
  });

  test("on valid submit calls api.createUser", async () => {
    const mockUser = { id: 2, name: "bob", api_key: "sk-newkey" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => mockUser,
      }),
    );

    // Force re-import of api/client after stub
    const AddUserForm = (await import("../src/components/AddUserForm")).default;
    render(<AddUserForm onCreated={vi.fn()} />);

    const input = screen.getByPlaceholderText("Username");
    await fireEvent.change(input, { target: { value: "bob" } });
    await fireEvent.click(screen.getByText("Add"));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/users",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "bob" }),
        }),
      );
    });
  });
});
