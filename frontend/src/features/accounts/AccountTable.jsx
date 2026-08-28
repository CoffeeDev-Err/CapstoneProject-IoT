import InitialsAvatar from '../../components/InitialsAvatar'
import { TableSkeletonRows } from '../../components/LoadingSkeleton'
import { resolveApiAssetUrl } from '../../services/apiAssets'
import { formatDateTime, getDeviceCode } from './accountPresentation'

function AccountTable({
  accountRequestPending,
  accountSearch,
  accounts,
  accountsLoading,
  filteredAccounts,
  onDeactivate,
  onEdit,
  onSearchChange,
}) {
  return (
              <div className="account-table-section account-table-section--standalone">
                <h4 className="settings-label mb-2">Recently Provisioned Accounts</h4>
                <div className="account-table-toolbar">
                  <small className="settings-hint account-table-meta">
                    {filteredAccounts.length} of {accounts.length} account(s)
                  </small>
                  <input
                    type="search"
                    className="settings-input account-table-search"
                    value={accountSearch}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder="Search name, badge, email, device ID, or login"
                    aria-label="Search provisioned accounts"
                  />
                </div>

                <div className="account-table-wrap">
                  <table className="personnel-table table align-middle mb-0">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Rank</th>
                        <th>Badge</th>
                        <th>GPS Device</th>
                        <th>Login ID</th>
                        <th>Official Email</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accountsLoading ? (
                        <TableSkeletonRows columns={9} rows={5} label="Loading accounts" />
                      ) : filteredAccounts.length === 0 ? (
                        <tr className="personnel-row">
                          <td colSpan={9} className="text-body-secondary small">
                            No account matched your search.
                          </td>
                        </tr>
                      ) : (
                        filteredAccounts.map((account, index) => (
                          <tr key={account.id} className="personnel-row">
	                            <td>
	                              <div className="account-name-cell">
	                                <InitialsAvatar
	                                  className="account-table-avatar account-table-avatar--fallback"
	                                  src={account.photoUrl ? resolveApiAssetUrl(account.photoUrl) : ''}
	                                  name={account.fullName || account.loginId || 'Personnel'}
	                                  alt=""
	                                />
	                                <span>{account.fullName || 'Supervisor account'}</span>
	                              </div>
	                            </td>
	                            <td>{account.rank || account.role}</td>
	                            <td className="personnel-badge">{account.role === 'Supervisor' ? '-' : account.badgeNumber}</td>
	                            <td>
	                              {account.role === 'Supervisor' ? (
	                                <span className="text-body-secondary">Not required</span>
	                              ) : account.isMockAccount && !account.imei ? (
	                                <span className="text-body-secondary">No GPS device assigned</span>
	                              ) : (
	                                <>
	                                  <span>{getDeviceCode(account, index)} | {account.flespiDeviceName || 'Registered GPS'}</span>
	                                  <small className="d-block text-body-secondary">{account.imei}</small>
	                                </>
	                              )}
                            </td>
                            <td>{account.loginId}</td>
                            <td>
                              <span>{account.officialEmail || '-'}</span>
                              <small className="d-block text-body-secondary">
                                {account.emailVerified ? 'Verified' : 'Verification pending'}
                              </small>
                            </td>
                            <td>
                              <span
                                className="status-badge"
                                style={{ '--status-color': account.accountStatus === 'Active' ? 'var(--color-success)' : '#64748b' }}
                              >
                                {account.accountStatus}
                              </span>
                            </td>
                            <td>{formatDateTime(account.createdAt)}</td>
                            <td className="account-actions-cell">
                              <div className="account-table-actions">
                                <button
                                  type="button"
                                  className="account-table-btn account-table-btn--edit"
                                  onClick={() => onEdit(account.id)}
                                  disabled={accountRequestPending}
                                >
                                  Edit
                                </button>
                                {account.isProtected || account.role === 'Supervisor' ? (
                                  <span className="account-protected-label" title="COP/admin accounts cannot be deactivated.">
                                    Protected
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    className="account-table-btn account-table-btn--delete"
                                    onClick={() => onDeactivate(account.id)}
                                    disabled={accountRequestPending || account.accountStatus === 'Inactive'}
                                  >
                                    Deactivate
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
  )
}

export default AccountTable
