'use client';

import { RefreshCw } from 'lucide-react';
import { useState } from 'react';

export function RefreshButton() {
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState('');

    const handleRefresh = async () => {
        setIsLoading(true);
        setMessage('');

        try {
            const response = await fetch('/api/refresh-posts', {
                method: 'POST',
            });

            const data = await response.json();

            if (response.ok) {
                setMessage('✅ Rebuild triggered! New posts will appear in ~2 minutes.');
            } else {
                setMessage(`❌ Error: ${data.error}`);
            }
        } catch (error) {
            setMessage('❌ Failed to trigger rebuild. Check console for details.');
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div>
            <button
                onClick={handleRefresh}
                disabled={isLoading}
                className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
            >
                <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                {isLoading ? 'Triggering Rebuild...' : 'Refresh Posts from Notion'}
            </button>
            {message && (
                <p className="mt-2 text-sm text-muted-foreground">{message}</p>
            )}
        </div>
    );
}
