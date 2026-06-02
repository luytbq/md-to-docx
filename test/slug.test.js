import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../src/parser/slug.js';

test('slugify: basic lowercase + spaces to dashes', () => {
  assert.equal(slugify('Hello World'), 'hello-world');
});

test('slugify: strips punctuation', () => {
  assert.equal(slugify('Section 1: Overview!'), 'section-1-overview');
});

test('slugify: strips inline code backticks and bold/italic markers', () => {
  assert.equal(slugify('Using `convert` and **mmdc**'), 'using-convert-and-mmdc');
});

test('slugify: keeps Vietnamese unicode letters with diacritics', () => {
  assert.equal(slugify('Tổng quan hệ thống'), 'tổng-quan-hệ-thống');
});
