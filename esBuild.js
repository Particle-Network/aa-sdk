import { build } from 'esbuild';

const buildConfig = {
    bundle: true,
    platform: 'browser',
    target: 'es2015',
    plugins: [
        {
            name: 'external',
            setup(build) {
                let filter = /^[^./]|^\.[^./]|^\.\.[^/]/;
                build.onResolve({ filter }, (args) => ({
                    external: true,
                    path: args.path,
                }));
            },
        },
    ],
    tsconfig: './tsconfig.json',
    splitting: true,
    entryPoints: ['src/index.ts'],
    drop: process.env.NODE_ENV !== 'development' ? ['console', 'debugger'] : [],
    watch: process.env.NODE_ENV === 'development',
    sourcemap: true,
    minify: false,
};

const buildESM = build({
    ...buildConfig,
    format: 'esm',
    outdir: 'dist/esm',
    outExtension: { '.js': '.mjs' },
    splitting: true,
});

const buildCJS = build({
    ...buildConfig,
    outdir: 'dist/cjs',
    outExtension: { '.js': '.cjs' },
    splitting: false,
});

Promise.all([buildESM, buildCJS])
    .then(() => {
        console.log('Build success...');
    })
    .catch(() => process.exit(1));
