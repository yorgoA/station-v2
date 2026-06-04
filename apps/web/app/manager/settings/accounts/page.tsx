"use client";

import Link from "next/link";
import { useState } from "react";
import { AppShell } from "../../../_components/app-shell";
import { managerNavItems } from "../../../_components/role-nav";

type AccountRow = {
  id: string;
  name: string;
  email: string;
  role: "manager" | "employee" | "collector";
  status: "active" | "invited" | "disabled";
  password: string;
};

const initialAccounts: AccountRow[] = [
  {
    id: "u-1",
    name: "Yorgo Aoun",
    email: "yorgo@stationaoun.com",
    role: "manager",
    status: "active",
    password: "Manager@123",
  },
  {
    id: "u-2",
    name: "Nour Team",
    email: "nour@stationaoun.com",
    role: "employee",
    status: "active",
    password: "Employee@123",
  },
  {
    id: "u-3",
    name: "Yamen",
    email: "yamen@stationaoun.com",
    role: "collector",
    status: "active",
    password: "Christian@1999",
  },
];

export default function ManagerAccountsSettingsPage() {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"manager" | "employee" | "collector">("employee");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [manageRole, setManageRole] = useState<"manager" | "employee" | "collector">("employee");
  const [manageStatus, setManageStatus] = useState<"active" | "invited" | "disabled">("active");
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const passwordsMatch = password !== "" && password === confirmPassword;
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? null;
  const newPasswordsMatch = newPassword !== "" && newPassword === confirmNewPassword;

  function openManageModal(account: AccountRow) {
    setSelectedAccountId(account.id);
    setManageRole(account.role);
    setManageStatus(account.status);
    setShowPassword(false);
    setNewPassword("");
    setConfirmNewPassword("");
  }

  function closeManageModal() {
    setSelectedAccountId(null);
  }

  function saveManagedAccount() {
    if (!selectedAccount) return;
    setAccounts((prev) =>
      prev.map((account) =>
        account.id === selectedAccount.id
          ? {
              ...account,
              role: manageRole,
              status: manageStatus,
              password: newPasswordsMatch ? newPassword : account.password,
            }
          : account
      )
    );
    closeManageModal();
  }

  function deleteManagedAccount() {
    if (!selectedAccount) return;
    setAccounts((prev) => prev.filter((account) => account.id !== selectedAccount.id));
    closeManageModal();
  }

  return (
    <AppShell
      title="Accounts"
      subtitle="Create and manage manager, employee, and collector accounts"
      navItems={managerNavItems}
    >
      <Link href="/manager/settings" className="back-link">
        ← Back to Settings
      </Link>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Create Account</h3>
        <div className="filters-grid filters-grid-pro">
          <label htmlFor="account-name">
            Full name
            <input id="account-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          </label>
          <label htmlFor="account-email">
            Email
            <input
              id="account-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@stationaoun.com"
            />
          </label>
          <label htmlFor="account-role">
            Role
            <select id="account-role" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
              <option value="manager">Manager</option>
              <option value="employee">Employee</option>
              <option value="collector">Collector</option>
            </select>
          </label>
          <label htmlFor="account-password">
            Password
            <input
              id="account-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </label>
          <label htmlFor="account-confirm-password">
            Confirm password
            <input
              id="account-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
            />
          </label>
        </div>
        {!passwordsMatch && confirmPassword.length > 0 ? (
          <p style={{ color: "var(--danger)", marginBottom: 0 }}>Passwords do not match.</p>
        ) : null}
        <div className="card-actions-right">
          <button
            type="button"
            className="success-btn"
            disabled={!name.trim() || !email.trim() || password.length < 8 || !passwordsMatch}
          >
            Create Account
          </button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Existing Accounts</h3>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id}>
                <td>{account.name}</td>
                <td>{account.email}</td>
                <td>{account.role}</td>
                <td>{account.status}</td>
                <td>
                  <button type="button" onClick={() => openManageModal(account)}>
                    Manage
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedAccount ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Manage account">
          <div className="modal-card">
            <h3 style={{ marginTop: 0 }}>Manage Account</h3>
            <p className="muted">
              {selectedAccount.name} ({selectedAccount.email})
            </p>
            <div className="filters-grid filters-grid-pro">
              <label htmlFor="manage-account-role">
                Role
                <select
                  id="manage-account-role"
                  value={manageRole}
                  onChange={(e) => setManageRole(e.target.value as typeof manageRole)}
                >
                  <option value="manager">Manager</option>
                  <option value="employee">Employee</option>
                  <option value="collector">Collector</option>
                </select>
              </label>
              <label htmlFor="manage-account-status">
                Status
                <select
                  id="manage-account-status"
                  value={manageStatus}
                  onChange={(e) => setManageStatus(e.target.value as typeof manageStatus)}
                >
                  <option value="active">Active</option>
                  <option value="invited">Invited</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>
              <label htmlFor="manage-account-password">
                Current password
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    id="manage-account-password"
                    type={showPassword ? "text" : "password"}
                    value={selectedAccount.password}
                    readOnly
                  />
                  <button type="button" onClick={() => setShowPassword((v) => !v)}>
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </label>
              <label htmlFor="manage-account-new-password">
                New password
                <input
                  id="manage-account-new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Leave blank to keep current password"
                />
              </label>
              <label htmlFor="manage-account-confirm-new-password">
                Confirm new password
                <input
                  id="manage-account-confirm-new-password"
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Re-enter new password"
                />
              </label>
            </div>
            {confirmNewPassword.length > 0 && !newPasswordsMatch ? (
              <p style={{ color: "var(--danger)" }}>New passwords do not match.</p>
            ) : null}
            <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 12 }}>
              <button type="button" className="warning-btn">
                Send Password Reset
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="danger-btn" onClick={deleteManagedAccount}>
                  Delete Account
                </button>
                <button type="button" className="danger-btn" onClick={closeManageModal}>
                  Close
                </button>
                <button
                  type="button"
                  className="success-btn"
                  onClick={saveManagedAccount}
                  disabled={(newPassword.length > 0 || confirmNewPassword.length > 0) && !newPasswordsMatch}
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
