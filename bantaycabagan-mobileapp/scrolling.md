
The expandable bottom-sheet behavior is now correct, but the internal content lost its natural overscroll/bounce effect.

Restore a subtle native-like bounce/elastic overscroll for the ScrollView/FlatList content while preserving the current sheet gesture coordination.

Requirements:

- When the sheet is fully expanded, internal content should scroll normally.
- At the top or bottom of the content, allow a small elastic/bounce effect instead of a hard stop.
- Do not make the bounce excessive.
- Do not let a tiny overscroll immediately drag or dismiss the whole sheet.
- Only hand control back to the sheet when:
  - content is at scroll offset 0
  - and the user performs a clear intentional downward drag beyond a small gesture threshold
- Preserve the current snap points, dismiss threshold, opening/closing animation, and nested scrolling behavior.
- Do not redesign anything.

For React Native:

- inspect current ScrollView/FlatList props
- restore native bounce/overscroll behavior where supported
- avoid disabling overscroll globally
- make sure Android behavior still feels natural, even if it differs slightly from iOS

Test:

1. scroll content upward to the end
2. scroll back to the top
3. small downward overscroll at top -> slight bounce only
4. stronger intentional downward drag at top -> sheet begins moving
5. sheet dismiss threshold still works
