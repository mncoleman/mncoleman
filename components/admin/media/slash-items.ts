import { Network, PanelTop } from 'lucide-react';
import { registerSlashItems, type SlashItem } from '../slash-registry';
import { embedPickerStore } from './embed-store';
import { insertMermaid } from './insert';

/**
 * Post-media entries for the editor's "/" menu. The menu has already removed the typed
 * "/query" when `run` is called, so these only insert.
 */
export const mediaSlashItems: SlashItem[] = [
    {
        id: 'mermaid',
        title: 'Diagram (Mermaid)',
        description: 'A live flowchart / sequence diagram from text',
        keywords: 'mermaid diagram flowchart chart graph sequence',
        icon: Network,
        run: ({ editor }) => insertMermaid(editor),
    },
    {
        id: 'embed-artifact',
        title: 'Embed artifact',
        description: 'Show one of your artifacts inline in the post',
        keywords: 'embed artifact iframe interactive html',
        icon: PanelTop,
        run: ({ editor }) => embedPickerStore.open(editor),
    },
];

// Registering at module load means importing this module is all the editor has to do.
registerSlashItems(mediaSlashItems);
