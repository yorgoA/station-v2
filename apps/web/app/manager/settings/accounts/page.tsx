"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "../../../_components/app-shell";
import { managerNavItems } from "../../../_components/role-nav";

type AccountRow = {
  id: string;
  email: string;
  displayName: string;
  role: "manager" | "employee" | "collector";
  isActive: boolean;
  createdAt: string;
};

export default function ManagerAccountsSettingsPage() {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"manager" | "employee" | "collector">("employee");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const passwordsMatch = password !== "" && password === confirmPassword;

  const [selectedAccount, setSelectedAccount] = useState<AccountRow | null>(null);
  const [manageName, setManageName] = useState("");
  const [manageRole, setManageRole] = useState<"manager" | "employee" | "collector">("employee");
  const [manageActive, setManageActive] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const newPasswordsMatch = newPassword === "" || newPassword === confirmNewPassword;

  async function loadAccounts() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/settings/accounts");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to load accounts.");
      setAccounts(data.accounts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load accounts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAccounts();
  }, []);

  function openManageModal(account: AccountRow) {
    setSelectedAccount(account);
    setManageName(account.displayName);
    setManageRole(account.role);
    setManageActive(account.isActive);
    setNewPassword("");
    setConfirmNewPassword("");
    setMessage("");
  }

  function closeManageModal() {
    setSelectedAccount(null);
  }

  async function handleCreateAccount() {
    setError("");
    setMessage("");
    if (!name.trim() || !email.trim() || password.length < 8 || !passwordsMatch) return;
    setCreating(true);
    try {
      const response = await fetch("/api/settings/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: name, email, role, password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to create account.");
      setName("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setRole("employee");
      setMessage("Account created.");
      await loadAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create account.");
    } finally {
      setCreating(false);
    }
  }

  async function saveManagedAccount() {
    if (!selectedAccount || !newPasswordsMatch) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/settings/accounts/${selectedAccount.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: manageName,
          role: manageRole,
          isActive: manageActive,
          newPassword: newPassword || undefined
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to save account.");
      closeManageModal();
      setMessage("Account updated.");
      await loadAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save account.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteManagedAccount() {
    if (!selectedAccount) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/settings/accounts/${selectedAccount.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to delete account.");
      closeManageModal();
      setMessage("Account deleted.");
      await loadAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete account.");
    } finally {
      setSaving(false);
    }
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

      {message ? <p className="muted" role="status">{message}</p> : null}
      {error ? <p style={{ color: "var(--danger)" }} role="alert">{error}</p> : null}

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
            disabled={!name.trim() || !email.trim() || password.length < 8 || !passwordsMatch || creating}
            onClick={handleCreateAccount}
          >
            {creating ? "Creating..." : "Create Account"}
          </button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Existing Accounts</h3>
        {loading ? (
          <p className="muted">Loading accounts...</p>
        ) : (
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
                  <td>{account.displayName}</td>
                  <td>{account.email}</td>
                  <td>{account.role}</td>
                  <td>{account.isActive ? "active" : "disabled"}</td>
                  <td>
                    <button type="button" onClick={() => openManageModal(account)}>
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    No accounts yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>

      {selectedAccount ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Manage account">
          <div className="modal-card">
            <h3 style={{ marginTop: 0 }}>Manage Account</h3>
            <p className="muted">{selectedAccount.email}</p>
            <div className="filters-grid filters-grid-pro">
              <label htmlFor="manage-account-name">
                Full name
                <input
                  id="manage-account-name"
                  value={manageName}
                  onChange={(e) => setManageName(e.target.value)}
                />
              </label>
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
                  value={manageActive ? "active" : "disabled"}
                  onChange={(e) => setManageActive(e.target.value === "active")}
                >
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                </select>
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
            {newPassword.length > 0 && !newPasswordsMatch ? (
              <p style={{ color: "var(--danger)" }}>New passwords do not match.</p>
            ) : null}
            <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 12 }}>
              <button type="button" className="danger-btn" onClick={deleteManagedAccount} disabled={saving}>
                Delete Account
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="danger-btn" onClick={closeManageModal}>
                  Close
                </button>
                <button
                  type="button"
                  className="success-btn"
                  onClick={saveManagedAccount}
                  disabled={saving || (newPassword.length > 0 && !newPasswordsMatch)}
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
