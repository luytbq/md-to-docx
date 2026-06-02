import { readFileSync, writeFileSync } from 'fs';
import { dirname, basename, join } from 'path';
import { parseFrontmatter, buildConfig, parseYaml } from './config.js';
import { parseMarkdown } from './parser/markdown.js';
import { buildDocument } from './renderer/document.js';

/**
 * Convert a Markdown string to a DOCX buffer.
 *
 * @param {string} md - Markdown content (may include YAML frontmatter)
 * @param {object} opts
 * @param {object} [opts.config]         - Config overrides (lower priority than YAML frontmatter)
 * @param {string} [opts.baseDir]        - Base dir for resolving relative image paths (default: cwd)
 * @param {boolean} [opts.keepMermaidText] - Include mermaid source after diagram image
 * @returns {Promise<{ buffer: Buffer, warnings: Array<{type: string, message: string}> }>}
 */
export async function convert(md, opts = {}) {
  const { baseDir = process.cwd(), config: configOverrides = {}, keepMermaidText = false } = opts;
  const { yamlRaw, body } = parseFrontmatter(md);
  const cfg = buildConfig(yamlRaw, configOverrides);
  const yamlY = parseYaml(yamlRaw);
  const blocks = parseMarkdown(body);
  return buildDocument(blocks, cfg, yamlY, { baseDir, keepMermaidText });
}

/**
 * Convert a Markdown file to a DOCX file.
 *
 * @param {string} inputPath - Path to the .md file
 * @param {object} opts
 * @param {string} [opts.output]          - Output path (default: same dir as input, .docx extension)
 * @param {object} [opts.config]          - Config overrides
 * @param {boolean} [opts.keepMermaidText]
 * @returns {Promise<{ outputPath: string, warnings: Array<{type: string, message: string}> }>}
 */
export async function convertFile(inputPath, opts = {}) {
  const md = readFileSync(inputPath, 'utf8');
  const baseDir = dirname(inputPath);
  const { output, config: configOverrides = {}, keepMermaidText = false } = opts;

  const { yamlRaw } = parseFrontmatter(md);
  const cfg = buildConfig(yamlRaw, configOverrides);
  const stem = basename(inputPath).replace(/\.[^.]+$/, '');
  const outputPath = output ?? join(baseDir, (cfg.outputFilename || stem) + '.docx');

  const { buffer, warnings } = await convert(md, { baseDir, config: configOverrides, keepMermaidText });
  writeFileSync(outputPath, buffer);
  return { outputPath, warnings };
}
