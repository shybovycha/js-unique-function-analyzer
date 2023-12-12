const ts = require("typescript");
const uglify = require('uglify-js');
const fs = require('fs');
const sha256 = require('sha256');

const sourceFilename = process.argv[2];
const outputFilename = process.argv[3] || 'output.json';

console.log(`Reading code from file ${sourceFilename}...`);

const code = fs.readFileSync(sourceFilename).toString();

const minifyOptions = {
    expression: true,
};

console.log('Parsing file...');

const root = ts.createSourceFile(
    sourceFilename,
    code,
    ts.ScriptTarget.ESNext,
    /*setParentNodes */ true
);

const functions = [];

const parse = (node) => {
    if (ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isFunctionDeclaration(node)) {
        const body = code.substring(node.pos, node.end);
        const minCode = uglify.minify(body, minifyOptions);

        functions.push({
            name: node.name && node.name.text,
            code: minCode.code,
            // node,
        });
    }

    ts.forEachChild(node, child => {
        parse(child);
    });
};

parse(root);

console.log('Analyzing file...');

const uniqueFunctions = functions.map((fn) => ({ ...fn, hash: sha256(fn.code) })).reduce((acc, fn) => {
    if (!acc[fn.hash]) {
        acc[fn.hash] = [fn];
    } else {
        acc[fn.hash].push(fn);
    }

    return acc;
}, {});

const analysis = Object.entries(uniqueFunctions).map(([_, duplicates]) => ({ code: duplicates[0].code, duplicates: duplicates.length })).sort((a, b) => b.duplicates - a.duplicates);

console.log(`Found ${functions.length} functions, ${Object.keys(uniqueFunctions).length} are unique (${Math.round((Object.keys(uniqueFunctions).length / functions.length) * 10000.0) / 100}%)`);

fs.writeFileSync(outputFilename, JSON.stringify(analysis, null, '  '), 'utf-8');

console.log(`Wrote analysis results to ${outputFilename}`);
