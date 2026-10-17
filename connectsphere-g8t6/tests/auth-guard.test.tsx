import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "@/app/page";

const mockRouter = { push: vi.fn(), replace: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => mockRouter),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/lib/api/events", () => ({
  getCurrentUser: vi.fn(),
}));

import { useAuth } from "@/components/auth/auth-provider";
import { getCurrentUser } from "@/lib/api/events";

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;
const mockGetCurrentUser = getCurrentUser as ReturnType<typeof vi.fn>;

function renderHome(session: { access_token: string } | null, loading: boolean, role?: string) {
  mockUseAuth.mockReturnValue({ session, loading, signOut: vi.fn() });
  mockGetCurrentUser.mockResolvedValue(role ? { user: { role } } : null);
  mockRouter.replace.mockClear();
  mockRouter.push.mockClear();
  return render(<Home />);
}

describe("Auth guard routing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows loading state while auth is loading", async () => {
    renderHome(null, true);
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated users to /login", async () => {
    renderHome(null, false);
    expect(mockRouter.replace).toHaveBeenCalledWith("/login");
  });

  it("redirects coordinator lead to /events", async () => {
    renderHome({ access_token: "token-123" }, false, "COORDINATOR_LEAD");
    await vi.waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/events");
    });
  });

  it("redirects organiser to /dashboard", async () => {
    renderHome({ access_token: "token-123" }, false, "ORGANISER");
    await vi.waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("shows forbidden for unknown role instead of bouncing to /login", async () => {
    renderHome({ access_token: "token-123" }, false, "ATTENDEE");
    await vi.waitFor(() => {
      expect(screen.getByText(/Insufficient permissions/)).toBeInTheDocument();
    });
    expect(mockRouter.replace).not.toHaveBeenCalledWith("/login");
  });
});
