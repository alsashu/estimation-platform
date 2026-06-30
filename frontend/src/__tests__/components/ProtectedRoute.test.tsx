import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '../../components/auth/ProtectedRoute';
import { useAuthStore } from '../../store/authStore';

const userWithPermission = {
  id: 'u1', email: 'a@b.com', username: 'u', firstName: 'A', lastName: 'B',
  roles: ['Admin'], permissions: ['user.create', 'estimation.read'], projectIds: [] as string[],
};

const userWithoutPermission = {
  ...userWithPermission, roles: ['User'], permissions: ['estimation.read'],
};

describe('ProtectedRoute', () => {
  beforeEach(() => useAuthStore.getState().clearAuth());

  it('redirects to /login when no user is authenticated', () => {
    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/login" element={<div>Login</div>} />
          <Route path="/protected" element={
            <ProtectedRoute><div>Protected</div></ProtectedRoute>
          } />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Login')).toBeInTheDocument();
  });

  it('renders children when user is authenticated', () => {
    useAuthStore.getState().setAuth(userWithPermission, 'at', 'rt');
    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/login" element={<div>Login</div>} />
          <Route path="/protected" element={
            <ProtectedRoute><div>Protected Content</div></ProtectedRoute>
          } />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('redirects to / when user lacks required permission', () => {
    useAuthStore.getState().setAuth(userWithoutPermission, 'at', 'rt');
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/" element={<div>Home</div>} />
          <Route path="/admin" element={
            <ProtectedRoute requiredPermission="user.create"><div>Admin</div></ProtectedRoute>
          } />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Home')).toBeInTheDocument();
  });

  it('renders protected content when user has required permission', () => {
    useAuthStore.getState().setAuth(userWithPermission, 'at', 'rt');
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/" element={<div>Home</div>} />
          <Route path="/admin" element={
            <ProtectedRoute requiredPermission="user.create"><div>Admin Only</div></ProtectedRoute>
          } />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Admin Only')).toBeInTheDocument();
  });

  it('redirects when user lacks required role', () => {
    useAuthStore.getState().setAuth(userWithoutPermission, 'at', 'rt');
    render(
      <MemoryRouter initialEntries={['/super']}>
        <Routes>
          <Route path="/" element={<div>Home</div>} />
          <Route path="/super" element={
            <ProtectedRoute requiredRole="Global Super Admin"><div>Super Area</div></ProtectedRoute>
          } />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Home')).toBeInTheDocument();
  });
});
