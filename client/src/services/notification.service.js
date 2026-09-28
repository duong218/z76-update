import { apiRequest } from './api';
import { getAuthHeaders } from './auth.service';

export async function fetchNotifications() {
  const res = await apiRequest('/notifications', {
    headers: getAuthHeaders(),
  });
  return res.data;
}

export async function fetchUnreadCount() {
  const res = await apiRequest('/notifications/unread-count', {
    headers: getAuthHeaders(),
  });
  return res.data?.count ?? 0;
}

export async function markNotificationRead(id) {
  const res = await apiRequest(`/notifications/${id}/read`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
  });
  return res.data;
}

export async function markAllNotificationsRead() {
  await apiRequest('/notifications/read-all', {
    method: 'PATCH',
    headers: getAuthHeaders(),
  });
}