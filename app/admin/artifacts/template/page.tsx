'use client';

import { RecipeTemplateEditor } from '@/components/admin/RecipeTemplateEditor';
import { useAdmin } from '@/components/admin/admin-context';

export default function AdminRecipeTemplatePage() {
    const { workerUrl } = useAdmin();
    return <RecipeTemplateEditor workerUrl={workerUrl} />;
}
