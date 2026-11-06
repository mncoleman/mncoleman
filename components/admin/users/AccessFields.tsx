'use client';

import { Switch } from '@/components/ui/switch';
import { SegmentedFilter } from '@/components/admin/kit';
import {
    FEATURE_INFO, FEATURE_ORDER, toggleIn, type Access, type Feature,
} from './user-logic';

export interface InstantArtifact { slug: string; name: string; visibility: 'public' | 'private' }

/**
 * Role, features and artifact grants for one person: shared by the invite dialog and the user drawer.
 * A site admin has everything, so the lists only show for an editor. Grants only matter when the editor
 * does not have the Artifacts feature (that feature already covers every artifact).
 */
export function AccessFields({ value, onChange, artifacts, idPrefix }: { value: Access; onChange: (next: Access) => void; artifacts: InstantArtifact[]; idPrefix: string }) {
    return (
        <div className="space-y-4 text-sm">
            <div className="space-y-1.5">
                <SegmentedFilter
                    size="sm"
                    label="Role"
                    value={value.role}
                    onChange={(role) => onChange({ ...value, role })}
                    options={[{ value: 'site_admin', label: 'Site admin' }, { value: 'editor', label: 'Editor' }]}
                />
                <p className="text-xs text-muted-foreground">
                    {value.role === 'site_admin'
                        ? 'Every feature and every artifact, including artifact visibility and passwords. Cannot manage users.'
                        : 'Only what you switch on below.'}
                </p>
            </div>
            {value.role === 'editor' && (
                <>
                    <div>
                        <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">What they can use</p>
                        <div className="divide-y divide-border/50">
                            {FEATURE_ORDER.map((f: Feature) => {
                                const id = `${idPrefix}-feature-${f}`;
                                return (
                                    <div key={f} className="flex items-center justify-between gap-3 py-2">
                                        <label htmlFor={id} className="min-w-0 cursor-pointer">
                                            <span className="block text-sm">{FEATURE_INFO[f].label}</span>
                                            <span className="block text-xs text-muted-foreground">{FEATURE_INFO[f].hint}</span>
                                        </label>
                                        <Switch id={id} checked={value.features.includes(f)} onCheckedChange={() => onChange({ ...value, features: toggleIn(value.features, f) })} />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    {!value.features.includes('artifacts') && (
                        <div>
                            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Artifacts they can edit</p>
                            <p className="mb-2 text-xs text-muted-foreground">
                                Edit mode and Claude linking on these only. Private ones still need their password to open, and editors never change visibility or passwords.
                            </p>
                            {artifacts.length === 0 ? (
                                <p className="text-xs italic text-muted-foreground">No instant artifacts yet.</p>
                            ) : (
                                <div className="max-h-52 divide-y divide-border/50 overflow-y-auto rounded-md border border-border/60 px-3" data-lenis-prevent>
                                    {artifacts.map((a) => {
                                        const id = `${idPrefix}-grant-${a.slug}`;
                                        return (
                                            <div key={a.slug} className="flex items-center justify-between gap-3 py-2">
                                                <label htmlFor={id} className="min-w-0 cursor-pointer">
                                                    <span className="block truncate text-sm">{a.name}</span>
                                                    <span className="block truncate text-xs text-muted-foreground">/a/{a.slug}{a.visibility === 'private' ? ' · private' : ''}</span>
                                                </label>
                                                <Switch id={id} checked={value.artifactGrants.includes(a.slug)} onCheckedChange={() => onChange({ ...value, artifactGrants: toggleIn(value.artifactGrants, a.slug) })} />
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
