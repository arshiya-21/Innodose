import { api } from './client';
import { endpoints } from './endpoints';
import type { LoginRequest, LoginResponse, User } from './types';

/** Login page + session restore */
export const authApi = {
  login: (body: LoginRequest) => api.post<LoginResponse>(endpoints.auth.login, body),
  logout: () => api.post<void>(endpoints.auth.logout),
  me: () => api.get<User>(endpoints.auth.me),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    api.put<void>(endpoints.auth.changePassword, body),
};
