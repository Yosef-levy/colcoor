/** Whether to auto-select a newly persisted user message without stealing user navigation. */
export function shouldAutoSelectPersistedUserMessage(params: {
  selectPersistedUser: boolean;
  selectedEventId: string | undefined;
  replyParentEventId: string;
  selectionAtSendStart: string | undefined;
  selectionRevision: number;
  selectionRevisionAtSendStart: number;
}): boolean {
  const selected = params.selectedEventId?.trim();
  const replyParent = params.replyParentEventId.trim();
  const atSend = params.selectionAtSendStart?.trim();
  if (!params.selectPersistedUser || !selected || !replyParent || !atSend) {
    return false;
  }
  return (
    params.selectionRevision === params.selectionRevisionAtSendStart &&
    selected === atSend &&
    selected === replyParent
  );
}
