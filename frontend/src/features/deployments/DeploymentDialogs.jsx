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
        title={pendingDeleteGroup?.assignments[0]?.status === 'scheduled' ? 'Cancel deployment group?' : 'End deployment group?'}
        message={pendingDeleteGroup
          ? `Update all ${pendingDeleteGroup.assignments.length} assignment(s) under ${pendingDeleteGroup.patrolArea}? Personnel will be notified. Operational history will be retained.`
          : ''}
        confirmLabel={pendingDeleteGroup?.assignments[0]?.status === 'scheduled' ? 'Cancel deployment' : 'End deployment'}
        cancelLabel="Cancel"
        onConfirm={onConfirmDeleteGroup}
        onCancel={onCancelDeleteGroup}
      />
      <ConfirmModal
        open={Boolean(pendingDeleteAssignment)}
        title={pendingDeleteAssignment?.status === 'scheduled' ? 'Cancel deployment?' : 'End deployment?'}
        message={pendingDeleteAssignment
          ? `Update ${pendingDeleteAssignment.id} for ${pendingDeleteAssignment.personnelName}? Personnel will be notified. Operational history will be retained.`
          : ''}
        confirmLabel={pendingDeleteAssignment?.status === 'scheduled' ? 'Cancel deployment' : 'End deployment'}
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
