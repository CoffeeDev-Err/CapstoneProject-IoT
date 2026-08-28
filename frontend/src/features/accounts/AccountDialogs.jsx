import ActionNoticeModal from '../../components/ActionNoticeModal'
import ConfirmModal from '../../components/ConfirmModal'

export default function AccountDialogs({
  actionNotice,
  onCancelDeactivate,
  onCloseActionNotice,
  onConfirmDeactivate,
  pendingAccount,
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
