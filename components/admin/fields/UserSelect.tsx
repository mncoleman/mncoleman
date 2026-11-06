'use client';

import { useMemo } from 'react';
import { authorOptions, colorOf, initials, roleLabel } from '@/lib/post-editor-logic';
import { SelectField, type SelectOption } from './SelectField';
import { usePanelUsers } from './use-panel-users';

export function Avatar({ name, size = 20 }: { name: string; size?: number }) {
    return (
        <span
            aria-hidden="true"
            className="inline-grid shrink-0 place-items-center rounded-full font-semibold text-white"
            style={{ width: size, height: size, fontSize: Math.round(size * 0.45), background: colorOf(name) }}
        >
            {initials(name)}
        </span>
    );
}

function Row({ name, sub }: { name: string; sub: string }) {
    return (
        <>
            <Avatar name={name} />
            <span className="min-w-0">
                <span className="block truncate">{name}</span>
                {sub && <small className="block text-xs leading-tight text-muted-foreground">{sub}</small>}
            </span>
        </>
    );
}

/**
 * Pick a person from the admin panel's users. The stored value is the person's
 * display name (that is what the post's front matter holds), and a name that is
 * not on the list, like an old post's "Anonymous", stays selectable.
 */
export function UserSelect({
    workerUrl,
    value,
    onChange,
    'aria-label': ariaLabel = 'Author',
    id,
}: {
    workerUrl: string;
    value: string;
    onChange: (name: string) => void;
    'aria-label'?: string;
    id?: string;
}) {
    const { users } = usePanelUsers(workerUrl);
    const options = useMemo<SelectOption[]>(
        () => authorOptions(users, value).map((u) => ({
            value: u.name,
            label: u.name,
            render: <Row name={u.name} sub={u.external ? 'Not in the user list' : roleLabel(u.role)} />,
        })),
        [users, value],
    );
    const current = options.find((o) => o.value === value);
    return (
        <SelectField
            id={id}
            aria-label={ariaLabel}
            value={value}
            options={options}
            onChange={onChange}
            searchPlaceholder="Search people…"
            trigger={current ? current.render : <span className="text-muted-foreground">Empty</span>}
        />
    );
}
