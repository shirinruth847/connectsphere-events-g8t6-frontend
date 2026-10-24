"use client";

import { useCallback, useEffect, useEffectEvent, useReducer, useRef } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
  type NotificationReadState,
} from "@/lib/api/notifications";
import {
  announceNotificationsChanged,
  appendNotifications,
  applyReadState,
  mergeFirstPage,
  notificationTargetHref,
} from "@/lib/notifications";

export const toApiError = (error: unknown) =>
  error instanceof ApiError
    ? error
    : new ApiError(error instanceof Error ? error.message : "The request could not be completed.", 0);

export const NOTIFICATION_GONE =
  "That notification is no longer available. It may be about an event you are no longer registered or waitlisted for.";

interface ListState {
  status: "loading" | "ready" | "error";
  items: NotificationItem[];
  nextCursor: string | null;
  unreadCount: number;
  pagesLoaded: number;
  error: ApiError | null;
  loadingMore: boolean;
  loadMoreError: ApiError | null;
  // IDs with a read or navigation request in flight.
  busy: number[];
  markingAll: boolean;
  // A recoverable problem with a read action, shown above the list.
  notice: { tone: "info" | "error"; text: string } | null;
}

type ListAction =
  | { type: "reload" }
  | { type: "loaded"; items: NotificationItem[]; nextCursor: string | null; unreadCount: number; background: boolean }
  | { type: "failed"; error: ApiError; background: boolean }
  | { type: "moreStarted" }
  | { type: "moreLoaded"; items: NotificationItem[]; nextCursor: string | null; unreadCount: number }
  | { type: "moreFailed"; error: ApiError }
  | { type: "busy"; id: number; on: boolean }
  | { type: "read"; state: NotificationReadState; unreadCount: number }
  | { type: "removed"; id: number }
  | { type: "markAllStarted" }
  | { type: "allRead"; unreadCount: number }
  | { type: "markAllFailed"; error: ApiError }
  | { type: "notice"; notice: ListState["notice"] };

const initialState: ListState = {
  status: "loading",
  items: [],
  nextCursor: null,
  unreadCount: 0,
  pagesLoaded: 0,
  error: null,
  loadingMore: false,
  loadMoreError: null,
  busy: [],
  markingAll: false,
  notice: null,
};

function reducer(state: ListState, action: ListAction): ListState {
  switch (action.type) {
    case "reload":
      return { ...initialState };
    case "loaded":
      // A background refresh keeps the older pages already loaded (and their
      // cursor), unless it returned everything.
      if (action.background && state.status === "ready") {
        const complete = action.nextCursor === null;
        return {
          ...state,
          items: mergeFirstPage(state.items, action.items, complete),
          nextCursor: complete ? null : state.nextCursor,
          unreadCount: action.unreadCount,
        };
      }
      return {
        ...initialState,
        status: "ready",
        items: action.items,
        nextCursor: action.nextCursor,
        unreadCount: action.unreadCount,
        pagesLoaded: 1,
      };
    case "failed":
      // A background refresh that fails leaves the list the user is reading.
      if (action.background && state.status === "ready") return state;
      return { ...initialState, status: "error", error: action.error };
    case "moreStarted":
      return { ...state, loadingMore: true, loadMoreError: null };
    case "moreLoaded":
      return {
        ...state,
        items: appendNotifications(state.items, action.items),
        nextCursor: action.nextCursor,
        unreadCount: action.unreadCount,
        pagesLoaded: state.pagesLoaded + 1,
        loadingMore: false,
      };
    case "moreFailed":
      return { ...state, loadingMore: false, loadMoreError: action.error };
    case "busy":
      return {
        ...state,
        busy: action.on ? [...state.busy, action.id] : state.busy.filter((id) => id !== action.id),
      };
    case "read":
      return { ...state, items: applyReadState(state.items, action.state), unreadCount: action.unreadCount };
    case "removed":
      return {
        ...state,
        items: state.items.filter((item) => item.notification_id !== action.id),
        notice: { tone: "info", text: NOTIFICATION_GONE },
      };
    case "markAllStarted":
      return { ...state, markingAll: true, notice: null };
    case "allRead":
      // Only after the backend confirms; read_at stays as the server last sent it.
      return {
        ...state,
        markingAll: false,
        unreadCount: action.unreadCount,
        items: state.items.map((item) => ({ ...item, is_read: true })),
      };
    case "markAllFailed":
      return { ...state, markingAll: false, notice: { tone: "error", text: action.error.message } };
    case "notice":
      return { ...state, notice: action.notice };
  }
}

