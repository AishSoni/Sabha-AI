/**
 * Start the replay-only backend for the browser slice.
 *
 * One long-lived Python process owns the disposable Postgres server,
 * provisions/publishes the placeholder package, writes the browser-facing
 * environment, and then serves uvicorn on 8123. A separate provisioner
 * process would stop the embedded database when it exited.
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const isWindows = process.platform === 'win32';
const python =
    process.env.SABHA_PYTHON ??
    join(
        '..',
        'backend',
        'venv',
        isWindows ? 'Scripts' : 'bin',
        isWindows ? 'python.exe' : 'python'
    );

const child = spawn(
    python,
    [
        'scripts/e2e_provision.py',
        '--serve',
        '--env-out',
        join('..', 'frontend', '.e2e-env.json'),
    ],
    {
        cwd: join('..', 'backend'),
        env: { ...process.env, PYTHONPATH: '.' },
        stdio: 'inherit',
    }
);

const stop = () => child.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code) => process.exit(code ?? 0));
