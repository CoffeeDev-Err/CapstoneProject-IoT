import ActionNoticeModal from '../../components/ActionNoticeModal'
import ConfirmModal from '../../components/ConfirmModal'
import ReactivateAccountModal from './ReactivateAccountModal'

export default function AccountDialogs({
  actionNotice,
  onCancelDeactivate,
  onCloseActionNotice,
  onConfirmDeactivate,
  onCancelReactivate,
  onConfirmReactivate,
  pendingAccount,
  pendingReactivateAccount,
  accountRequestPending,
  assignedImeiToAccount,
  devices,
}) {
  return (
    <>
      <ConfirmModal
        open={Boolean(pendingAccount)}
        title="Deactivate Account?"
        message={pendingAccount
          ? pendingAccount.role === 'Supervisor'
            ? `Deactivate ${pendingAccount.loginId}? Web administration access will stop.`
            : `Deactivate ${pendingAccount.fullName}? Mobile access will stop and the GPS device will be released for reassignment.`
          : ''}
        confirmLabel="Deactivate"
        cancelLabel="Cancel"
        onConfirm={onConfirmDeactivate}
        onCancel={onCancelDeactivate}
      />
      {pendingReactivateAccount && (
        <ReactivateAccountModal
          account={pendingReactivateAccount}
          assignedImeiToAccount={assignedImeiToAccount}
          devices={devices}
          pending={accountRequestPending}
          onConfirm={onConfirmReactivate}
          onCancel={onCancelReactivate}
        />
      )}
      <ActionNoticeModal
        open={Boolean(actionNotice)}
        title={actionNotice?.title}
        message={actionNotice?.message}
        items={actionNotice?.items}
        onClose={onCloseActionNotice}
      />
    </>
  )
}
