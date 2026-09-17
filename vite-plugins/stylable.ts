import type { HmrContext, ModuleNode, Plugin as VitePlugin } from 'vite';
import { nodeFs as fs } from '@file-services/node';
import { Stylable, generateStylableJSModuleSource } from '@stylable/core';
import { StylableOptimizer } from '@stylable/optimizer';
import { buildStylable } from '@stylable/cli';
import { dirname, join, relative, resolve } from 'path';

const ST_CSS_EXT = '.st.css';
const ST_VIRTUAL_PREFIX = '\0virtual:stylable:';

// Quick hashing function taken from https://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript#answer-52171480
const cyrb53 = (str: string, seed = 0) => {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for(let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1  = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2  = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};

export default function (
    options?: {
        dtsDir?: string
    }
): VitePlugin {

    let stylable: Stylable;
    let isDevelopment = false;
    let stBuildProcess: Awaited<ReturnType<typeof buildStylable> | undefined>;

    const cssMap = new Map<string, string>();
    const stylableFileMap = new Map<string, string>();
    const realToVirtualMap = new Map<string, string>();
    const moduleToImportersMap = new Map<string, Set<string>>();

    const normalizeId = (id: string) => id.replaceAll(/\\/g, '/');
    const stripQueryParams = (id: string) => id.split('?')[0];

    const createStylable = () => new Stylable({
        fileSystem: fs,
        optimizer: new StylableOptimizer(),
        projectRoot: process.cwd(),
        mode: isDevelopment ? 'development' : 'production',
        resolveNamespace(namespace, origin) {
            const relativePath = normalizeId(relative(process.cwd(), origin));
            return `${namespace}-${cyrb53(relativePath)}`;
        },
    });

    const createVirtualIds = (realPath: string) => {
        const normalizedPath = normalizeId(realPath);
        return {
            virtualJsId: `${ST_VIRTUAL_PREFIX}${normalizedPath}.js`,
            virtualCssId: `${ST_VIRTUAL_PREFIX}${normalizedPath}`
        };
    };

    const transformStylesheet = (realPath: string) => {
        const code = fs.readFileSync(realPath, 'utf8');
        const res = stylable.transform(stylable.analyze(realPath, code));
        const finalCSS = res.meta.targetAst?.toString() || '';
        
        return {
            css: finalCSS,
            exports: res.exports,
            namespace: res.meta.namespace
        };
    };

    return {
        name: 'vite-stylable-plugin',
        enforce: 'pre',

        configResolved(config) {
            isDevelopment = config.command === 'serve';
            stylable = createStylable();
        },

        resolveId(id, importer) {

            const cleanId = stripQueryParams(id);

            if (id.startsWith(ST_VIRTUAL_PREFIX)) return id;

            if (cleanId.endsWith(ST_CSS_EXT)) {
                const realPath = importer
                    ? resolve(dirname(stripQueryParams(importer)), cleanId)
                    : cleanId.startsWith('/')
                        ? resolve(process.cwd(), `.${cleanId}`)
                        : resolve(cleanId);

                const normalizedRealPath = normalizeId(realPath);
                const { virtualJsId } = createVirtualIds(normalizedRealPath);

                if (importer) {
                    const importers = moduleToImportersMap.get(virtualJsId) || new Set();
                    importers.add(normalizeId(importer));
                    moduleToImportersMap.set(virtualJsId, importers);
                }

                stylableFileMap.set(virtualJsId, normalizedRealPath);
                realToVirtualMap.set(normalizedRealPath, virtualJsId);

                return virtualJsId;
            }

        },

        async load(id) {

            const cleanId = stripQueryParams(id);
            
            if (stylableFileMap.has(cleanId)) {

                const realPath = stylableFileMap.get(cleanId)!;
                const result = transformStylesheet(realPath);

                const cssId = cleanId.replace('.js', '');
                cssMap.set(cssId, result.css);

                const stylableJsModule = generateStylableJSModuleSource({
                    jsExports: result.exports,
                    namespace: result.namespace,
                    moduleType: 'esm',
                    imports: [
                        { from: cssId }
                    ],
                });

                this.addWatchFile(realPath);

                return {
                    code: stylableJsModule,
                    map: null,
                    moduleSideEffects: 'no-treeshake'
                };
            }

            if (cleanId.startsWith(ST_VIRTUAL_PREFIX) && !cleanId.endsWith('.js')) {
                const css = cssMap.get(cleanId);
                return {
                    code: css!,
                    map: null,
                    moduleSideEffects: 'no-treeshake'
                };
            }

        },

        handleHotUpdate({ file, server }: HmrContext) {

            if (!file.endsWith(ST_CSS_EXT)) return;

            stylable = createStylable();

            const affectedModules = new Set<ModuleNode>();

            for (const [virtualJsId, realPath] of stylableFileMap) {
                const { virtualCssId } = createVirtualIds(realPath);
                const result = transformStylesheet(realPath);
                cssMap.set(virtualCssId, result.css);

                const jsModule = server.moduleGraph.getModuleById(virtualJsId);
                if (jsModule) {
                    server.moduleGraph.invalidateModule(jsModule);
                    affectedModules.add(jsModule);
                }

                const cssModule = server.moduleGraph.getModuleById(virtualCssId);
                if (cssModule) {
                    server.moduleGraph.invalidateModule(cssModule);
                    affectedModules.add(cssModule);
                }

                const importers = moduleToImportersMap.get(virtualJsId);
                importers?.forEach((importer) => {
                    const importerModule = server.moduleGraph.getModuleById(importer);
                    if (importerModule) {
                        server.moduleGraph.invalidateModule(importerModule);
                        affectedModules.add(importerModule);
                    }
                });
            }

            return Array.from(affectedModules);
        },

        async configureServer(server) {
            if (!(server.config.command === 'serve' && options?.dtsDir)) return;

            console.log(`[Stylable] DTS watch server enabled. Outputting type files to ${join(process.cwd(), options.dtsDir)}`);

            stBuildProcess = await buildStylable(process.cwd(), {
                defaultOptions: {
                    srcDir: './src',
                    outDir: options.dtsDir,
                    dts: true,
                    dtsSourceMap: true
                },
                watch: true,
                log: () => {}
            });
        },

        async closeBundle() {
            if (stBuildProcess) {
                await stBuildProcess.watchHandler.stop();
            }
        }

    };
}
