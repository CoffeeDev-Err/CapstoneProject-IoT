import ActionNoticeModal from '../../components/ActionNoticeModal'
import ConfirmModal from '../../components/ConfirmModal'

export default function DeploymentDialogs({
  actionLabel,
  actionNoticeOpen,
  deploymentBlockingReasons,
  onCancelDeleteAssignment,
  onCancelDeleteGroup,
  onCloseActionNotice,
  onConfirmDeleteAssignment,
  onConfirmDeleteGroup,
  pendingDeleteAssignment,
  pendingDeleteGroup,
}) {
  return (
    <>
      <ConfirmModal
        open={Boolean(pendingDeleteGroup)}
        title="Delete Deployment Group?"
        message={pendingDeleteGroup
          ? `Delete all ${pendingDeleteGroup.assignments.length} assignment(s) under ${pendingDeleteGroup.patrolArea}? This cannot be undone.`
          : ''}
        confirmLabel="Delete Group"
        cancelLabel="Cancel"
        onConfirm={onConfirmDeleteGroup}
        onCancel={onCancelDeleteGroup}
      />
      <ConfirmModal
        open={Boolean(pendingDeleteAssignment)}
        title="Delete Deployment Assignment?"
        message={pendingDeleteAssignment
          ? `Delete ${pendingDeleteAssignment.id} for ${pendingDeleteAssignment.personnelName}? This cannot be undone.`
          : ''}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={onConfirmDeleteAssignment}
        onCancel={onCancelDeleteAssignment}
      />
      <ActionNoticeModal
        open={actionNoticeOpen}
        title={`${actionLabel} unavailable`}
        message="Complete the following deployment requirements before continuing."
        items={deploymentBlockingReasons}
        onClose={onCloseActionNotice}
      />
    </>
  )
}
