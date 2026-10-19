"use client";

type OrderAction = (formData: FormData) => void | Promise<void>;

export function ConfirmDeleteOrderButton({ action, status }: { action: OrderAction; status: string }) {
  return (
    <button
      formAction={action}
      className="admin-delete-order"
      aria-label="Delete order"
      title="Delete order"
      onClick={(event) => {
        const message = status === "cancelled"
          ? "Permanently delete this order? This can't be undone."
          : "This order is not cancelled. Permanently delete it? This can't be undone.";
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <span>Delete</span>
    </button>
  );
}

export function ConfirmCancelPendingButton({ action }: { action: OrderAction }) {
  return (
    <button
      formAction={action}
      className="button button-outline"
      onClick={(event) => {
        const form = event.currentTarget.form;
        const days = form?.elements.namedItem("days");
        const includeMore = form?.elements.namedItem("include_preorders_cod");
        const dayCount = days instanceof HTMLInputElement ? days.value : "";
        const extra = includeMore instanceof HTMLInputElement && includeMore.checked;
        const message = extra
          ? `Also cancel pre-orders and COD orders older than ${dayCount} days?`
          : `Cancel pending GoTyme orders older than ${dayCount} days?`;
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      Cancel orders
    </button>
  );
}
