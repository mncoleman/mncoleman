/**
 * The admin layout kit. Every admin section builds on these so the lists and editors look and behave the same.
 * See the doc comment on each export; `PostsManager` (list) and `PostEditor` (editor) are the reference uses,
 * `ProjectsPage` / `CollectionList` / `CollectionEditor` show the same kit on projects and resources.
 */
export { AdminPage, PageHeader, HeaderSpacer, NewButton } from './AdminPage';
export { SearchField } from './SearchField';
export { SegmentedFilter } from './SegmentedFilter';
export { SelectMenu } from './SelectMenu';
export { DataList, ColumnHeader, DataRow, RowTitle, Cell } from './DataList';
export { StatusPill, PILL_TONES, type PillTone } from './StatusPill';
export { Chip, MoreChip, ChipRow } from './Chip';
export { ListFooter } from './ListFooter';
export { EmptyState } from './EmptyState';
export { ListSkeleton } from './ListSkeleton';
export { RowAction } from './RowAction';
export { useCopyLink } from './use-copy-link';
export { useListKeyboard } from './use-list-keyboard';
export { Toaster } from './Toaster';
export { notify } from './toast';
export { Section, SectionRow, StatTile, StatGrid } from './Section';
export {
    usePropertiesDrawer, PropertiesDrawer, PropertiesToggle, PropRow, PropDivider, PropNote, IconButton, TopBarSlot, TOPBAR_SLOT_ID, type DrawerApi,
} from './PropertiesDrawer';
export { STATUS_OPTIONS, filterRows, matchesQuery, matchesStatus, moveIndex, footerText, type StatusFilter } from './list-logic';
export { siteUrl, entryPath, copyLinkMessage, copyText, SITE_ORIGIN, type LinkState } from './copy-link';
export { useUnsavedGuard, leavesPage, UNSAVED_MESSAGE } from './use-unsaved-guard';
