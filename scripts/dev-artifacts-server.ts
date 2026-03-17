/**
 * Standalone dev server for artifact uploads.
 * Run alongside `next dev` with: npx tsx scripts/dev-artifacts-server.ts
 * Listens on port 3001 and handles GET/POST/DELETE for artifacts locally.
 */
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';

const PORT = 3001;
const MANIFEST_PATH = join(process.cwd(), 'data', 'artifacts.json');
const ARTIFACTS_DIR = join(process.cwd(), 'public', 'artifacts');

function readManifest(): any[] {
    try {
        return JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    } catch {
        return [];
    }
}

function writeManifest(artifacts: any[]) {
    writeFileSync(MANIFEST_PATH, JSON.stringify(artifacts, null, 2));
}

function cors(res: ServerResponse) {
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
}

function json(res: ServerResponse, data: any, status = 200) {
    cors(res);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => resolve(body));
    });
}

const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);

    if (req.method === 'OPTIONS') {
        cors(res);
        res.writeHead(204);
        res.end();
        return;
    }

    if (url.pathname !== '/api/artifacts') {
        json(res, { error: 'Not found' }, 404);
        return;
    }

    if (req.method === 'GET') {
        json(res, { artifacts: readManifest() });
        return;
    }

    if (req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        const { filename, content, type, size, description } = body;

        if (!filename || !content) {
            json(res, { error: 'Missing filename or content' }, 400);
            return;
        }

        const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

        mkdirSync(ARTIFACTS_DIR, { recursive: true });
        const fileBuffer = Buffer.from(content, 'base64');
        writeFileSync(join(ARTIFACTS_DIR, safeFilename), fileBuffer);

        let artifacts = readManifest();
        artifacts = artifacts.filter((a: any) => a.filename !== safeFilename);

        const newArtifact = {
            id: crypto.randomUUID(),
            name: safeFilename.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '),
            filename: safeFilename,
            description: description || '',
            type: type || 'application/octet-stream',
            size: size || fileBuffer.length,
            uploadedAt: new Date().toISOString(),
        };
        artifacts.push(newArtifact);
        writeManifest(artifacts);

        console.log(`Uploaded: ${safeFilename} (${fileBuffer.length} bytes)`);
        json(res, { success: true, artifact: newArtifact });
        return;
    }

    if (req.method === 'DELETE') {
        const filename = url.searchParams.get('file');
        if (!filename) {
            json(res, { error: 'Missing file parameter' }, 400);
            return;
        }

        const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

        try {
            unlinkSync(join(ARTIFACTS_DIR, safeFilename));
        } catch {
            // File may not exist
        }

        const artifacts = readManifest();
        const filtered = artifacts.filter((a: any) => a.filename !== safeFilename);
        writeManifest(filtered);

        console.log(`Deleted: ${safeFilename}`);
        json(res, { success: true });
        return;
    }

    json(res, { error: 'Method not allowed' }, 405);
});

server.listen(PORT, () => {
    console.log(`Dev artifacts server running at http://localhost:${PORT}/api/artifacts`);
});
