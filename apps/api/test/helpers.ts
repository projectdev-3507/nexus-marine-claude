import request from 'supertest';
import { createApp } from '../src/app';

export const app = createApp();
export const PASSWORD = 'Nexus2026!';

export async function login(email: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`);
  const token = res.body.token as string;
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  return {
    token,
    user: res.body.user,
    get: (url: string) => auth(request(app).get(url)),
    post: (url: string, body?: object) => auth(request(app).post(url)).send(body ?? {}),
    put: (url: string, body?: object) => auth(request(app).put(url)).send(body ?? {}),
  };
}
