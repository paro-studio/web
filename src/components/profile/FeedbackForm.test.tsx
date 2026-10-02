import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FeedbackForm } from "./FeedbackForm";
import { submitFeedback, sendFeedbackEmail } from "@/services/supabase/feedback";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

vi.mock("@/services/supabase/feedback", () => ({
  submitFeedback: vi.fn(),
  sendFeedbackEmail: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: vi.fn(),
}));

const mockToast = vi.fn();
const mockUser = { id: "user-123", email: "test@example.com" };

describe("FeedbackForm", () => {
  beforeEach(() => {
    vi.mocked(useToast).mockReturnValue({ toast: mockToast } as any);
    vi.mocked(useAuth).mockReturnValue({
      user: mockUser,
      session: null,
      profile: null,
      loading: false,
      sessionLoading: false,
      needsProfileCompletion: false,
    } as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Form Rendering", () => {
    it("renders subject and message fields", () => {
      render(<FeedbackForm />);

      expect(screen.getByLabelText(/Subject/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Message/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Submit Feedback/i })).toBeInTheDocument();
    });

    it("shows form descriptions", () => {
      render(<FeedbackForm />);

      expect(screen.getByText(/Briefly describe the topic/i)).toBeInTheDocument();
    });

    it("submit button is initially enabled", () => {
      render(<FeedbackForm />);

      const submitButton = screen.getByRole("button", { name: /Submit Feedback/i });
      expect(submitButton).not.toBeDisabled();
    });
  });

  describe("Validation", () => {
    it("prevents submission with short subject (< 2 chars)", async () => {
      render(<FeedbackForm />);

      const subjectInput = screen.getByLabelText(/Subject/i) as HTMLInputElement;
      const submitButton = screen.getByRole("button", { name: /Submit Feedback/i });

      await act(async () => {
        fireEvent.change(subjectInput, { target: { value: "a" } });
        fireEvent.click(submitButton);
      });

      expect(screen.getByText(/Subject must be at least 2 characters/i)).toBeInTheDocument();
      expect(submitFeedback).not.toHaveBeenCalled();
    });

    it("prevents submission with short message (< 10 chars)", async () => {
      render(<FeedbackForm />);

      const subjectInput = screen.getByLabelText(/Subject/i) as HTMLInputElement;
      const messageInput = screen.getByLabelText(/Message/i) as HTMLTextAreaElement;
      const submitButton = screen.getByRole("button", { name: /Submit Feedback/i });

      await act(async () => {
        fireEvent.change(subjectInput, { target: { value: "Test Subject" } });
        fireEvent.change(messageInput, { target: { value: "short" } });
        fireEvent.click(submitButton);
      });

      expect(screen.getByText(/Message must be at least 10 characters/i)).toBeInTheDocument();
      expect(submitFeedback).not.toHaveBeenCalled();
    });

    it("prevents submission with empty form", async () => {
      render(<FeedbackForm />);

      const submitButton = screen.getByRole("button", { name: /Submit Feedback/i });

      await act(async () => {
        fireEvent.click(submitButton);
      });

      expect(submitFeedback).not.toHaveBeenCalled();
      expect(sendFeedbackEmail).not.toHaveBeenCalled();
    });

    it("accepts valid subject and message", async () => {
      vi.mocked(submitFeedback).mockResolvedValue({ error: null });
      vi.mocked(sendFeedbackEmail).mockResolvedValue({ error: null });

      render(<FeedbackForm />);

      const subjectInput = screen.getByLabelText(/Subject/i) as HTMLInputElement;
      const messageInput = screen.getByLabelText(/Message/i) as HTMLTextAreaElement;
      const submitButton = screen.getByRole("button", { name: /Submit Feedback/i });

      await act(async () => {
        fireEvent.change(subjectInput, { target: { value: "Great Feature" } });
        fireEvent.change(messageInput, { target: { value: "This is a really helpful feature." } });
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(submitFeedback).toHaveBeenCalledWith({
          user_id: "user-123",
          subject: "Great Feature",
          message: "This is a really helpful feature.",
        });
      });
    });
  });

  describe("Loading State", () => {
    it("disables submit button while submitting", async () => {
      vi.mocked(submitFeedback).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ error: null }), 80))
      );
      vi.mocked(sendFeedbackEmail).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ error: null }), 80))
      );

      render(<FeedbackForm />);

      const subjectInput = screen.getByLabelText(/Subject/i) as HTMLInputElement;
      const messageInput = screen.getByLabelText(/Message/i) as HTMLTextAreaElement;
      const submitButton = screen.getByRole("button", { name: /Submit Feedback/i });

      await act(async () => {
        fireEvent.change(subjectInput, { target: { value: "Valid Subject" } });
        fireEvent.change(messageInput, { target: { value: "Valid message here." } });
        fireEvent.click(submitButton);
      });

      expect(submitButton).toBeDisabled();
      expect(screen.getByText(/Sending/i)).toBeInTheDocument();

      await waitFor(
        () => {
          expect(submitButton).not.toBeDisabled();
        },
        { timeout: 500 }
      );
    });

    it("shows loading spinner during submission", async () => {
      vi.mocked(submitFeedback).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ error: null }), 50))
      );
      vi.mocked(sendFeedbackEmail).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ error: null }), 50))
      );

      render(<FeedbackForm />);

      const subjectInput = screen.getByLabelText(/Subject/i) as HTMLInputElement;
      const messageInput = screen.getByLabelText(/Message/i) as HTMLTextAreaElement;
      const submitButton = screen.getByRole("button", { name: /Submit Feedback/i });

      await act(async () => {
        fireEvent.change(subjectInput, { target: { value: "Test" } });
        fireEvent.change(messageInput, { target: { value: "Test message content here." } });
        fireEvent.click(submitButton);
      });

      // Should show spinner
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Sending/i })).toBeInTheDocument();
      });
    });
  });

  describe("Successful Submission", () => {
    it("shows success toast and resets form on success", async () => {
      vi.mocked(submitFeedback).mockResolvedValue({ error: null });
      vi.mocked(sendFeedbackEmail).mockResolvedValue({ error: null });

      render(<FeedbackForm />);

      const subjectInput = screen.getByLabelText(/Subject/i) as HTMLInputElement;
      const messageInput = screen.getByLabelText(/Message/i) as HTMLTextAreaElement;
      const submitButton = screen.getByRole("button", { name: /Submit Feedback/i });

      await act(async () => {
        fireEvent.change(subjectInput, { target: { value: "Feature Request" } });
        fireEvent.change(messageInput, { target: { value: "Would love dark mode for the gallery." } });
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Feedback sent!",
            description: "Thank you for your feedback. We appreciate it!",
          })
        );
      });

      // Form should be reset
      expect(subjectInput.value).toBe("");
      expect(messageInput.value).toBe("");
    });

    it("calls sendFeedbackEmail after successful database insert", async () => {
      vi.mocked(submitFeedback).mockResolvedValue({ error: null });
      vi.mocked(sendFeedbackEmail).mockResolvedValue({ error: null });

      render(<FeedbackForm />);

      const subjectInput = screen.getByLabelText(/Subject/i) as HTMLInputElement;
      const messageInput = screen.getByLabelText(/Message/i) as HTMLTextAreaElement;
      const submitButton = screen.getByRole("button", { name: /Submit Feedback/i });

      await act(async () => {
        fireEvent.change(subjectInput, { target: { value: "Bug Found" } });
        fireEvent.change(messageInput, { target: { value: "The search function crashes sometimes." } });
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(submitFeedback).toHaveBeenCalledTimes(1);
        expect(sendFeedbackEmail).toHaveBeenCalledWith({
          user_id: "user-123",
          subject: "Bug Found",
          message: "The search function crashes sometimes.",
          user_email: "test@example.com",
        });
      });
    });

    it("shows success even if email sending fails (graceful degradation)", async () => {
      vi.mocked(submitFeedback).mockResolvedValue({ error: null });
      vi.mocked(sendFeedbackEmail).mockResolvedValue({
        error: "Email service temporarily down",
      });

      render(<FeedbackForm />);

      const subjectInput = screen.getByLabelText(/Subject/i) as HTMLInputElement;
      const messageInput = screen.getByLabelText(/Message/i) as HTMLTextAreaElement;
      const submitButton = screen.getByRole("button", { name: /Submit Feedback/i });

      await act(async () => {
        fireEvent.change(subjectInput, { target: { value: "Test Feedback" } });
        fireEvent.change(messageInput, { target: { value: "This is a test message for feedback." } });
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        // Should still show success because database insert worked
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Feedback sent!",
          })
        );
      });
    });
  });

  describe("Failed Submission", () => {
    it("shows error toast when database insert fails", async () => {
      const dbError = { message: "Database connection failed" };
      vi.mocked(submitFeedback).mockResolvedValue({ error: dbError as any });

      render(<FeedbackForm />);

      const subjectInput = screen.getByLabelText(/Subject/i) as HTMLInputElement;
      const messageInput = screen.getByLabelText(/Message/i) as HTMLTextAreaElement;
      const submitButton = screen.getByRole("button", { name: /Submit Feedback/i });

      await act(async () => {
        fireEvent.change(subjectInput, { target: { value: "Test" } });
        fireEvent.change(messageInput, { target: { value: "Error test message here." } });
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            variant: "destructive",
            title: "Could not send feedback",
            description: "Database connection failed",
          })
        );
      });

      expect(sendFeedbackEmail).not.toHaveBeenCalled();
    });

    it("preserves form data on error", async () => {
      const dbError = { message: "Error" };
      vi.mocked(submitFeedback).mockResolvedValue({ error: dbError as any });

      render(<FeedbackForm />);

      const subjectInput = screen.getByLabelText(/Subject/i) as HTMLInputElement;
      const messageInput = screen.getByLabelText(/Message/i) as HTMLTextAreaElement;
      const testSubject = "Preserved Subject";
      const testMessage = "This message should be preserved on error.";
      const submitButton = screen.getByRole("button", { name: /Submit Feedback/i });

      await act(async () => {
        fireEvent.change(subjectInput, { target: { value: testSubject } });
        fireEvent.change(messageInput, { target: { value: testMessage } });
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalled();
      });

      // Form data should be preserved
      expect(subjectInput.value).toBe(testSubject);
      expect(messageInput.value).toBe(testMessage);
    });

    it("re-enables submit button after error", async () => {
      vi.mocked(submitFeedback).mockResolvedValue({
        error: { message: "Error" } as any,
      });

      render(<FeedbackForm />);

      const subjectInput = screen.getByLabelText(/Subject/i) as HTMLInputElement;
      const messageInput = screen.getByLabelText(/Message/i) as HTMLTextAreaElement;
      const submitButton = screen.getByRole("button", { name: /Submit Feedback/i });

      await act(async () => {
        fireEvent.change(subjectInput, { target: { value: "Test" } });
        fireEvent.change(messageInput, { target: { value: "Error retry test message." } });
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(submitButton).not.toBeDisabled();
      });
    });
  });

  describe("Duplicate Submission Prevention", () => {
    it("prevents duplicate submissions while first is pending", async () => {
      vi.mocked(submitFeedback).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ error: null }), 100))
      );
      vi.mocked(sendFeedbackEmail).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ error: null }), 100))
      );

      render(<FeedbackForm />);

      const subjectInput = screen.getByLabelText(/Subject/i) as HTMLInputElement;
      const messageInput = screen.getByLabelText(/Message/i) as HTMLTextAreaElement;
      const submitButton = screen.getByRole("button", { name: /Submit Feedback/i });

      await act(async () => {
        fireEvent.change(subjectInput, { target: { value: "Test" } });
        fireEvent.change(messageInput, { target: { value: "Duplicate test message content." } });
      });

      // Click submit once and verify button is disabled
      await act(async () => {
        fireEvent.click(submitButton);
      });

      // Button should be disabled immediately
      expect(submitButton).toBeDisabled();

      // Multiple clicks while disabled should not trigger multiple calls
      await waitFor(() => {
        expect(submitFeedback).toHaveBeenCalledTimes(1);
      }, { timeout: 200 });
    });
  });

  describe("Unauthenticated User", () => {
    it("shows error when user is not signed in", async () => {
      vi.mocked(useAuth).mockReturnValue({
        user: null,
        session: null,
        profile: null,
        loading: false,
        sessionLoading: false,
        needsProfileCompletion: false,
      } as any);

      render(<FeedbackForm />);

      const subjectInput = screen.getByLabelText(/Subject/i) as HTMLInputElement;
      const messageInput = screen.getByLabelText(/Message/i) as HTMLTextAreaElement;
      const submitButton = screen.getByRole("button", { name: /Submit Feedback/i });

      await act(async () => {
        fireEvent.change(subjectInput, { target: { value: "Test" } });
        fireEvent.change(messageInput, { target: { value: "Test message for auth check." } });
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            variant: "destructive",
            title: "You are signed out",
            description: "Sign in again to send feedback.",
          })
        );
      });

      expect(submitFeedback).not.toHaveBeenCalled();
    });
  });
});
