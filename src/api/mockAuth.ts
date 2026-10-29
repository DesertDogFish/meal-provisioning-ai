/**
 * Подзадача 25 аудита (2026-10-29): модуль выделен из `mockServer.ts` —
 * роуты /auth (login/register/refresh/logout/me).
 * Код маршрутов сохранён дословно; общее состояние — в `mockState.ts`.
 */

import { users } from './mockState';
import type { MockUser } from './mockState';

  // Авторизация

export function handleAuthImpl(method: string, path: string, body?: any): any {
  if (path === '/auth/register' && method === 'POST') {
    const { email, password, firstName, lastName } = body;
    
    // Проверка существования пользователя
    if (users.find(u => u.email === email)) {
      throw { status: 409, message: 'Conflict', detail: 'Email already registered' };
    }
    
    // Создание нового пользователя
    const newUser: MockUser = {
      id: String(users.length + 1),
      email,
      password,
      firstName,
      lastName,
      role: 'USER',
      createdAt: new Date().toISOString()
    };
    users.push(newUser);

    // Расширение контракта (P1, AUTH-01): register сразу выдаёт пару токенов +
    // поля пользователя — форма ответа идентична бэкенду (AuthService.AuthResponseWithUser).
    return {
      id: newUser.id,
      email: newUser.email,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      role: newUser.role,
      accessToken: `mock-access-token-${newUser.id}`,
      refreshToken: `mock-refresh-token-${newUser.id}`,
      tokenType: 'Bearer'
    };
  }
  
  if (path === '/auth/login' && method === 'POST') {
    const { email, password } = body;
    const user = users.find(u => u.email === email && u.password === password);
    
    if (!user) {
      throw { status: 401, message: 'Unauthorized', detail: 'Invalid email or password' };
    }
    
    return {
      accessToken: `mock-access-token-${user.id}`,
      refreshToken: `mock-refresh-token-${user.id}`,
      tokenType: 'Bearer'
    };
  }
  
  if (path === '/auth/me' && method === 'GET') {
    // E2E: токен несёт id пользователя ('mock-access-token-<id>') — по нему
    // возвращаем конкретного юзера, чтобы TripsPage фильтровал myTrips корректно.
    const token = localStorage.getItem('accessToken') || '';
    const m = token.match(/mock-access-token-(\d+)$/);
    const user = (m && users.find(u => u.id === m[1])) || users[0];
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role
    };
  }
  
  if (path === '/auth/logout' && method === 'POST') {
    return null;
  }
  
  throw { status: 404, message: 'Not found', detail: `Auth route ${path} not implemented` };
}