const isGone = (error: ApiError) => error.status === 404 && error.code === "NOTIFICATION_NOT_FOUND";

// One user's notifications, newest first, for the Updates panel and the
// /notifications page. Read state and the unread count change only after the
// backend confirms them, and each confirmed count is announced to the badge.
export function useNotificationList({ pageSize, refreshOnReturn }: { pageSize: number; refreshOnReturn: boolean }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const router = useRouter();
  const listRequest = useRef<AbortController | null>(null);
  const moreRequest = useRef<AbortController | null>(null);

  const fetchFirstPage = useCallback(
    async ({ background }: { background: boolean }) => {
      listRequest.current?.abort();
      const controller = new AbortController();
      listRequest.current = controller;
      try {
        const page = await listNotifications({ limit: pageSize, signal: controller.signal });
        if (controller.signal.aborted) return;
        dispatch({ type: "loaded", items: page.notifications, nextCursor: page.nextCursor, unreadCount: page.unreadCount, background });
        announceNotificationsChanged(page.unreadCount);
      } catch (error) {
        if (!controller.signal.aborted) dispatch({ type: "failed", error: toApiError(error), background });
      }
    },
    [pageSize],
  );

  useEffect(() => {
    void fetchFirstPage({ background: false });
    return () => {
      listRequest.current?.abort();
      moreRequest.current?.abort();
    };
  }, [fetchFirstPage]);

  // Refreshes when the user comes back to the tab; no instant delivery is promised.
  const onReturn = useEffectEvent(() => {
    if (!refreshOnReturn || document.visibilityState !== "visible") return;
    if (state.status !== "ready" || state.loadingMore) return;
    void fetchFirstPage({ background: true });
  });

  useEffect(() => {
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, []);

  const retry = () => {
    dispatch({ type: "reload" });
    void fetchFirstPage({ background: false });
  };

  const loadMore = async () => {
    if (!state.nextCursor || state.loadingMore) return;
    const controller = new AbortController();
    moreRequest.current = controller;
    dispatch({ type: "moreStarted" });
    try {
      const page = await listNotifications({ limit: pageSize, cursor: state.nextCursor, signal: controller.signal });
      if (controller.signal.aborted) return;
      dispatch({ type: "moreLoaded", items: page.notifications, nextCursor: page.nextCursor, unreadCount: page.unreadCount });
      announceNotificationsChanged(page.unreadCount);
    } catch (error) {
      if (!controller.signal.aborted) dispatch({ type: "moreFailed", error: toApiError(error) });
    }
  };

  // Resolves to "read", "gone" (hidden or not the user's: removed from the
  // list) or "failed" (left unread, with a notice).
  const markRead = async (item: NotificationItem): Promise<"read" | "gone" | "failed"> => {
    if (item.is_read) return "read";
    dispatch({ type: "busy", id: item.notification_id, on: true });
    try {
      const result = await markNotificationRead(item.notification_id);
      dispatch({ type: "read", state: result.notification, unreadCount: result.unreadCount });
      announceNotificationsChanged(result.unreadCount);
      return "read";
    } catch (caught) {
      const error = toApiError(caught);
      if (isGone(error)) {
        dispatch({ type: "removed", id: item.notification_id });
        return "gone";
      }
      dispatch({ type: "notice", notice: { tone: "error", text: `Could not mark "${item.title}" as read. ${error.message}` } });
      return "failed";
    } finally {
      dispatch({ type: "busy", id: item.notification_id, on: false });
    }
  };

  // Marks the notification read, then opens its event. A notification that is
  // no longer available does not navigate; any other read failure still does.
  const goToEvent = async (item: NotificationItem) => {
    const href = notificationTargetHref(item.target);
    if (!href) return false;
    const outcome = await markRead(item);
    if (outcome === "gone") return false;
    router.push(href);
    return true;
  };

  const markAllRead = async () => {
    if (state.markingAll) return;
    dispatch({ type: "markAllStarted" });
    try {
      const result = await markAllNotificationsRead();
      dispatch({ type: "allRead", unreadCount: result.unreadCount });
      announceNotificationsChanged(result.unreadCount);
    } catch (error) {
      dispatch({ type: "markAllFailed", error: toApiError(error) });
    }
  };

  return {
    ...state,
    retry,
    loadMore,
    markRead,
    goToEvent,
    markAllRead,
    dismissNotice: () => dispatch({ type: "notice", notice: null }),
    isBusy: (id: number) => state.busy.includes(id),
  };
}
