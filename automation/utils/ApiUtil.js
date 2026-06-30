'use strict';
const axios = require('axios');
const config = require('../config/config');
const { logger } = require('./LoggerUtil');

const apiClient = axios.create({
  baseURL: config.apiUrl,
  timeout: config.timeout,
  headers: { 'Content-Type': 'application/json' },
});

// Response interceptor for logging
apiClient.interceptors.response.use(
  (response) => {
    logger.debug(`API ${response.config.method.toUpperCase()} ${response.config.url} → ${response.status}`);
    return response;
  },
  (error) => {
    const status = error.response ? error.response.status : 'N/A';
    const url = error.config ? error.config.url : 'unknown';
    logger.warn(`API Error ${status} on ${url}: ${error.message}`);
    return Promise.reject(error);
  }
);

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Authenticate and return tokens.
 * @returns {Promise<{accessToken: string, refreshToken: string, user: object}>}
 */
async function login(email, password) {
  const response = await apiClient.post('/api/auth/login', { email, password });
  return response.data.data || response.data;
}

/**
 * Get API token for a named role from config credentials.
 */
async function getTokenForRole(role) {
  const creds = config.credentials[role];
  if (!creds) throw new Error(`Unknown role: ${role}`);
  const result = await login(creds.email, creds.password);
  return result.accessToken;
}

async function createUser(token, payload) {
  const response = await apiClient.post('/api/users', payload, { headers: authHeaders(token) });
  return response.data.data;
}

async function deleteUser(token, userId) {
  await apiClient.delete(`/api/users/${userId}`, { headers: authHeaders(token) });
}

async function getUsers(token, params = {}) {
  const response = await apiClient.get('/api/users', { headers: authHeaders(token), params });
  return response.data.data || [];
}

async function updateUser(token, userId, payload) {
  const response = await apiClient.put(`/api/users/${userId}`, payload, { headers: authHeaders(token) });
  return response.data.data;
}

async function createProject(token, payload) {
  const response = await apiClient.post('/api/projects', payload, { headers: authHeaders(token) });
  return response.data.data;
}

async function deleteProject(token, projectId) {
  await apiClient.delete(`/api/projects/${projectId}`, { headers: authHeaders(token) });
}

async function getProjects(token, params = {}) {
  const response = await apiClient.get('/api/projects', { headers: authHeaders(token), params });
  return response.data.data || [];
}

async function getRoles(token) {
  const response = await apiClient.get('/api/roles', { headers: authHeaders(token) });
  return response.data.data || [];
}

async function callGet(url, token) {
  const response = await apiClient.get(url, { headers: authHeaders(token) });
  return response;
}

async function callPost(url, data, token) {
  const response = await apiClient.post(url, data, { headers: authHeaders(token) });
  return response;
}

async function callPut(url, data, token) {
  const response = await apiClient.put(url, data, { headers: authHeaders(token) });
  return response;
}

async function callDelete(url, token) {
  const response = await apiClient.delete(url, { headers: authHeaders(token) });
  return response;
}

async function setUserActive(token, userId, active) {
  const response = await apiClient.patch(`/api/users/${userId}/active`, { active }, { headers: authHeaders(token) });
  return response.data;
}

async function callGetExpectError(url, token) {
  try {
    const response = await apiClient.get(url, { headers: authHeaders(token) });
    return { status: response.status, data: response.data, error: null };
  } catch (err) {
    return {
      status: err.response ? err.response.status : 0,
      data: err.response ? err.response.data : null,
      error: err.message,
    };
  }
}

async function callPostExpectError(url, data, token) {
  try {
    const response = await apiClient.post(url, data, { headers: authHeaders(token) });
    return { status: response.status, data: response.data, error: null };
  } catch (err) {
    return {
      status: err.response ? err.response.status : 0,
      data: err.response ? err.response.data : null,
      error: err.message,
    };
  }
}

module.exports = {
  login,
  getTokenForRole,
  createUser,
  deleteUser,
  getUsers,
  updateUser,
  setUserActive,
  createProject,
  deleteProject,
  getProjects,
  getRoles,
  callGet,
  callPost,
  callPut,
  callDelete,
  callGetExpectError,
  callPostExpectError,
};
