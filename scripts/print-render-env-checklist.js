#!/usr/bin/env node
/**
 * Prints env keys to set on Render (values from .env.render.example).
 * Usage: node scripts/print-render-env-checklist.js
 */
const fs = require('fs');
const path = require('path');

const example = path.join(__dirname, '..', '.env.render.example');
const text = fs.readFileSync(example, 'utf8');
const keys = [];
text.split('\n').forEach((line) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    const eq = t.indexOf('=');
    if (eq > 0) keys.push(t.slice(0, eq));
});

console.log('Set these in Render → autism-portal → Environment:\n');
keys.forEach((k) => console.log('  -', k));
console.log('\nSee deploy/DEPLOY-RENDER.md for DNS and database steps.');
