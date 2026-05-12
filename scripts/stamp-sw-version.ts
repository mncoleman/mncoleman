import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const SW_PATH = join(process.cwd(), 'out', 'sw.js');

function resolveBuildId(): string {
    try {
        return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
            .toString()
            .trim();
    } catch {
        return `t${Date.now()}`;
    }
}

function main() {
    const buildId = resolveBuildId();
    const source = readFileSync(SW_PATH, 'utf8');
    const next = source.replace(
        /const CACHE_NAME = '[^']+';/,
        `const CACHE_NAME = 'mc-blog-${buildId}';`
    );

    if (next === source) {
        throw new Error('stamp-sw-version: CACHE_NAME line not found in public/sw.js');
    }

    writeFileSync(SW_PATH, next);
    console.log(`Stamped service worker cache: mc-blog-${buildId}`);
}

main();
