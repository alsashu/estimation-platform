# Estimation Platform — Comprehensive Test Cases

**Document Version:** 1.0  
**Date:** 2026-06-27  
**Platform:** Estimation Platform (Express.js + TypeScript backend · React + TypeScript frontend)  
**Environment:** Development / Staging / Production  

---

## Table of Contents

1. [Authentication & Authorization](#1-authentication--authorization)
2. [Role-Based Access Control (RBAC)](#2-role-based-access-control-rbac)
3. [User Management](#3-user-management)
4. [Project Management](#4-project-management)
5. [Project-Based Security](#5-project-based-security)
6. [Dashboard](#6-dashboard)
7. [Storypoint Estimation](#7-storypoint-estimation)
8. [Parametric Estimation](#8-parametric-estimation)
9. [Historical Data](#9-historical-data)
10. [Analytics & Reports](#10-analytics--reports)
11. [Master Data](#11-master-data)
12. [Registration Workflow](#12-registration-workflow)
13. [Notifications](#13-notifications)
14. [Monitoring](#14-monitoring)
15. [Audit Logging](#15-audit-logging)
16. [API Testing](#16-api-testing)
17. [Database Validation](#17-database-validation)
18. [UI/UX Testing](#18-uiux-testing)
19. [Performance Testing](#19-performance-testing)
20. [Security Testing](#20-security-testing)
21. [Regression Testing](#21-regression-testing)
22. [End-to-End Scenarios](#22-end-to-end-scenarios)

---

## Legend

| Field | Description |
|---|---|
| **ID** | Unique test case identifier |
| **Module** | Platform module under test |
| **Feature** | Specific feature within the module |
| **Preconditions** | State required before test execution |
| **Test Steps** | Numbered step-by-step actions |
| **Test Data** | Input values / test credentials |
| **Expected Result** | Correct system behaviour |
| **Actual Result** | Observed result (fill during execution) |
| **Status** | Pass / Fail / Blocked / Skipped |
| **Priority** | High / Medium / Low |
| **Severity** | Critical / Major / Minor / Trivial |
| **Remarks** | Notes, defect IDs, observations |

---

## 1. Authentication & Authorization

---

### TC-AUTH-001

| Field | Detail |
|---|---|
| **ID** | TC-AUTH-001 |
| **Module** | Authentication |
| **Feature** | Login — Valid Credentials |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | User account exists and is active. Application is accessible. |
| **Test Steps** | 1. Navigate to `/login`. 2. Enter valid email. 3. Enter correct password. 4. Click **Sign In**. |
| **Test Data** | Email: `admin@example.com` · Password: `Admin@1234` |
| **Expected Result** | User is authenticated, JWT access token (15 min) and refresh token (7 days) are issued, user is redirected to the Dashboard. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | Verify `Authorization` header or cookie contains a valid JWT. |

---

### TC-AUTH-002

| Field | Detail |
|---|---|
| **ID** | TC-AUTH-002 |
| **Module** | Authentication |
| **Feature** | Login — Invalid Password |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | User account exists. |
| **Test Steps** | 1. Navigate to `/login`. 2. Enter valid email. 3. Enter wrong password. 4. Click **Sign In**. |
| **Test Data** | Email: `admin@example.com` · Password: `WrongPass!` |
| **Expected Result** | HTTP 401. Error message "Invalid credentials" shown. No token issued. Failed login event logged. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | Failed attempt count should increment in audit log. |

---

### TC-AUTH-003

| Field | Detail |
|---|---|
| **ID** | TC-AUTH-003 |
| **Module** | Authentication |
| **Feature** | Login — Non-existent User |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Application is accessible. |
| **Test Steps** | 1. Navigate to `/login`. 2. Enter unregistered email. 3. Enter any password. 4. Click **Sign In**. |
| **Test Data** | Email: `nobody@nowhere.com` · Password: `Test@1234` |
| **Expected Result** | HTTP 401. Generic error (do not reveal "user not found" — prevents enumeration). |
| **Actual Result** | |
| **Status** | |
| **Remarks** | Error message should be identical to TC-AUTH-002 to prevent username enumeration. |

---

### TC-AUTH-004

| Field | Detail |
|---|---|
| **ID** | TC-AUTH-004 |
| **Module** | Authentication |
| **Feature** | JWT Token Validation |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | Valid JWT access token available. |
| **Test Steps** | 1. Decode the JWT. 2. Verify `exp` claim (15 min from issue). 3. Verify `roles`, `permissions`, `projectIds` claims are present. 4. Submit token to a protected API endpoint. |
| **Test Data** | JWT from a successful login |
| **Expected Result** | Token is accepted. Claims contain correct role, permissions, and project scope. `exp` is 15 minutes from `iat`. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | Use jwt.io or equivalent to inspect payload. |

---

### TC-AUTH-005

| Field | Detail |
|---|---|
| **ID** | TC-AUTH-005 |
| **Module** | Authentication |
| **Feature** | Access Token Expiry |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | Valid expired access token (wait 15+ min or manipulate `exp` claim in test environment). |
| **Test Steps** | 1. Log in. 2. Wait 16 minutes (or use an expired test token). 3. Make an authenticated API request. |
| **Test Data** | Expired JWT |
| **Expected Result** | HTTP 401. Response: `{ "error": "Token expired" }`. Frontend redirects to login or silently refreshes via refresh token. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | Confirm silent refresh path is exercised by the frontend. |

---

### TC-AUTH-006

| Field | Detail |
|---|---|
| **ID** | TC-AUTH-006 |
| **Module** | Authentication |
| **Feature** | Refresh Token |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | Valid refresh token (7-day lifetime) available. Access token has expired. |
| **Test Steps** | 1. Log in and capture refresh token. 2. Wait for access token to expire. 3. Call `POST /api/auth/refresh` with refresh token. |
| **Test Data** | Valid refresh token from step 1 |
| **Expected Result** | HTTP 200. New access token issued with fresh 15-min expiry. Refresh token remains valid. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-AUTH-007

| Field | Detail |
|---|---|
| **ID** | TC-AUTH-007 |
| **Module** | Authentication |
| **Feature** | Refresh Token — Expired |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | Refresh token that has expired (>7 days old). |
| **Test Steps** | 1. Use expired refresh token. 2. Call `POST /api/auth/refresh`. |
| **Test Data** | Expired refresh token |
| **Expected Result** | HTTP 401. Session fully invalidated. User must log in again. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-AUTH-008

| Field | Detail |
|---|---|
| **ID** | TC-AUTH-008 |
| **Module** | Authentication |
| **Feature** | Logout |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | User is logged in. |
| **Test Steps** | 1. Click Logout button. 2. Attempt to call a protected API with the old token. 3. Attempt to navigate to a protected route. |
| **Test Data** | Token from step 1 |
| **Expected Result** | Server invalidates refresh token. API call returns 401. Browser redirects to `/login`. localStorage cleared. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | Verify refresh token row is deleted or blacklisted in DB. |

---

### TC-AUTH-009

| Field | Detail |
|---|---|
| **ID** | TC-AUTH-009 |
| **Module** | Authentication |
| **Feature** | Forgot Password |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | User account exists with a registered email. Email service is configured. |
| **Test Steps** | 1. Navigate to `/forgot-password`. 2. Enter registered email. 3. Submit. 4. Open email and click reset link. 5. Enter new valid password. 6. Submit. |
| **Test Data** | Email: `user@example.com` · New Password: `NewPass@2026` |
| **Expected Result** | Reset email sent. Link is one-time-use and time-limited. Password updated. Old password no longer works. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-AUTH-010

| Field | Detail |
|---|---|
| **ID** | TC-AUTH-010 |
| **Module** | Authentication |
| **Feature** | Forgot Password — Unregistered Email |
| **Priority** | Medium |
| **Severity** | Minor |
| **Preconditions** | Application accessible. |
| **Test Steps** | 1. Navigate to `/forgot-password`. 2. Enter unregistered email. 3. Submit. |
| **Test Data** | Email: `ghost@example.com` |
| **Expected Result** | Generic success message shown (do not reveal whether email exists). No email sent. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | Prevents email enumeration attacks. |

---

### TC-AUTH-011

| Field | Detail |
|---|---|
| **ID** | TC-AUTH-011 |
| **Module** | Authentication |
| **Feature** | Change Password |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | User is logged in. |
| **Test Steps** | 1. Navigate to profile / change password. 2. Enter current password. 3. Enter new strong password. 4. Confirm new password. 5. Submit. |
| **Test Data** | Current: `Admin@1234` · New: `NewAdmin@2026` |
| **Expected Result** | Password updated. Audit log entry created. Session remains valid. Old password no longer works. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-AUTH-012

| Field | Detail |
|---|---|
| **ID** | TC-AUTH-012 |
| **Module** | Authentication |
| **Feature** | Password History — Reuse Prevention |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | User has previously set passwords on record. |
| **Test Steps** | 1. Navigate to change password. 2. Attempt to set a password that was used previously. 3. Submit. |
| **Test Data** | New Password: same as any of last 5 used passwords |
| **Expected Result** | HTTP 400. Error: "Password was recently used. Please choose a different password." Password not changed. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | Validate against `password_history` table. |

---

### TC-AUTH-013

| Field | Detail |
|---|---|
| **ID** | TC-AUTH-013 |
| **Module** | Authentication |
| **Feature** | Password Policy — Weak Password |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | User is on registration or change password screen. |
| **Test Steps** | 1. Enter a weak password (e.g. `password`). 2. Submit. |
| **Test Data** | Password: `password` |
| **Expected Result** | Validation error listing unmet requirements: minimum length, uppercase, number, special character. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-AUTH-014

| Field | Detail |
|---|---|
| **ID** | TC-AUTH-014 |
| **Module** | Authentication |
| **Feature** | Password Policy — Boundary (Minimum Length) |
| **Priority** | Medium |
| **Severity** | Major |
| **Preconditions** | On registration or change password screen. |
| **Test Steps** | 1. Enter password exactly at minimum length (e.g. 7 chars). 2. Submit. 3. Enter password at min length (8 chars). 4. Submit. |
| **Test Data** | 7-char: `Ab@1234` · 8-char: `Ab@12345` |
| **Expected Result** | 7-char rejected. 8-char with all policy rules met is accepted. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-AUTH-015

| Field | Detail |
|---|---|
| **ID** | TC-AUTH-015 |
| **Module** | Authentication |
| **Feature** | Unauthorized API Access (No Token) |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | None. |
| **Test Steps** | 1. Call `GET /api/users` with no Authorization header. |
| **Test Data** | No token |
| **Expected Result** | HTTP 401. `{ "success": false, "error": "Not authenticated" }` |
| **Actual Result** | |
| **Status** | |
| **Remarks** | Test all protected endpoints: users, projects, roles, estimations, history. |

---

### TC-AUTH-016

| Field | Detail |
|---|---|
| **ID** | TC-AUTH-016 |
| **Module** | Authentication |
| **Feature** | Direct URL Access Without Permission |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | User is logged in with a role that lacks access to a module (e.g. normal user accessing `/admin/users`). |
| **Test Steps** | 1. Log in as a normal user. 2. Manually navigate to `/users` or `/admin/projects` in the browser. |
| **Test Data** | Normal user credentials |
| **Expected Result** | Access denied message shown or redirect to dashboard. Backend returns 403 for any API calls made by that page. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | Verify both frontend guard and backend authorization. |

---

### TC-AUTH-017

| Field | Detail |
|---|---|
| **ID** | TC-AUTH-017 |
| **Module** | Authentication |
| **Feature** | Login — Inactive Account |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | User account exists but `is_active = false`. |
| **Test Steps** | 1. Navigate to `/login`. 2. Enter credentials of inactive user. 3. Click **Sign In**. |
| **Test Data** | Email: `inactive@example.com` · Password: correct password |
| **Expected Result** | HTTP 403. Error: "Account is inactive. Contact your administrator." No token issued. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-AUTH-018

| Field | Detail |
|---|---|
| **ID** | TC-AUTH-018 |
| **Module** | Authentication |
| **Feature** | Tampered JWT Token |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | Valid JWT available. |
| **Test Steps** | 1. Decode JWT. 2. Modify payload (e.g. change role to `Global Super Admin`). 3. Re-encode without valid signature. 4. Use modified token to call a protected API. |
| **Test Data** | Modified JWT |
| **Expected Result** | HTTP 401. Token signature verification fails. Access denied. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

## 2. Role-Based Access Control (RBAC)

---

### TC-RBAC-001

| Field | Detail |
|---|---|
| **ID** | TC-RBAC-001 |
| **Module** | RBAC |
| **Feature** | Global Super Admin — Full Access |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | Logged in as Global Super Admin. |
| **Test Steps** | 1. Navigate to Users, Projects, Roles, Dashboard, Estimation, Historical Data, Monitoring. 2. Perform create, read, update, delete on each. |
| **Test Data** | GSA credentials |
| **Expected Result** | All operations succeed. GSA can see all users, all projects, all data across the platform. No 403 encountered. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-RBAC-002

| Field | Detail |
|---|---|
| **ID** | TC-RBAC-002 |
| **Module** | RBAC |
| **Feature** | Global Super Admin — Project Scope |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | Logged in as GSA. Multiple projects exist. |
| **Test Steps** | 1. Open project selector. 2. Verify **All Projects** option is available. 3. Select **All Projects** and verify cross-project data is shown in dashboard and modules. |
| **Test Data** | GSA credentials |
| **Expected Result** | "All Projects" is available only for GSA. Selecting it shows aggregated data. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-RBAC-003

| Field | Detail |
|---|---|
| **ID** | TC-RBAC-003 |
| **Module** | RBAC |
| **Feature** | Scoped Super Admin — Project-Limited Access |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | Scoped Super Admin account with 2 projects assigned. |
| **Test Steps** | 1. Log in as Scoped Super Admin. 2. Verify project selector shows only assigned projects. 3. Verify no "All Projects" option. 4. Access Users module — verify only users within those projects are visible. |
| **Test Data** | SSA credentials |
| **Expected Result** | SSA sees only data within assigned projects. All Projects option absent. 403 on data outside scope. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-RBAC-004

| Field | Detail |
|---|---|
| **ID** | TC-RBAC-004 |
| **Module** | RBAC |
| **Feature** | Admin — User Visibility Scoping |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | Admin user with `created_by` set; other admins exist with their own users. |
| **Test Steps** | 1. Log in as Admin A. 2. Navigate to Users. 3. Verify only users created by Admin A are listed. 4. Verify Super Admin accounts are NOT listed. |
| **Test Data** | Admin A credentials |
| **Expected Result** | Users list shows only users created by Admin A plus Admin A themselves. No SA accounts visible. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-RBAC-005

| Field | Detail |
|---|---|
| **ID** | TC-RBAC-005 |
| **Module** | RBAC |
| **Feature** | Admin — Cannot Modify Super Admin |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | Admin user logged in. Super Admin account exists. |
| **Test Steps** | 1. Log in as Admin. 2. Attempt `PUT /api/users/:saUserId` with any payload. 3. Attempt `DELETE /api/users/:saUserId`. 4. Attempt `PATCH /api/users/:saUserId/active`. |
| **Test Data** | Admin token, SA user ID |
| **Expected Result** | HTTP 403 for all three operations. Error: "Cannot modify a Super Admin account." |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-RBAC-006

| Field | Detail |
|---|---|
| **ID** | TC-RBAC-006 |
| **Module** | RBAC |
| **Feature** | Normal User — Read-Only Estimation Access |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Normal user account in a project. |
| **Test Steps** | 1. Log in as normal user. 2. Verify Users, Projects, Roles management menus are hidden or inaccessible. 3. Navigate to estimation module. 4. Attempt to delete another user's estimation. |
| **Test Data** | Normal user credentials |
| **Expected Result** | Management menus absent. User can view and create own estimations but cannot access admin modules. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-RBAC-007

| Field | Detail |
|---|---|
| **ID** | TC-RBAC-007 |
| **Module** | RBAC |
| **Feature** | Dynamic Role Creation |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Logged in as GSA or SSA. |
| **Test Steps** | 1. Navigate to Roles. 2. Click **Create Role**. 3. Enter name, description. 4. Select permissions from module-level picker. 5. Save. 6. Assign role to a user. 7. Log in as that user and verify permissions. |
| **Test Data** | Role name: `Project Reviewer` · Permissions: `estimation.read`, `history.read` |
| **Expected Result** | Role created. User with this role can read estimations and history but not create/delete. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-RBAC-008

| Field | Detail |
|---|---|
| **ID** | TC-RBAC-008 |
| **Module** | RBAC |
| **Feature** | Permission Update — Live Effect |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | User has a role assigned. |
| **Test Steps** | 1. Log in as GSA. 2. Edit user's role: remove `estimation.create` permission. 3. Log back in as that user. 4. Try to create an estimation. |
| **Test Data** | Permission removed: `estimation.create` |
| **Expected Result** | After re-login, user cannot create estimations. Create button hidden or 403 from API. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | Permissions are in JWT; user must re-authenticate to get updated token. |

---

### TC-RBAC-009

| Field | Detail |
|---|---|
| **ID** | TC-RBAC-009 |
| **Module** | RBAC |
| **Feature** | Multiple Roles Assigned to User |
| **Priority** | Medium |
| **Severity** | Major |
| **Preconditions** | Two roles exist with different permission sets. User exists. |
| **Test Steps** | 1. Assign both roles to a user. 2. Log in as that user. 3. Verify user has combined permissions from both roles. |
| **Test Data** | Role 1: `estimation.read` · Role 2: `history.read` |
| **Expected Result** | User has `estimation.read` AND `history.read`. Effective permissions are the union of all assigned roles. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-RBAC-010

| Field | Detail |
|---|---|
| **ID** | TC-RBAC-010 |
| **Module** | RBAC |
| **Feature** | Backend Authorization Validation |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | User without `user.delete` permission. |
| **Test Steps** | 1. Obtain valid JWT for user missing `user.delete`. 2. Call `DELETE /api/users/:id` directly with that token. |
| **Test Data** | Token missing `user.delete` permission |
| **Expected Result** | HTTP 403. `{ "success": false, "error": "Forbidden" }`. Action not performed. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | Frontend hiding is insufficient — backend must always enforce permissions. |

---

### TC-RBAC-011

| Field | Detail |
|---|---|
| **ID** | TC-RBAC-011 |
| **Module** | RBAC |
| **Feature** | System Role Immutability |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Logged in as GSA. System roles exist (Global Super Admin, etc.). |
| **Test Steps** | 1. Navigate to Roles. 2. Try to edit name of a system role. 3. Try to delete a system role. |
| **Test Data** | System role: "Global Super Admin" |
| **Expected Result** | Name field is disabled. No delete button shown. API rejects modification attempts. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

## 3. User Management

---

### TC-USR-001

| Field | Detail |
|---|---|
| **ID** | TC-USR-001 |
| **Module** | User Management |
| **Feature** | Create User — Valid Data |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | Logged in as GSA or Admin with `user.create` permission. |
| **Test Steps** | 1. Navigate to Users. 2. Click **Add User**. 3. Fill in first name, last name, username, email, password, roles, projects. 4. Submit. |
| **Test Data** | First: `John` · Last: `Doe` · Username: `jdoe` · Email: `jdoe@test.com` · Password: `Test@1234` |
| **Expected Result** | HTTP 201. User appears in list. Audit log shows create event. Notification generated. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-USR-002

| Field | Detail |
|---|---|
| **ID** | TC-USR-002 |
| **Module** | User Management |
| **Feature** | Create User — Duplicate Email |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | User with `jdoe@test.com` already exists. |
| **Test Steps** | 1. Attempt to create another user with the same email. |
| **Test Data** | Email: `jdoe@test.com` |
| **Expected Result** | HTTP 409. Error: "Email or username already exists." User not created. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-USR-003

| Field | Detail |
|---|---|
| **ID** | TC-USR-003 |
| **Module** | User Management |
| **Feature** | Create User — Duplicate Username |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | User with username `jdoe` already exists. |
| **Test Steps** | 1. Attempt to create user with username `jdoe` but different email. |
| **Test Data** | Username: `jdoe` · Email: `different@test.com` |
| **Expected Result** | HTTP 409. Error: "Email or username already exists." |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-USR-004

| Field | Detail |
|---|---|
| **ID** | TC-USR-004 |
| **Module** | User Management |
| **Feature** | Edit User — Update Basic Info |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | User exists. Editor has `user.update` permission and owns the user. |
| **Test Steps** | 1. Click edit (pencil) on a user. 2. Change first name and last name. 3. Save. |
| **Test Data** | New first name: `Jonathan` |
| **Expected Result** | User details updated. Audit log records update event with `previousValue` and `newValue`. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-USR-005

| Field | Detail |
|---|---|
| **ID** | TC-USR-005 |
| **Module** | User Management |
| **Feature** | Edit User — Update Project Assignment |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | User exists. Editor is Admin with access to multiple projects. |
| **Test Steps** | 1. Open edit modal for a user. 2. Remove one project. 3. Add another accessible project. 4. Save. |
| **Test Data** | Remove: `Project A` · Add: `Project B` |
| **Expected Result** | `project_users` table updated. User can no longer see Project A data; can now see Project B data. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-USR-006

| Field | Detail |
|---|---|
| **ID** | TC-USR-006 |
| **Module** | User Management |
| **Feature** | Edit User — Admin Cannot Assign Out-of-Scope Project |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | Admin user with projects [A, B]. User to edit exists. |
| **Test Steps** | 1. Call `PUT /api/users/:id` with `projectIds` containing a project ID not in admin's scope. |
| **Test Data** | projectIds: `[<project-C-uuid>]` |
| **Expected Result** | HTTP 403. Error: "Cannot assign projects outside your access." |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-USR-007

| Field | Detail |
|---|---|
| **ID** | TC-USR-007 |
| **Module** | User Management |
| **Feature** | Delete User — Soft Delete |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | User exists. Deleter has `user.delete` permission and owns the user. |
| **Test Steps** | 1. Click delete (trash) on a user. 2. Confirm deletion. |
| **Test Data** | Target user: `jdoe` |
| **Expected Result** | `deleted_at` field set in DB. User no longer appears in lists. Login with that account fails. Hard data preserved. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | Verify `deleted_at IS NOT NULL` and data still exists for audit purposes. |

---

### TC-USR-008

| Field | Detail |
|---|---|
| **ID** | TC-USR-008 |
| **Module** | User Management |
| **Feature** | Delete User — Cannot Delete Self |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | User is logged in. |
| **Test Steps** | 1. Attempt `DELETE /api/users/:ownUserId`. |
| **Test Data** | Own user ID |
| **Expected Result** | HTTP 400. Error: "Cannot delete your own account." |
| **Actual Result** | |
| **Status** | |
| **Remarks** | Delete button should also be hidden in UI for own row. |

---

### TC-USR-009

| Field | Detail |
|---|---|
| **ID** | TC-USR-009 |
| **Module** | User Management |
| **Feature** | Activate / Deactivate User |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Active user exists. Editor has `user.activate` permission and owns the user. |
| **Test Steps** | 1. Click **Disable** on an active user. 2. Confirm. 3. Attempt to log in with that user's credentials. |
| **Test Data** | User: `jdoe` |
| **Expected Result** | `is_active = false`. Login attempt fails with "Account is inactive." |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-USR-010

| Field | Detail |
|---|---|
| **ID** | TC-USR-010 |
| **Module** | User Management |
| **Feature** | Re-activate User |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Inactive user exists. |
| **Test Steps** | 1. Click **Enable** on an inactive user. 2. Log in with that user's credentials. |
| **Test Data** | User: `jdoe` |
| **Expected Result** | `is_active = true`. Login succeeds. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-USR-011

| Field | Detail |
|---|---|
| **ID** | TC-USR-011 |
| **Module** | User Management |
| **Feature** | Search Users |
| **Priority** | Medium |
| **Severity** | Minor |
| **Preconditions** | Multiple users exist. |
| **Test Steps** | 1. Enter partial name/email in the search box. 2. Observe results. |
| **Test Data** | Search term: `john` |
| **Expected Result** | Only users matching the search term are displayed. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-USR-012

| Field | Detail |
|---|---|
| **ID** | TC-USR-012 |
| **Module** | User Management |
| **Feature** | Pagination |
| **Priority** | Medium |
| **Severity** | Minor |
| **Preconditions** | More than 20 users exist. |
| **Test Steps** | 1. Navigate to Users. 2. Verify first page loads default limit. 3. Click next page. 4. Verify different users displayed. |
| **Test Data** | 25 users in DB |
| **Expected Result** | Pagination controls visible. Page 1 shows 20 users. Page 2 shows remaining 5. Total count correct. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-USR-013

| Field | Detail |
|---|---|
| **ID** | TC-USR-013 |
| **Module** | User Management |
| **Feature** | User Audit Fields |
| **Priority** | Medium |
| **Severity** | Minor |
| **Preconditions** | User created and later edited. |
| **Test Steps** | 1. Create user. Check `created_at`, `created_by`. 2. Edit user. Check `updated_at`, `updated_by`. |
| **Test Data** | |
| **Expected Result** | `created_at` and `created_by` populated on create. `updated_at` and `updated_by` populated on edit. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-USR-014

| Field | Detail |
|---|---|
| **ID** | TC-USR-014 |
| **Module** | User Management |
| **Feature** | Projects Column in Users Table |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Users have project assignments. |
| **Test Steps** | 1. Navigate to Users. 2. Observe Projects column for each user row. |
| **Test Data** | User assigned to `Project Alpha`, `Project Beta` |
| **Expected Result** | Projects column shows comma-separated or badge list of assigned project names. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-USR-015

| Field | Detail |
|---|---|
| **ID** | TC-USR-015 |
| **Module** | User Management |
| **Feature** | Create User — Admin Cannot Assign SA Role |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | Admin logged in. SA role UUID known. |
| **Test Steps** | 1. Attempt `POST /api/users` with `roleIds` containing a Global Super Admin or Scoped Super Admin role ID. |
| **Test Data** | roleIds: `[<sa-role-uuid>]` |
| **Expected Result** | HTTP 403. Error: "Cannot assign Super Admin role." |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

## 4. Project Management

---

### TC-PRJ-001

| Field | Detail |
|---|---|
| **ID** | TC-PRJ-001 |
| **Module** | Project Management |
| **Feature** | Create Project |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | Logged in as GSA or SSA with `project.create` permission. |
| **Test Steps** | 1. Navigate to Projects. 2. Click **Add Project**. 3. Fill in name, code, description, status. 4. Submit. |
| **Test Data** | Name: `Alpha Project` · Code: `ALPHA` · Status: `Active` |
| **Expected Result** | Project created. Appears on project card grid. `created_at`, `created_by` populated. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-PRJ-002

| Field | Detail |
|---|---|
| **ID** | TC-PRJ-002 |
| **Module** | Project Management |
| **Feature** | Create Project — Duplicate Code |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Project with code `ALPHA` exists. |
| **Test Steps** | 1. Try to create another project with code `ALPHA`. |
| **Test Data** | Code: `ALPHA` |
| **Expected Result** | Validation error: "Project code already exists." |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-PRJ-003

| Field | Detail |
|---|---|
| **ID** | TC-PRJ-003 |
| **Module** | Project Management |
| **Feature** | Edit Project |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Project exists. Editor has `project.update` permission. |
| **Test Steps** | 1. Click edit on project card. 2. Change description. 3. Save. |
| **Test Data** | New description: `Updated description` |
| **Expected Result** | Project updated. Card reflects new description. Audit log entry created. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-PRJ-004

| Field | Detail |
|---|---|
| **ID** | TC-PRJ-004 |
| **Module** | Project Management |
| **Feature** | Enable / Disable Project |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Active project exists. |
| **Test Steps** | 1. Click Disable on project card. 2. Verify status changes to `inactive`. 3. Attempt to select project in project selector. |
| **Test Data** | Project: `Alpha Project` |
| **Expected Result** | Status set to `inactive`. Users cannot select or access the project from the selector. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-PRJ-005

| Field | Detail |
|---|---|
| **ID** | TC-PRJ-005 |
| **Module** | Project Management |
| **Feature** | Delete Project |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | Project exists with no active dependencies (or test soft-delete with dependencies). |
| **Test Steps** | 1. Click delete on project card. 2. Confirm deletion. |
| **Test Data** | Project: `Alpha Project` |
| **Expected Result** | `deleted_at` set. Project removed from all lists and selector. Associated `project_users` entries cleaned up or remain for audit. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-PRJ-006

| Field | Detail |
|---|---|
| **ID** | TC-PRJ-006 |
| **Module** | Project Management |
| **Feature** | Assign User to Project |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Project and user exist. |
| **Test Steps** | 1. Open edit user modal. 2. Add project to user's project list. 3. Save. 4. Log in as that user and verify project is available. |
| **Test Data** | User: `jdoe` · Project: `Alpha Project` |
| **Expected Result** | `project_users` row created. User sees the project in their selector and can access its data. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-PRJ-007

| Field | Detail |
|---|---|
| **ID** | TC-PRJ-007 |
| **Module** | Project Management |
| **Feature** | Multiple Project Assignment |
| **Priority** | Medium |
| **Severity** | Major |
| **Preconditions** | Multiple projects exist. |
| **Test Steps** | 1. Assign 3 projects to a user. 2. Log in as that user. 3. Verify project selector shows all 3. |
| **Test Data** | Projects: `Alpha`, `Beta`, `Gamma` |
| **Expected Result** | All 3 projects available in selector. Data correctly scoped to selected project. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-PRJ-008

| Field | Detail |
|---|---|
| **ID** | TC-PRJ-008 |
| **Module** | Project Management |
| **Feature** | Project Visibility for Non-Assigned User |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | User is NOT assigned to Project X. |
| **Test Steps** | 1. Log in as user. 2. Verify Project X is not in project selector. 3. Call `GET /api/projects` — verify Project X is absent from response. |
| **Test Data** | User with no assignment to Project X |
| **Expected Result** | Project X is completely hidden from the user. API returns only accessible projects. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

## 5. Project-Based Security

---

### TC-SEC-001

| Field | Detail |
|---|---|
| **ID** | TC-SEC-001 |
| **Module** | Project-Based Security |
| **Feature** | Data Isolation — Estimation |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | User A in Project 1. User B in Project 2. Estimations created in each project. |
| **Test Steps** | 1. Log in as User A. 2. Navigate to Estimation. 3. Verify only Project 1 estimations are shown. 4. Call `GET /api/analysis?projectId=<Project2Id>` with User A's token. |
| **Test Data** | User A token, Project 2 ID |
| **Expected Result** | UI shows only Project 1 data. API returns 403 or empty dataset for Project 2. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-SEC-002

| Field | Detail |
|---|---|
| **ID** | TC-SEC-002 |
| **Module** | Project-Based Security |
| **Feature** | Project Switching |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | User is assigned to 2 projects with different data. |
| **Test Steps** | 1. Log in. Select Project 1. Note dashboard KPIs. 2. Switch to Project 2. Verify KPIs change. 3. Switch back to Project 1. Verify original KPIs return. |
| **Test Data** | User with 2 projects |
| **Expected Result** | Each switch reloads data specific to the selected project. No data from the other project appears. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-SEC-003

| Field | Detail |
|---|---|
| **ID** | TC-SEC-003 |
| **Module** | Project-Based Security |
| **Feature** | API Authorization by Project |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | User assigned to Project 1 only. |
| **Test Steps** | 1. Obtain token for user. 2. Send `GET /api/history?project_id=<Project2Id>`. |
| **Test Data** | User token, Project 2 ID |
| **Expected Result** | HTTP 403 or empty result. Backend validates `projectIds` claim against requested `project_id`. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-SEC-004

| Field | Detail |
|---|---|
| **ID** | TC-SEC-004 |
| **Module** | Project-Based Security |
| **Feature** | Project Selector — Single Project User |
| **Priority** | Medium |
| **Severity** | Minor |
| **Preconditions** | User assigned to exactly one project. |
| **Test Steps** | 1. Log in. 2. Observe top bar project selector. |
| **Test Data** | Single-project user |
| **Expected Result** | Selector shows project name as a badge/label only — no dropdown. Project is auto-selected. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-SEC-005

| Field | Detail |
|---|---|
| **ID** | TC-SEC-005 |
| **Module** | Project-Based Security |
| **Feature** | Persisted Project Selection |
| **Priority** | Medium |
| **Severity** | Minor |
| **Preconditions** | Multi-project user. |
| **Test Steps** | 1. Log in. Select Project 2 from selector. 2. Refresh browser. 3. Observe selected project. |
| **Test Data** | Multi-project user |
| **Expected Result** | Project 2 remains selected after refresh (persisted in localStorage). |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-SEC-006

| Field | Detail |
|---|---|
| **ID** | TC-SEC-006 |
| **Module** | Project-Based Security |
| **Feature** | Admin Cannot Assign Unauthorized Projects to Users |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | Admin with access to Project 1 and 2. Project 3 exists but is not in admin's scope. |
| **Test Steps** | 1. Admin opens Create/Edit User modal. 2. Verify Project 3 is not in the Projects dropdown. 3. Attempt API call with Project 3 ID in `projectIds`. |
| **Test Data** | Project 3 ID |
| **Expected Result** | Project 3 absent from UI dropdown. API returns 403. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

## 6. Dashboard

---

### TC-DASH-001

| Field | Detail |
|---|---|
| **ID** | TC-DASH-001 |
| **Module** | Dashboard |
| **Feature** | GSA — All Projects View KPIs |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | GSA logged in. Multiple projects with data. |
| **Test Steps** | 1. Select **All Projects** in project selector. 2. View dashboard KPIs. |
| **Test Data** | GSA credentials |
| **Expected Result** | KPIs aggregate data from all projects (total estimations, users, accuracy across platform). |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-DASH-002

| Field | Detail |
|---|---|
| **ID** | TC-DASH-002 |
| **Module** | Dashboard |
| **Feature** | Single Project View KPIs |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | User with 2 projects. Each project has estimations. |
| **Test Steps** | 1. Select Project 1. Note all KPI values. 2. Select Project 2. Note KPI values. 3. Compare. |
| **Test Data** | |
| **Expected Result** | KPIs reflect data for the selected project only. Values differ between projects. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-DASH-003

| Field | Detail |
|---|---|
| **ID** | TC-DASH-003 |
| **Module** | Dashboard |
| **Feature** | Normal User Dashboard |
| **Priority** | Medium |
| **Severity** | Major |
| **Preconditions** | Normal user in one project. |
| **Test Steps** | 1. Log in as normal user. 2. View dashboard. |
| **Test Data** | Normal user credentials |
| **Expected Result** | Dashboard loads correctly. KPIs reflect project-scoped data. Admin management panels are absent. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-DASH-004

| Field | Detail |
|---|---|
| **ID** | TC-DASH-004 |
| **Module** | Dashboard |
| **Feature** | KPI Accuracy After New Estimation |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Estimation module has data. |
| **Test Steps** | 1. Note current estimation count on dashboard. 2. Create a new estimation. 3. Return to dashboard. |
| **Test Data** | |
| **Expected Result** | Estimation count increments by 1 on dashboard. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-DASH-005

| Field | Detail |
|---|---|
| **ID** | TC-DASH-005 |
| **Module** | Dashboard |
| **Feature** | Empty State Dashboard |
| **Priority** | Medium |
| **Severity** | Minor |
| **Preconditions** | New project with no estimations. |
| **Test Steps** | 1. Select the empty project. 2. View dashboard. |
| **Test Data** | New project |
| **Expected Result** | Dashboard shows zero KPIs with friendly empty-state messages. No errors or broken charts. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

## 7. Storypoint Estimation

---

### TC-EST-001

| Field | Detail |
|---|---|
| **ID** | TC-EST-001 |
| **Module** | Storypoint Estimation |
| **Feature** | Create Estimation — Valid Data |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | User has `estimation.create` permission. Project selected. Master data (story points, competency levels) configured. |
| **Test Steps** | 1. Navigate to Estimation. 2. Click **New Estimation**. 3. Fill all required fields. 4. Submit. |
| **Test Data** | Story: `Login Feature` · Complexity: `Medium` · Risk: `Low` |
| **Expected Result** | Estimation saved. Story point and effort hours calculated and displayed. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-EST-002

| Field | Detail |
|---|---|
| **ID** | TC-EST-002 |
| **Module** | Storypoint Estimation |
| **Feature** | Competency Calculation |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Competency levels configured in master data. |
| **Test Steps** | 1. Select team competency level (e.g. Senior). 2. Note effort hours. 3. Change to Junior. 4. Note effort hours again. |
| **Test Data** | Senior vs. Junior competency |
| **Expected Result** | Effort hours change proportionally per the competency matrix. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-EST-003

| Field | Detail |
|---|---|
| **ID** | TC-EST-003 |
| **Module** | Storypoint Estimation |
| **Feature** | Edit Estimation |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Estimation exists. User has `estimation.update` permission. |
| **Test Steps** | 1. Open existing estimation. 2. Change complexity from Medium to High. 3. Save. |
| **Test Data** | Complexity changed to `High` |
| **Expected Result** | Story points recalculated and saved. Audit log entry for update. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-EST-004

| Field | Detail |
|---|---|
| **ID** | TC-EST-004 |
| **Module** | Storypoint Estimation |
| **Feature** | Delete Estimation |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Estimation exists. User has `estimation.delete` permission. |
| **Test Steps** | 1. Select estimation. 2. Click Delete. 3. Confirm. |
| **Test Data** | |
| **Expected Result** | Estimation removed. Dashboard KPI count decrements. Audit log entry. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-EST-005

| Field | Detail |
|---|---|
| **ID** | TC-EST-005 |
| **Module** | Storypoint Estimation |
| **Feature** | Required Field Validation |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | On estimation form. |
| **Test Steps** | 1. Leave required fields blank. 2. Submit. |
| **Test Data** | All fields empty |
| **Expected Result** | Validation messages for all required fields. Form not submitted. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-EST-006

| Field | Detail |
|---|---|
| **ID** | TC-EST-006 |
| **Module** | Storypoint Estimation |
| **Feature** | Project Assignment Validation |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | User in project. No project selected (if applicable). |
| **Test Steps** | 1. Attempt to save estimation without a project context. 2. Attempt API call without `projectId`. |
| **Test Data** | |
| **Expected Result** | Estimation is always associated with the selected project. API rejects request if project context is invalid. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

## 8. Parametric Estimation

---

### TC-PEST-001

| Field | Detail |
|---|---|
| **ID** | TC-PEST-001 |
| **Module** | Parametric Estimation |
| **Feature** | Access Validation |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | User without `parametric.read` permission. |
| **Test Steps** | 1. Attempt to navigate to Parametric Estimation module. |
| **Test Data** | Restricted user |
| **Expected Result** | Access denied. Module not visible in navigation or 403 returned by API. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-PEST-002

| Field | Detail |
|---|---|
| **ID** | TC-PEST-002 |
| **Module** | Parametric Estimation |
| **Feature** | Create Parametric Record |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | User has `parametric.create` permission. |
| **Test Steps** | 1. Navigate to Parametric Estimation. 2. Create a new record with valid parameters. 3. Save. |
| **Test Data** | Valid parametric inputs |
| **Expected Result** | Record saved with correct calculated output. Project context applied. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-PEST-003

| Field | Detail |
|---|---|
| **ID** | TC-PEST-003 |
| **Module** | Parametric Estimation |
| **Feature** | Project Filtering |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Parametric data in 2 projects. |
| **Test Steps** | 1. Select Project A. Observe parametric records. 2. Switch to Project B. Observe parametric records. |
| **Test Data** | |
| **Expected Result** | Only records belonging to the selected project are shown in each case. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

## 9. Historical Data

---

### TC-HIST-001

| Field | Detail |
|---|---|
| **ID** | TC-HIST-001 |
| **Module** | Historical Data |
| **Feature** | Search |
| **Priority** | Medium |
| **Severity** | Minor |
| **Preconditions** | Historical data records exist. |
| **Test Steps** | 1. Navigate to Historical Data. 2. Enter search term. |
| **Test Data** | Search: `login` |
| **Expected Result** | Records matching the search term are displayed. Irrelevant records hidden. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-HIST-002

| Field | Detail |
|---|---|
| **ID** | TC-HIST-002 |
| **Module** | Historical Data |
| **Feature** | Filter by Complexity and Status |
| **Priority** | Medium |
| **Severity** | Minor |
| **Preconditions** | Records with varying complexity and status exist. |
| **Test Steps** | 1. Apply filter: Complexity = `High`, Status = `Completed`. 2. View results. |
| **Test Data** | |
| **Expected Result** | Only High-complexity, Completed records shown. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-HIST-003

| Field | Detail |
|---|---|
| **ID** | TC-HIST-003 |
| **Module** | Historical Data |
| **Feature** | Sorting |
| **Priority** | Low |
| **Severity** | Minor |
| **Preconditions** | Multiple records exist. |
| **Test Steps** | 1. Click column header to sort ascending. 2. Click again to sort descending. |
| **Test Data** | Sort by `Story Points` |
| **Expected Result** | Records sorted correctly in ascending then descending order. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-HIST-004

| Field | Detail |
|---|---|
| **ID** | TC-HIST-004 |
| **Module** | Historical Data |
| **Feature** | Export CSV |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Records exist in historical data. |
| **Test Steps** | 1. Navigate to Historical Data. 2. (Optionally apply filters.) 3. Click **Export CSV**. |
| **Test Data** | |
| **Expected Result** | CSV file downloaded with 17 columns (story name, complexity, risk, status, story points, all effort fields, accuracy, variance, etc.). RFC 4180 compliant. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-HIST-005

| Field | Detail |
|---|---|
| **ID** | TC-HIST-005 |
| **Module** | Historical Data |
| **Feature** | Export CSV — Empty Result Set |
| **Priority** | Medium |
| **Severity** | Minor |
| **Preconditions** | Filters applied that return zero records. |
| **Test Steps** | 1. Apply filter resulting in 0 records. 2. Click **Export CSV**. |
| **Test Data** | Filter: non-existent search term |
| **Expected Result** | Toast notification: "No data to export." No file downloaded. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-HIST-006

| Field | Detail |
|---|---|
| **ID** | TC-HIST-006 |
| **Module** | Historical Data |
| **Feature** | CSV Data Integrity |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Records with special characters (commas, quotes, newlines) in text fields. |
| **Test Steps** | 1. Ensure one record has a comma and double-quote in its name. 2. Export CSV. 3. Open CSV in spreadsheet. |
| **Test Data** | Name: `Feature, "Login"` |
| **Expected Result** | CSV parses correctly. Special characters properly escaped per RFC 4180. Cell content intact. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-HIST-007

| Field | Detail |
|---|---|
| **ID** | TC-HIST-007 |
| **Module** | Historical Data |
| **Feature** | Accuracy and Variance Calculation |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Records with both estimated and actual hours populated. |
| **Test Steps** | 1. Review records with known estimated/actual hours. 2. Check displayed accuracy %. 3. Check displayed variance. |
| **Test Data** | Estimated: 40h · Actual: 50h |
| **Expected Result** | Accuracy = (40/50)*100 = 80%. Variance = +10h or +25%. Values match calculation formula. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-HIST-008

| Field | Detail |
|---|---|
| **ID** | TC-HIST-008 |
| **Module** | Historical Data |
| **Feature** | Project Filtering |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | History data in 2 projects. |
| **Test Steps** | 1. Select Project A. Verify history shows only Project A records. 2. Switch to Project B. Verify accordingly. |
| **Test Data** | |
| **Expected Result** | `project_id` filter applied. No cross-project data leakage. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

## 10. Analytics & Reports

---

### TC-ANLY-001

| Field | Detail |
|---|---|
| **ID** | TC-ANLY-001 |
| **Module** | Analytics & Reports |
| **Feature** | Chart Rendering |
| **Priority** | Medium |
| **Severity** | Major |
| **Preconditions** | Analytics data exists. |
| **Test Steps** | 1. Navigate to Analytics. 2. Observe all charts load. |
| **Test Data** | |
| **Expected Result** | All charts render without console errors. Data points match expected values. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-ANLY-002

| Field | Detail |
|---|---|
| **ID** | TC-ANLY-002 |
| **Module** | Analytics & Reports |
| **Feature** | Date Range Filter |
| **Priority** | Medium |
| **Severity** | Major |
| **Preconditions** | Data across multiple date ranges. |
| **Test Steps** | 1. Apply date range filter. 2. Verify charts and KPIs reflect only data within that range. |
| **Test Data** | Date range: last 30 days |
| **Expected Result** | Analytics data filtered to selected date range. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-ANLY-003

| Field | Detail |
|---|---|
| **ID** | TC-ANLY-003 |
| **Module** | Analytics & Reports |
| **Feature** | Project Filtering |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Data in multiple projects. |
| **Test Steps** | 1. Switch project. Verify analytics update. |
| **Test Data** | |
| **Expected Result** | All charts and KPIs reflect the selected project's data only. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-ANLY-004

| Field | Detail |
|---|---|
| **ID** | TC-ANLY-004 |
| **Module** | Analytics & Reports |
| **Feature** | KPI Validation |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Known dataset with calculable KPIs. |
| **Test Steps** | 1. Create estimations with known values. 2. Navigate to analytics. 3. Compare displayed KPIs against manually calculated expected values. |
| **Test Data** | Known dataset |
| **Expected Result** | KPIs match expected calculations (e.g. average accuracy, total story points, average effort hours). |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

## 11. Master Data

---

### TC-MSTR-001

| Field | Detail |
|---|---|
| **ID** | TC-MSTR-001 |
| **Module** | Master Data — Story Points |
| **Feature** | Create Story Point |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | GSA or SSA logged in. |
| **Test Steps** | 1. Navigate to Master Data > Story Points. 2. Create a new story point entry. |
| **Test Data** | Value: `13` · Label: `Large` |
| **Expected Result** | Story point saved. Available in estimation dropdowns. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-MSTR-002

| Field | Detail |
|---|---|
| **ID** | TC-MSTR-002 |
| **Module** | Master Data — Story Points |
| **Feature** | Duplicate Prevention |
| **Priority** | Medium |
| **Severity** | Major |
| **Preconditions** | Story point value `13` already exists. |
| **Test Steps** | 1. Attempt to create another story point with value `13`. |
| **Test Data** | Value: `13` |
| **Expected Result** | Validation error: duplicate value rejected. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-MSTR-003

| Field | Detail |
|---|---|
| **ID** | TC-MSTR-003 |
| **Module** | Master Data — Effort Estimates |
| **Feature** | Automatic Hour Calculation |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Effort estimate master data configured. |
| **Test Steps** | 1. Create effort estimate entry with min/max hours. 2. Verify derived average or mid-point is calculated. |
| **Test Data** | Min: 8h · Max: 16h |
| **Expected Result** | Average hours calculated automatically. Displayed correctly in estimation. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-MSTR-004

| Field | Detail |
|---|---|
| **ID** | TC-MSTR-004 |
| **Module** | Master Data — Effort Estimates |
| **Feature** | Range Validation |
| **Priority** | Medium |
| **Severity** | Major |
| **Preconditions** | On effort estimate creation form. |
| **Test Steps** | 1. Enter min hours greater than max hours. 2. Submit. |
| **Test Data** | Min: `20` · Max: `10` |
| **Expected Result** | Validation error: "Min hours cannot exceed max hours." |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-MSTR-005

| Field | Detail |
|---|---|
| **ID** | TC-MSTR-005 |
| **Module** | Master Data — Competency Levels |
| **Feature** | Matrix Percentage Validation |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Competency matrix configured. |
| **Test Steps** | 1. Verify percentages for each competency level sum correctly and are within valid range (0-200%). 2. Enter a percentage > 200%. 3. Submit. |
| **Test Data** | Percentage: `250` |
| **Expected Result** | Validation error for out-of-range percentage. Valid matrix entries accepted. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

## 12. Registration Workflow

---

### TC-REG-001

| Field | Detail |
|---|---|
| **ID** | TC-REG-001 |
| **Module** | Registration Workflow |
| **Feature** | New User Registration |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Application accessible. No existing account for this email. |
| **Test Steps** | 1. Navigate to registration page. 2. Fill in first name, last name, email, username, and other required fields. 3. Submit. |
| **Test Data** | Email: `newuser@test.com` · Username: `newuser01` |
| **Expected Result** | Registration request created with `status = pending`. Notification sent to admins. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-REG-002

| Field | Detail |
|---|---|
| **ID** | TC-REG-002 |
| **Module** | Registration Workflow |
| **Feature** | Pending Approval — Cannot Login Before Approval |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Registration submitted and still pending. |
| **Test Steps** | 1. Attempt to log in with the pending registration credentials. |
| **Test Data** | Pending user credentials |
| **Expected Result** | Login rejected with "Your account is pending approval." |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-REG-003

| Field | Detail |
|---|---|
| **ID** | TC-REG-003 |
| **Module** | Registration Workflow |
| **Feature** | Approve Registration Request |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | Admin logged in. Pending registration exists. |
| **Test Steps** | 1. Admin navigates to registration requests. 2. Approves the request. 3. New user logs in with credentials. |
| **Test Data** | |
| **Expected Result** | Request approved. `reviewed_by` set to admin ID. User account created/activated. New user can log in. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-REG-004

| Field | Detail |
|---|---|
| **ID** | TC-REG-004 |
| **Module** | Registration Workflow |
| **Feature** | Reject Registration Request |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Admin logged in. Pending registration exists. |
| **Test Steps** | 1. Admin navigates to registration requests. 2. Rejects the request (optionally with reason). 3. User attempts to log in. |
| **Test Data** | |
| **Expected Result** | Request status set to `rejected`. Login attempt fails. Rejection notification sent to user. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-REG-005

| Field | Detail |
|---|---|
| **ID** | TC-REG-005 |
| **Module** | Registration Workflow |
| **Feature** | Duplicate Registration |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Email `newuser@test.com` already exists (registered or active user). |
| **Test Steps** | 1. Submit registration with the existing email. |
| **Test Data** | Email: `newuser@test.com` |
| **Expected Result** | Error: "An account with this email or username already exists." |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-REG-006

| Field | Detail |
|---|---|
| **ID** | TC-REG-006 |
| **Module** | Registration Workflow |
| **Feature** | Registration Notifications |
| **Priority** | Medium |
| **Severity** | Minor |
| **Preconditions** | Admin logged in. |
| **Test Steps** | 1. New user submits registration. 2. Check admin's notification icon. |
| **Test Data** | |
| **Expected Result** | Admin receives a notification about the pending registration. Notification count badge increments. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

## 13. Notifications

---

### TC-NOTF-001

| Field | Detail |
|---|---|
| **ID** | TC-NOTF-001 |
| **Module** | Notifications |
| **Feature** | Notification Generation on User Create |
| **Priority** | Medium |
| **Severity** | Minor |
| **Preconditions** | Admin creates a new user. |
| **Test Steps** | 1. Admin creates a user. 2. Check notification panel. |
| **Test Data** | |
| **Expected Result** | Notification created: "New User Created: [Name] created by [Admin]." |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-NOTF-002

| Field | Detail |
|---|---|
| **ID** | TC-NOTF-002 |
| **Module** | Notifications |
| **Feature** | Unread Count Badge |
| **Priority** | Medium |
| **Severity** | Minor |
| **Preconditions** | User has unread notifications. |
| **Test Steps** | 1. Log in. 2. Observe notification bell icon. |
| **Test Data** | 3 unread notifications |
| **Expected Result** | Notification badge shows count `3`. Badge blinks or highlights to draw attention. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-NOTF-003

| Field | Detail |
|---|---|
| **ID** | TC-NOTF-003 |
| **Module** | Notifications |
| **Feature** | Mark as Read |
| **Priority** | Medium |
| **Severity** | Minor |
| **Preconditions** | Unread notifications exist. |
| **Test Steps** | 1. Open notification panel. 2. Click a notification to mark as read. |
| **Test Data** | |
| **Expected Result** | Notification marked read. Count decrements. Styling changes from unread to read. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-NOTF-004

| Field | Detail |
|---|---|
| **ID** | TC-NOTF-004 |
| **Module** | Notifications |
| **Feature** | Real-time Notification Polling |
| **Priority** | Medium |
| **Severity** | Minor |
| **Preconditions** | User is logged in. |
| **Test Steps** | 1. Keep browser open. In another session, trigger an action that generates a notification. 2. Wait 30 seconds. 3. Observe notification count. |
| **Test Data** | |
| **Expected Result** | Notification appears within ~30 seconds without manual page refresh. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | Frontend polls every 30s. |

---

## 14. Monitoring

---

### TC-MON-001

| Field | Detail |
|---|---|
| **ID** | TC-MON-001 |
| **Module** | Monitoring |
| **Feature** | Log Monitor Page Renders |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | User with monitoring access logged in. |
| **Test Steps** | 1. Click **Log Monitor** in navigation. 2. Verify the Log Monitor page loads. |
| **Test Data** | |
| **Expected Result** | Log Monitor page is displayed — NOT the Health Monitor page. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | Bug was previously found and fixed (route mapped wrong component). |

---

### TC-MON-002

| Field | Detail |
|---|---|
| **ID** | TC-MON-002 |
| **Module** | Monitoring |
| **Feature** | Health Monitor Page Renders |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | User with monitoring access logged in. |
| **Test Steps** | 1. Click **Health Monitor** in navigation. 2. Verify the Health Monitor page loads. |
| **Test Data** | |
| **Expected Result** | Health Monitor page is displayed — NOT Log Monitor. Correct page for each nav item. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-MON-003

| Field | Detail |
|---|---|
| **ID** | TC-MON-003 |
| **Module** | Monitoring |
| **Feature** | Login History |
| **Priority** | Medium |
| **Severity** | Major |
| **Preconditions** | Admin or GSA with monitoring access. Several logins have occurred. |
| **Test Steps** | 1. Navigate to Monitoring > Login History (or Logs). 2. Verify logins are listed with user, timestamp, and outcome. |
| **Test Data** | |
| **Expected Result** | Login events (success and failure) listed chronologically. Timestamps correct. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-MON-004

| Field | Detail |
|---|---|
| **ID** | TC-MON-004 |
| **Module** | Monitoring |
| **Feature** | Failed Login Events |
| **Priority** | Medium |
| **Severity** | Major |
| **Preconditions** | Monitoring logs accessible. |
| **Test Steps** | 1. Attempt to log in with wrong credentials 3 times. 2. Navigate to monitoring/audit logs. |
| **Test Data** | Wrong password x 3 |
| **Expected Result** | 3 failed login events logged with IP, user, and timestamp. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

## 15. Audit Logging

---

### TC-AUDT-001

| Field | Detail |
|---|---|
| **ID** | TC-AUDT-001 |
| **Module** | Audit Logging |
| **Feature** | Create Event Logged |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | GSA logged in. |
| **Test Steps** | 1. Create a new user. 2. Query audit log (API or DB) for entity `user` action `created`. |
| **Test Data** | |
| **Expected Result** | Audit entry exists: entity `user`, entityId = new user UUID, action `created`, `new_value` populated, `user_id` = creator. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-AUDT-002

| Field | Detail |
|---|---|
| **ID** | TC-AUDT-002 |
| **Module** | Audit Logging |
| **Feature** | Update Event — Before and After Values |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | User exists. |
| **Test Steps** | 1. Edit user (change first name). 2. Query audit log for `user` `updated`. |
| **Test Data** | |
| **Expected Result** | Audit entry has `previous_value` = old name, `new_value` = new name. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-AUDT-003

| Field | Detail |
|---|---|
| **ID** | TC-AUDT-003 |
| **Module** | Audit Logging |
| **Feature** | Delete Event Logged |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | User exists. |
| **Test Steps** | 1. Delete a user. 2. Query audit log for `user` `deleted`. |
| **Test Data** | |
| **Expected Result** | Audit entry with action `deleted` recorded with the user's ID. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-AUDT-004

| Field | Detail |
|---|---|
| **ID** | TC-AUDT-004 |
| **Module** | Audit Logging |
| **Feature** | Password Change Audit |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | User exists and changes password. |
| **Test Steps** | 1. Change password. 2. Query audit log. |
| **Test Data** | |
| **Expected Result** | Audit entry for password change. Password hash NOT stored in audit log (no sensitive data). |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-AUDT-005

| Field | Detail |
|---|---|
| **ID** | TC-AUDT-005 |
| **Module** | Audit Logging |
| **Feature** | Role Assignment Audit |
| **Priority** | Medium |
| **Severity** | Minor |
| **Preconditions** | User exists. |
| **Test Steps** | 1. Assign/remove a role from a user. 2. Query audit log. |
| **Test Data** | |
| **Expected Result** | Audit entry captures role assignment change. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

## 16. API Testing

---

### TC-API-001

| Field | Detail |
|---|---|
| **ID** | TC-API-001 |
| **Module** | API |
| **Feature** | HTTP Status Codes — Success |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Valid token available. |
| **Test Steps** | 1. `POST /api/users` → expect 201. 2. `GET /api/users` → expect 200. 3. `PUT /api/users/:id` → expect 200. 4. `DELETE /api/users/:id` → expect 200. |
| **Test Data** | Valid payloads for each |
| **Expected Result** | Correct HTTP status code for each operation. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-API-002

| Field | Detail |
|---|---|
| **ID** | TC-API-002 |
| **Module** | API |
| **Feature** | Validation Error Response |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Valid token. |
| **Test Steps** | 1. `POST /api/users` with missing required field. 2. `POST /api/users` with invalid email format. |
| **Test Data** | Missing `email` · Invalid email `notanemail` |
| **Expected Result** | HTTP 400 with descriptive validation error listing the field and reason. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-API-003

| Field | Detail |
|---|---|
| **ID** | TC-API-003 |
| **Module** | API |
| **Feature** | SQL Injection Prevention |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | Application accessible. |
| **Test Steps** | 1. Attempt `GET /api/users?search=' OR '1'='1`. 2. Attempt `POST /api/auth/login` with `email: "' OR 1=1--"`. |
| **Test Data** | SQL injection payloads |
| **Expected Result** | Parameterized queries prevent injection. Response returns empty result or validation error. No DB error exposed. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | All DB queries must use parameterized statements. |

---

### TC-API-004

| Field | Detail |
|---|---|
| **ID** | TC-API-004 |
| **Module** | API |
| **Feature** | XSS Prevention |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | Valid token. |
| **Test Steps** | 1. Create a user with `firstName: "<script>alert('xss')</script>"`. 2. Retrieve and display the user. |
| **Test Data** | firstName: `<script>alert('xss')</script>` |
| **Expected Result** | Script not executed. Input stored safely and displayed as escaped text in the UI. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-API-005

| Field | Detail |
|---|---|
| **ID** | TC-API-005 |
| **Module** | API |
| **Feature** | Invalid UUID in Path Parameter |
| **Priority** | Medium |
| **Severity** | Major |
| **Preconditions** | Valid token. |
| **Test Steps** | 1. `GET /api/users/not-a-uuid`. |
| **Test Data** | Path: `/api/users/not-a-uuid` |
| **Expected Result** | HTTP 400 or 404 with clear error. No DB error stack trace exposed. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-API-006

| Field | Detail |
|---|---|
| **ID** | TC-API-006 |
| **Module** | API |
| **Feature** | Invalid JSON Payload |
| **Priority** | Medium |
| **Severity** | Major |
| **Preconditions** | Valid token. |
| **Test Steps** | 1. Send `POST /api/users` with malformed JSON body. |
| **Test Data** | Body: `{firstName: 'broken` (invalid JSON) |
| **Expected Result** | HTTP 400. Error: "Invalid JSON." No server crash. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-API-007

| Field | Detail |
|---|---|
| **ID** | TC-API-007 |
| **Module** | API |
| **Feature** | Authorization Header — Wrong Scheme |
| **Priority** | Medium |
| **Severity** | Major |
| **Preconditions** | |
| **Test Steps** | 1. Send request with `Authorization: Token abc123` instead of `Bearer`. |
| **Test Data** | Non-Bearer scheme |
| **Expected Result** | HTTP 401. Token scheme validation fails. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

## 17. Database Validation

---

### TC-DB-001

| Field | Detail |
|---|---|
| **ID** | TC-DB-001 |
| **Module** | Database |
| **Feature** | UUID Primary Keys |
| **Priority** | Medium |
| **Severity** | Minor |
| **Preconditions** | Records created. |
| **Test Steps** | 1. Create a user. 2. Query `SELECT id FROM users` for the new record. |
| **Test Data** | |
| **Expected Result** | ID is a valid UUID (v4 format: `xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx`). |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-DB-002

| Field | Detail |
|---|---|
| **ID** | TC-DB-002 |
| **Module** | Database |
| **Feature** | Soft Delete — `deleted_at` |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | User exists. |
| **Test Steps** | 1. Delete user via API. 2. Query `SELECT * FROM users WHERE id = '<deleted-id>'`. |
| **Test Data** | |
| **Expected Result** | Row still exists in DB. `deleted_at` is set. `deleted_at IS NOT NULL`. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-DB-003

| Field | Detail |
|---|---|
| **ID** | TC-DB-003 |
| **Module** | Database |
| **Feature** | Foreign Key Integrity |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | DB accessible. |
| **Test Steps** | 1. Attempt to insert into `user_roles` with a non-existent `user_id`. |
| **Test Data** | `user_id = 'non-existent-uuid'` |
| **Expected Result** | FK constraint violation. DB rejects the insert. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-DB-004

| Field | Detail |
|---|---|
| **ID** | TC-DB-004 |
| **Module** | Database |
| **Feature** | Password History Table |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | User has changed password multiple times. |
| **Test Steps** | 1. Query `SELECT * FROM password_history WHERE user_id = '<user-id>'`. |
| **Test Data** | |
| **Expected Result** | Multiple rows present. Each contains `password_hash` (bcrypt, not plain text). |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-DB-005

| Field | Detail |
|---|---|
| **ID** | TC-DB-005 |
| **Module** | Database |
| **Feature** | Audit Fields — `created_by`, `updated_by` |
| **Priority** | Medium |
| **Severity** | Minor |
| **Preconditions** | Records created and updated. |
| **Test Steps** | 1. Create user as Admin X. 2. Update as Admin Y. 3. Query user row. |
| **Test Data** | |
| **Expected Result** | `created_by = Admin X UUID` · `updated_by = Admin Y UUID`. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

## 18. UI/UX Testing

---

### TC-UI-001

| Field | Detail |
|---|---|
| **ID** | TC-UI-001 |
| **Module** | UI/UX |
| **Feature** | Responsive Design — Mobile |
| **Priority** | Medium |
| **Severity** | Minor |
| **Preconditions** | Browser with device emulation. |
| **Test Steps** | 1. Open application in mobile viewport (375×667). 2. Navigate through all pages. |
| **Test Data** | Device: iPhone SE |
| **Expected Result** | Navigation collapses to hamburger or drawer. Content reflows without horizontal scrolling. All interactions functional. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-UI-002

| Field | Detail |
|---|---|
| **ID** | TC-UI-002 |
| **Module** | UI/UX |
| **Feature** | Responsive Design — Tablet |
| **Priority** | Medium |
| **Severity** | Minor |
| **Preconditions** | Browser with device emulation. |
| **Test Steps** | 1. Open application at 768×1024. 2. Navigate through main modules. |
| **Test Data** | Device: iPad |
| **Expected Result** | Layout adapts. Tables, modals, and forms render correctly. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-UI-003

| Field | Detail |
|---|---|
| **ID** | TC-UI-003 |
| **Module** | UI/UX |
| **Feature** | Loading Indicators |
| **Priority** | Medium |
| **Severity** | Minor |
| **Preconditions** | Throttle network to "Slow 3G" in DevTools. |
| **Test Steps** | 1. Navigate to Dashboard, Users, Historical Data. 2. Observe loading behaviour. |
| **Test Data** | Slow network simulation |
| **Expected Result** | Loading spinners or skeleton screens displayed while data loads. No blank or broken layouts. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-UI-004

| Field | Detail |
|---|---|
| **ID** | TC-UI-004 |
| **Module** | UI/UX |
| **Feature** | Empty States |
| **Priority** | Low |
| **Severity** | Trivial |
| **Preconditions** | Module with no data. |
| **Test Steps** | 1. Navigate to a module with zero records (e.g. new project, no estimations). |
| **Test Data** | Empty project |
| **Expected Result** | Friendly empty-state message shown (e.g. "No estimations yet. Create your first one."). Not a blank page or broken table. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-UI-005

| Field | Detail |
|---|---|
| **ID** | TC-UI-005 |
| **Module** | UI/UX |
| **Feature** | Toast Notifications |
| **Priority** | Medium |
| **Severity** | Minor |
| **Preconditions** | Application loaded. |
| **Test Steps** | 1. Successfully create a user. 2. Observe toast. 3. Attempt to create a duplicate. 4. Observe error toast. |
| **Test Data** | |
| **Expected Result** | Success toast shown (green). Error toast shown (red). Toasts auto-dismiss after 3–5 seconds. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-UI-006

| Field | Detail |
|---|---|
| **ID** | TC-UI-006 |
| **Module** | UI/UX |
| **Feature** | MultiSelect Dropdown (Roles/Projects in User Form) |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | On Create/Edit User form. Many roles and projects. |
| **Test Steps** | 1. Open Roles multi-select. 2. Search for a role. 3. Select 3 roles — chips appear. 4. Click a chip to remove. 5. Verify "Clear all" button removes all. 6. Close and reopen — search clears. |
| **Test Data** | Search: `Admin` |
| **Expected Result** | Search filters options. Selected items show as chips (max 3 shown, then "+N more"). Clear all removes all. Dropdown closes on outside click. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-UI-007

| Field | Detail |
|---|---|
| **ID** | TC-UI-007 |
| **Module** | UI/UX |
| **Feature** | Browser Compatibility |
| **Priority** | Medium |
| **Severity** | Major |
| **Preconditions** | Multiple browsers available. |
| **Test Steps** | 1. Open application in Chrome, Firefox, Edge, and Safari. 2. Perform core user flow on each. |
| **Test Data** | Latest stable versions |
| **Expected Result** | Application functions identically. No browser-specific layout breaks or JS errors. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-UI-008

| Field | Detail |
|---|---|
| **ID** | TC-UI-008 |
| **Module** | UI/UX |
| **Feature** | Error Messages — User-Friendly |
| **Priority** | Medium |
| **Severity** | Minor |
| **Preconditions** | Various error conditions. |
| **Test Steps** | 1. Trigger 400, 403, 404, 500 errors. 2. Observe displayed messages. |
| **Test Data** | |
| **Expected Result** | Friendly messages shown (not raw stack traces). 500 errors show "Something went wrong" without technical detail. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

## 19. Performance Testing

---

### TC-PERF-001

| Field | Detail |
|---|---|
| **ID** | TC-PERF-001 |
| **Module** | Performance |
| **Feature** | Login Response Time |
| **Priority** | Medium |
| **Severity** | Minor |
| **Preconditions** | Server under normal load. |
| **Test Steps** | 1. Time the login API call from submission to JWT response. |
| **Test Data** | Valid credentials |
| **Expected Result** | Login response ≤ 500ms. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-PERF-002

| Field | Detail |
|---|---|
| **ID** | TC-PERF-002 |
| **Module** | Performance |
| **Feature** | Dashboard Load Time |
| **Priority** | Medium |
| **Severity** | Minor |
| **Preconditions** | Typical production data volume. |
| **Test Steps** | 1. Log in. 2. Time dashboard to fully render (all KPIs, charts). |
| **Test Data** | |
| **Expected Result** | Dashboard fully rendered ≤ 3 seconds. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-PERF-003

| Field | Detail |
|---|---|
| **ID** | TC-PERF-003 |
| **Module** | Performance |
| **Feature** | Large Dataset Pagination |
| **Priority** | Medium |
| **Severity** | Minor |
| **Preconditions** | 10,000+ historical data records. |
| **Test Steps** | 1. Navigate to Historical Data. 2. Load page 1. 3. Navigate to page 50. |
| **Test Data** | 10,000 records |
| **Expected Result** | Each page loads ≤ 2 seconds. Offset-based pagination performs consistently. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-PERF-004

| Field | Detail |
|---|---|
| **ID** | TC-PERF-004 |
| **Module** | Performance |
| **Feature** | CSV Export — Large Volume |
| **Priority** | Medium |
| **Severity** | Minor |
| **Preconditions** | 5,000+ historical records. |
| **Test Steps** | 1. Export CSV with no filters (full export). |
| **Test Data** | 5,000 records |
| **Expected Result** | Export completes ≤ 10 seconds. File is valid and complete. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | Client-side generation with `limit: 5000` API fetch. |

---

### TC-PERF-005

| Field | Detail |
|---|---|
| **ID** | TC-PERF-005 |
| **Module** | Performance |
| **Feature** | Concurrent User Sessions |
| **Priority** | Medium |
| **Severity** | Minor |
| **Preconditions** | Performance test environment. |
| **Test Steps** | 1. Simulate 50 concurrent users using a tool like k6 or JMeter. 2. Each user logs in and fetches dashboard data. |
| **Test Data** | 50 virtual users |
| **Expected Result** | p95 response time ≤ 3 seconds. No 5xx errors. Server remains stable. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

## 20. Security Testing

---

### TC-SECU-001

| Field | Detail |
|---|---|
| **ID** | TC-SECU-001 |
| **Module** | Security |
| **Feature** | Privilege Escalation — Role Tampering |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | Normal user logged in. |
| **Test Steps** | 1. Intercept the login response token. 2. Decode JWT payload. 3. Modify `roles` to `["Global Super Admin"]`. 4. Re-sign with a guessed or empty key. 5. Use modified token on admin endpoints. |
| **Test Data** | Modified JWT |
| **Expected Result** | Server rejects token (signature mismatch). HTTP 401. No privilege escalation occurs. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-SECU-002

| Field | Detail |
|---|---|
| **ID** | TC-SECU-002 |
| **Module** | Security |
| **Feature** | Unauthorized Project Access |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | User A in Project 1 only. Project 2 UUID known. |
| **Test Steps** | 1. Use User A's valid token. 2. `GET /api/analysis?projectId=<Project2UUID>`. |
| **Test Data** | Project 2 UUID |
| **Expected Result** | HTTP 403. Error: access denied. No Project 2 data returned. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-SECU-003

| Field | Detail |
|---|---|
| **ID** | TC-SECU-003 |
| **Module** | Security |
| **Feature** | Horizontal Privilege Escalation — User Data |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | Admin A and Admin B both logged in. Each has different users. |
| **Test Steps** | 1. Admin A obtains user ID of a user owned by Admin B. 2. Admin A calls `PUT /api/users/<Admin-B-user-id>`. |
| **Test Data** | Admin A token, Admin B's user ID |
| **Expected Result** | HTTP 403. Error: "You can only manage users you have created." |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-SECU-004

| Field | Detail |
|---|---|
| **ID** | TC-SECU-004 |
| **Module** | Security |
| **Feature** | Session Fixation |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Valid login session. |
| **Test Steps** | 1. Log in as User A. Copy refresh token. 2. Log out. 3. Attempt to use copied refresh token to regain session. |
| **Test Data** | Copied refresh token |
| **Expected Result** | Refresh token invalidated on logout. Reuse returns 401. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-SECU-005

| Field | Detail |
|---|---|
| **ID** | TC-SECU-005 |
| **Module** | Security |
| **Feature** | Sensitive Data Exposure — Password in Logs |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | Server logs accessible. |
| **Test Steps** | 1. Submit login and user-create requests. 2. Inspect server logs. |
| **Test Data** | |
| **Expected Result** | Passwords never appear in server logs in plain text or even hashed. Request bodies with password fields are sanitized before logging. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-SECU-006

| Field | Detail |
|---|---|
| **ID** | TC-SECU-006 |
| **Module** | Security |
| **Feature** | Password Storage Validation |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | DB accessible. |
| **Test Steps** | 1. Create a user. 2. Query `SELECT password_hash FROM users WHERE email = '<email>'`. |
| **Test Data** | |
| **Expected Result** | Password stored as bcrypt hash (starts with `$2b$`). Plain text password NOT in DB. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-SECU-007

| Field | Detail |
|---|---|
| **ID** | TC-SECU-007 |
| **Module** | Security |
| **Feature** | API Tampering — IDOR |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | User A and User B exist. |
| **Test Steps** | 1. Log in as User A. 2. Enumerate User B's ID (via listing). 3. Call `GET /api/users/<User-B-id>` with User A's token if A is Admin and B is owned by different admin. |
| **Test Data** | |
| **Expected Result** | HTTP 403. IDOR prevented. Admin A cannot read Admin B's user data. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

## 21. Regression Testing

---

### TC-REGR-001

| Field | Detail |
|---|---|
| **ID** | TC-REGR-001 |
| **Module** | Regression |
| **Feature** | Estimation Functionality Post-RBAC |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | RBAC and project isolation implemented. |
| **Test Steps** | 1. Log in as a normal user. 2. Create estimation. 3. Edit estimation. 4. View estimation list. 5. Delete estimation. |
| **Test Data** | Normal user, valid project selected |
| **Expected Result** | All estimation CRUD operations work exactly as before RBAC implementation. No regressions. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-REGR-002

| Field | Detail |
|---|---|
| **ID** | TC-REGR-002 |
| **Module** | Regression |
| **Feature** | Historical Data Export Post-RBAC |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | RBAC implemented. Historical data exists. |
| **Test Steps** | 1. Navigate to Historical Data. 2. Export CSV. 3. Verify file content. |
| **Test Data** | |
| **Expected Result** | CSV export works as before. 17-column format intact. No regression from RBAC changes. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-REGR-003

| Field | Detail |
|---|---|
| **ID** | TC-REGR-003 |
| **Module** | Regression |
| **Feature** | Log Monitor Route (Post Bug Fix) |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Navigation links visible. |
| **Test Steps** | 1. Click **Log Monitor**. Verify Log Monitor page. 2. Click **Health Monitor**. Verify Health Monitor page. |
| **Test Data** | |
| **Expected Result** | Each link navigates to the correct page. Bug (Log Monitor showing Health Monitor) does not recur. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | Regression test for route bug fix in `App.tsx`. |

---

### TC-REGR-004

| Field | Detail |
|---|---|
| **ID** | TC-REGR-004 |
| **Module** | Regression |
| **Feature** | Projects Column in Users Table |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Users have project assignments. |
| **Test Steps** | 1. Navigate to Users. 2. Verify Projects column is populated for all users who have projects. |
| **Test Data** | |
| **Expected Result** | Projects column not blank. Assigned project names displayed correctly. Bug (blank Projects column) does not recur. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | Regression test for the `listUsers` JOIN fix. |

---

### TC-REGR-005

| Field | Detail |
|---|---|
| **ID** | TC-REGR-005 |
| **Module** | Regression |
| **Feature** | Dashboard KPI Accuracy After Project Isolation |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Multiple projects with data. |
| **Test Steps** | 1. Select Project A. Check KPIs. 2. Manually count estimations in Project A. 3. Compare manual count to KPI. |
| **Test Data** | |
| **Expected Result** | KPIs match manual counts. Project isolation does not over-filter or double-count. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-REGR-006

| Field | Detail |
|---|---|
| **ID** | TC-REGR-006 |
| **Module** | Regression |
| **Feature** | Edit User Modal — Project Pre-selection |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Admin A has projects [P1, P2]. User was assigned P3 by a Super Admin. Admin A opens edit for that user. |
| **Test Steps** | 1. Admin A opens the Edit User modal. 2. Check pre-selected projects in modal. |
| **Test Data** | |
| **Expected Result** | Only P1 and P2 are pre-selected (within Admin A's scope). P3 is NOT shown or pre-selected. No phantom project IDs passed to API. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | Regression test for the edit modal project pre-selection filter fix. |

---

## 22. End-to-End Scenarios

---

### TC-E2E-001

| Field | Detail |
|---|---|
| **ID** | TC-E2E-001 |
| **Module** | End-to-End |
| **Feature** | Full Admin Setup and Estimation Flow |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | Clean environment. GSA credentials available. |
| **Test Steps** | 1. GSA logs in. 2. Creates Project "E2E Project". 3. Creates Admin user "admin_e2e" and assigns "E2E Project". 4. GSA logs out. 5. Admin "admin_e2e" logs in. 6. Admin creates User "user_e2e" and assigns "E2E Project". 7. Admin logs out. 8. User "user_e2e" logs in. 9. Selects "E2E Project". 10. Creates an estimation. 11. Views estimation in list. 12. GSA logs in and checks dashboard KPIs and analytics — verifies new estimation is reflected. |
| **Test Data** | GSA creds · Admin: `admin_e2e@test.com / Admin@2026` · User: `user_e2e@test.com / User@2026` |
| **Expected Result** | All steps succeed. Estimation created by normal user is visible in dashboard and analytics for the project. Each role sees only authorised data throughout. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | Complete happy-path for the primary platform flow. |

---

### TC-E2E-002

| Field | Detail |
|---|---|
| **ID** | TC-E2E-002 |
| **Module** | End-to-End |
| **Feature** | Registration → Approval → First Login → Password Change → Estimation |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | Admin exists. Registration is enabled. |
| **Test Steps** | 1. New user submits registration request. 2. Admin receives notification, approves request. 3. New user logs in with provided credentials. 4. System prompts or user navigates to change password. 5. User changes password (meeting policy). 6. User selects assigned project. 7. User creates an estimation. |
| **Test Data** | New user: `registered@test.com` |
| **Expected Result** | Registration approval creates account. First login succeeds. Password change successful (old password rejected after change). Estimation created and visible. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-E2E-003

| Field | Detail |
|---|---|
| **ID** | TC-E2E-003 |
| **Module** | End-to-End |
| **Feature** | Multi-Project Admin — Data Isolation Verification |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | Admin has access to Project A and Project B. Each has distinct estimations. |
| **Test Steps** | 1. Admin logs in. 2. Selects Project A — notes estimation count, KPIs. 3. Switches to Project B — notes different estimation count. 4. Creates an estimation in Project B. 5. Switches back to Project A — verifies new estimation does NOT appear. 6. Exports CSV from Project A — verifies only Project A data in file. 7. Exports CSV from Project B — verifies Project B's estimation appears. |
| **Test Data** | Admin with 2 projects |
| **Expected Result** | Data is completely isolated per project. Switching projects triggers full data refresh. CSVs contain correct project-scoped data. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-E2E-004

| Field | Detail |
|---|---|
| **ID** | TC-E2E-004 |
| **Module** | End-to-End |
| **Feature** | GSA — All Projects vs. Individual Project |
| **Priority** | High |
| **Severity** | Critical |
| **Preconditions** | GSA logged in. 3 projects exist with data. |
| **Test Steps** | 1. Select "All Projects" — note aggregated dashboard KPIs. 2. Select Project 1 — KPIs change to Project 1 only. 3. Select Project 2 — KPIs change to Project 2 only. 4. Reselect "All Projects" — aggregated KPIs return. 5. Export CSV from each view. |
| **Test Data** | GSA credentials |
| **Expected Result** | All Projects shows combined totals. Individual project views show project-specific totals. CSV exports reflect the active selection. Selecting All Projects restores aggregated view. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-E2E-005

| Field | Detail |
|---|---|
| **ID** | TC-E2E-005 |
| **Module** | End-to-End |
| **Feature** | User Lifecycle — Create → Disable → Re-enable → Delete |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | Admin logged in. |
| **Test Steps** | 1. Admin creates user. 2. User logs in successfully. 3. Admin disables user. 4. User attempts login — fails. 5. Admin re-enables user. 6. User logs in successfully. 7. Admin deletes user. 8. User attempts login — fails. 9. Check DB — `deleted_at` is set, data preserved. |
| **Test Data** | `lifecycle_user@test.com` |
| **Expected Result** | Each state transition correctly reflected in login behaviour and DB. Audit log captures each change. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-E2E-006

| Field | Detail |
|---|---|
| **ID** | TC-E2E-006 |
| **Module** | End-to-End |
| **Feature** | Role Permission Change — Live Effect |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | User with `Project Reviewer` role that has `estimation.read` but not `estimation.create`. |
| **Test Steps** | 1. User logs in. Verifies cannot create estimation (button absent/disabled). 2. GSA edits `Project Reviewer` role — adds `estimation.create`. 3. User logs out and logs back in. 4. User verifies can now create an estimation. 5. GSA removes `estimation.create` again. 6. User re-logs in — create option gone again. |
| **Test Data** | Role: `Project Reviewer` |
| **Expected Result** | Permission changes take effect after user's next login (JWT refresh). No stale permission state persists. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

### TC-E2E-007

| Field | Detail |
|---|---|
| **ID** | TC-E2E-007 |
| **Module** | End-to-End |
| **Feature** | Session Expiry and Silent Refresh |
| **Priority** | High |
| **Severity** | Major |
| **Preconditions** | User logged in. |
| **Test Steps** | 1. Log in and begin using application. 2. Wait 15+ minutes (or simulate token expiry in test env). 3. Perform an action (navigate to a page that fetches data). 4. Observe whether user is silently re-authenticated or redirected to login. |
| **Test Data** | |
| **Expected Result** | Frontend silently refreshes access token using refresh token. User does not see a login screen mid-session unless refresh token is also expired. UX is seamless. |
| **Actual Result** | |
| **Status** | |
| **Remarks** | |

---

*Document prepared by: QA Team*  
*Platform: Estimation Platform v1.0*  
*Last Updated: 2026-06-27*
