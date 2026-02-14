## Implementation Plan: District Rename Function

### Purpose
Allow admin/editor users to rename a district via the UI, persisting the change through the existing Supabase RPC backend.

### Scope
- New files: None
- Modified files:
  - `src/lib/districts.ts` — Add `renameDistrict` export
  - `src/App.tsx` — Add `handleDistrictRename` handler, pass to MapView
  - `src/components/MapView.tsx` — Accept and forward `onDistrictRename` prop to DrawControls
  - `src/components/DrawControls.tsx` — Add "Rename" button with prompt dialog
- Dependencies: None (uses existing `runDistrictEdit` + Supabase RPC)

### Implementation Steps

#### Step 1: Add `renameDistrict` function to `districts.ts`
- [ ] Export `renameDistrict(id: string, newName: string): Promise<void>`
- [ ] Validate that `newName` is non-empty after trim
- [ ] Call `runDistrictEdit('update', { id, name: newName })`
**Verification**: Function compiles, follows same pattern as `updateDistrictBoundary`

#### Step 2: Add `handleDistrictRename` handler in `App.tsx`
- [ ] Import `renameDistrict` from `districts.ts`
- [ ] Create `handleDistrictRename(districtId: string, newName: string): Promise<OperationResult>`
- [ ] Require login (`user` check), require editor role (`isEditor` check)
- [ ] Call `renameDistrict(districtId, newName)`, then `refreshDistrictsAndHistory()`
- [ ] Pass `onDistrictRename={handleDistrictRename}` to `<MapView>`
**Verification**: Handler follows existing pattern of `handleDistrictCreate` / `handleDistrictDelete`

#### Step 3: Forward `onDistrictRename` prop through `MapView`
- [ ] Add `onDistrictRename` to MapView props type
- [ ] Pass it through to `<DrawControls>`
**Verification**: Build passes, prop flows from App → MapView → DrawControls

#### Step 4: Add "Rename" button in `DrawControls`
- [ ] Add `onRename` to `DrawControlsProps`
- [ ] Add "Rename" button (visible when `canEdit` and a district is selected, not during active editing)
- [ ] On click: show `window.prompt` with current district name pre-filled
- [ ] If user confirms non-empty name different from current, call `onRename(selectedDistrictId, newName)`
**Verification**: Button appears for editors, triggers rename, name updates in sidebar district list

### Risks & Considerations
- The Supabase RPC `apply_district_operation` must handle 'update' with only `name` changed (no geometry). Based on code review, `p_geometry` is passed as `null` which should be fine if the RPC treats null as "no change".
- If the RPC requires geometry for updates, a fallback would be to pass the current geometry along with the new name.

### Open Questions
- None — the existing `runDistrictEdit` infrastructure handles this cleanly.
