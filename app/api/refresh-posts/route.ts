import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const githubToken = process.env.GITHUB_TOKEN;

        if (!githubToken) {
            return NextResponse.json(
                { error: 'GitHub token not configured' },
                { status: 500 }
            );
        }

        // Trigger the GitHub Actions workflow
        const response = await fetch(
            'https://api.github.com/repos/slider003/matthew-coleman/actions/workflows/deploy.yml/dispatches',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${githubToken}`,
                    'Accept': 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                },
                body: JSON.stringify({
                    ref: 'claude/personal-website-blog-cms-01PeQo6GUb1HL1TtbpYQ2qBU', // Your branch name
                }),
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('GitHub API error:', errorText);
            return NextResponse.json(
                { error: 'Failed to trigger rebuild' },
                { status: response.status }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error triggering rebuild:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
