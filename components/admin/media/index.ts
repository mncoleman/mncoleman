import { MediaDecorations } from './media-decorations';
import './slash-items'; // registers the "/" menu entries as a side effect

/** Tiptap extensions for post media (add to the editor's extension list). */
export const mediaExtensions = [MediaDecorations];

export { CaptionImage } from './caption-image';
export { MediaUI } from './MediaUI';
export { mediaSlashItems } from './slash-items';
export { insertMermaid, insertEmbed, cleanCaption } from './insert';
