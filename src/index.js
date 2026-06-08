import { readFileSync, writeFileSync } from 'fs';
import { dirname, basename, join } from 'path';
import { buildConfig, parseYaml } from './config.js';
import { parseMarkdown } from './parser/markdown.js';
import { extractDirectives } from './parser/directive.js';
import { buildDocument } from './renderer/document.js';

/**
 * Convert a Markdown string to a DOCX buffer.
 *
 * @param {string} md - Markdown content (may include YAML frontmatter)
 * @param {object} opts
 * @param {object} [opts.config]         - Config overrides (lower priority than YAML frontmatter)
 * @param {string} [opts.baseDir]        - Base dir for resolving relative image paths (default: cwd)
 * @param {boolean} [opts.keepMermaidText] - Include mermaid source after diagram image
 * @param {boolean} [opts.splitTall]     - Slice tall mermaid diagrams into page-height images (needs ImageMagick)
 * @returns {Promise<{ buffer: Buffer, warnings: Array<{type: string, message: string}>, meta: { hasMermaid: boolean, hasTallMermaid: boolean } }>}
 */
export async function convert(md, opts = {}) {
  const { baseDir = process.cwd(), config: configOverrides = {}, keepMermaidText = false, splitTall = false } = opts;
  // Config now lives in `@config`/`@doc` comment directives (frontmatter `---` is gone).
  const { configYaml, header, footer } = extractDirectives(md);
  const cfg = buildConfig(configYaml, configOverrides);
  const yamlY = parseYaml(configYaml);
  const blocks = parseMarkdown(md);
  return buildDocument(blocks, cfg, yamlY, { baseDir, keepMermaidText, splitTall, header, footer });
}

/**
 * Convert a Markdown file to a DOCX file.
 *
 * @param {string} inputPath - Path to the .md file
 * @param {object} opts
 * @param {string} [opts.output]          - Output path (default: same dir as input, .docx extension)
 * @param {object} [opts.config]          - Config overrides
 * @param {boolean} [opts.keepMermaidText]
 * @param {boolean} [opts.splitTall]
 * @returns {Promise<{ outputPath: string, warnings: Array<{type: string, message: string}>, meta: { hasMermaid: boolean, hasTallMermaid: boolean } }>}
 */
export async function convertFile(inputPath, opts = {}) {
  const md = readFileSync(inputPath, 'utf8');
  const baseDir = dirname(inputPath);
  const { output, config: configOverrides = {}, keepMermaidText = false, splitTall = false } = opts;

  const { configYaml } = extractDirectives(md);
  const cfg = buildConfig(configYaml, configOverrides);
  const stem = basename(inputPath).replace(/\.[^.]+$/, '');
  const outputPath = output ?? join(baseDir, (cfg.outputFilename || stem) + '.docx');

  const { buffer, warnings, meta } = await convert(md, { baseDir, config: configOverrides, keepMermaidText, splitTall });
  writeFileSync(outputPath, buffer);
  return { outputPath, warnings, meta };
}
