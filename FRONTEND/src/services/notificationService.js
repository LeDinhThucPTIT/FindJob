import apiClient from "./api";
export default {
  list: (page = 1) => apiClient.get("/notifications", { params: { page, limit: 10 } }),
  markRead: (eventId) => apiClient.patch(`/notifications/${encodeURIComponent(eventId)}/read`),
  markAllRead: () => apiClient.patch("/notifications/read-all"),
};
